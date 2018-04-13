import * as AWS from 'aws-sdk';
import { get, set, cloneDeep } from 'lodash';
import { checkShouldUseS3 } from './utils/checkShouldUseS3';
import { getObjectFromS3 } from './utils/getObjectFromS3';
import { getDynamoByteSize } from './utils/getDynamoByteSize';
import { IDynamoS3DocumentClientConfigDefaulted, IGetNewItem, PromiseMethod } from './types';

export interface IDynamoS3DocumentClientConfig {
  clients?: {
    /** A configured DynamoDB.DocumentClient */
    dynamo?: AWS.DynamoDB.DocumentClient,
    /** A configured S3 Client */
    s3?: AWS.S3,
  },
  /** The name of the bucket to save things to */
  bucketName: string;
  /** Path to the content on the 'params.Item' */
  contentPath?: string;
  /** Path to the S3Key on the 'params.Item' */
  s3KeyPath?: string;
  /** Path to the Path on the 'params.Item' or 'params.Key' */
  pathPath?: string;
  /** Maximum Document size to save to S3 */
  maxDocumentSize?: number;
};

/**
 * The DynamoS3DocumentClient can be treated as though it were just a standard AWS.DynamoDB.DocumentClient
 * as it exposes all the same methods.
 *
 * What it does:
 * - When a file is too large for Dynamo, it is saved in S3
 * - This happens behind the scenes, all you need to do is pass the S3 and Dynamo Clients along with a bucketName
 */
export class DynamoS3DocumentClient {
  constructor(config: IDynamoS3DocumentClientConfig) {
    
    // Set config and defaults
    this.config = {
      ...config,
      clients: {
        dynamo: config.clients && config.clients.dynamo 
          ? config.clients.dynamo 
          : new AWS.DynamoDB.DocumentClient(),
        s3: config.clients && config.clients.s3 
          ? config.clients.s3 
          : new AWS.S3(),
      },
      contentPath: config.contentPath || 'Content',
      s3KeyPath: config.s3KeyPath || 'Attributes.S3Key',
      pathPath: config.pathPath || 'Path',
      maxDocumentSize: config.maxDocumentSize || 5 * 1024 * 1024,
    };
    
    // Default dynamo methods
    this.batchGet = this.config.clients.dynamo.batchGet.bind(this.config.clients.dynamo);
    this.batchWrite = this.config.clients.dynamo.batchWrite.bind(this.config.clients.dynamo);
    this.createSet = this.config.clients.dynamo.createSet.bind(this.config.clients.dynamo);
    this.query = this.config.clients.dynamo.query.bind(this.config.clients.dynamo);
    this.scan = this.config.clients.dynamo.scan.bind(this.config.clients.dynamo);
  }
  config: IDynamoS3DocumentClientConfigDefaulted;

  // Default Dynamo method types
  batchGet: AWS.DynamoDB.DocumentClient['batchGet'];
  batchWrite: AWS.DynamoDB.DocumentClient['batchWrite'];
  createSet: AWS.DynamoDB.DocumentClient['createSet'];
  query: AWS.DynamoDB.DocumentClient['query'];
  scan: AWS.DynamoDB.DocumentClient['scan'];

  /**
   * Updates/patches Dynamo + S3 entries.
   * IMPORTANT: You must pass in 'getNewItem' otherwise S3 will not know how to update.
   */
  update(params: AWS.DynamoDB.DocumentClient.UpdateItemInput, getNewItem: IGetNewItem): PromiseMethod<AWS.DynamoDB.DocumentClient.UpdateItemOutput> {
    const { bucketName: Bucket, contentPath, pathPath, s3KeyPath, clients: { s3, dynamo } } = this.config;
    const { TableName } = params;

    return {
      promise: async () => {
        const getResponse = await this.get(params).promise(); 
        const oldItem = getResponse.Item;
        const newItem = getNewItem(getResponse.Item);
        const oldShouldUseS3 = checkShouldUseS3(getDynamoByteSize(oldItem), this.config);
        const newShouldUseS3 = checkShouldUseS3(getDynamoByteSize(newItem), this.config);
        const Path = get(params.Key, pathPath);
        const newContent = get(newItem, contentPath);

        const getProcessString = () => {
          if (!oldShouldUseS3 && !newShouldUseS3) {
            return 'stays-in-dynamo'
          } else if (!oldShouldUseS3 && newShouldUseS3) {
            return 'move-from-dynamo-to-s3'
          } else if (oldShouldUseS3 && !newShouldUseS3) {
            return 'move-from-s3-to-dynamo'
          } else {
            return 'stays-in-s3'
          }
        }

        const processes = {
          'stays-in-dynamo': () => dynamo.update(params).promise(),
          'stays-in-s3': () => s3.putObject({ Bucket, Key: Path, Body: JSON.stringify(newContent) }).promise(),
          'move-from-dynamo-to-s3': () => {
            const newItemForDynamo = cloneDeep(newItem);
            // Set content to undefined
            set(newItemForDynamo, contentPath, undefined);
            // Set the s3Key to the path
            set(newItemForDynamo, s3KeyPath, get(newItem, pathPath));
            // Send it
            return Promise.all([
              // Delete content from dynamo
              dynamo.put({ TableName, Item: newItemForDynamo }).promise(),
              // Save to S3
              s3.putObject({ Bucket, Key: Path, Body: JSON.stringify(newContent) }).promise()
            ])
          },
          'move-from-s3-to-dynamo': () => {
            const newItemForDynamo = cloneDeep(newItem);
            set(newItemForDynamo, s3KeyPath, undefined);
            return Promise.all([
              // Delete from S3
              s3.deleteObject({ Bucket, Key: Path }).promise(),
              // Save to Dynamo
              dynamo.put({ TableName, Item: newItemForDynamo }).promise()
            ])
          }
        }
        
        // Send the update requests
        try {
          const processString = getProcessString();
          
          await processes[processString]()
        } catch (e) {
          if (Array.isArray(e)) {
            throw e[0]
          } else {
            throw e
          }
        }

        return {
          Attributes: newItem,
        }
      }
    }
  };

  /**
   * Deletes items from Dynamo and also from S3 if a matching item is found.
   */
  delete(params: AWS.DynamoDB.DocumentClient.DeleteItemInput): PromiseMethod<AWS.DynamoDB.DocumentClient.DeleteItemOutput> {
    const { bucketName: Bucket, contentPath, s3KeyPath, clients: { s3 } } = this.config;

    return {
      promise: async () => {
        const response = await this.config.clients.dynamo.delete(params).promise();
        const dynamoData = response.Attributes || {};

        // Get the S3 key
        const s3Key = get(dynamoData, s3KeyPath);

        // If the dynamo result has an S3 key, fetch data from S3
        const s3Data = s3Key && await getObjectFromS3(s3Key, this.config);

        // If there is a Body on the S3 data, mutate the dynamo file content
        const s3Content = get(s3Data, 'Body');

        if (s3Content) {
          set(dynamoData, contentPath, s3Content);
        }

        // Delete the item from S3
        if (s3Key) {
          await s3.deleteObject({ Bucket, Key: s3Key }).promise();
        }

        // Return the possibly mutated dynamo data
        return response;
      }
    }
  };

  /**
   * Gets an item from Dynamo. If an S3Key is found, it will also get the item content from S3.
   */
  get(params: AWS.DynamoDB.DocumentClient.GetItemInput): PromiseMethod<AWS.DynamoDB.DocumentClient.GetItemOutput> {
    const { contentPath, s3KeyPath } = this.config;

    return {
      promise: async () => {
        const response = await this.config.clients.dynamo.get(params).promise();
        const dynamoData = response.Item || {};

        // Get the S3 key
        const s3Key = get(dynamoData, s3KeyPath);

        // If the dynamo result has an S3 key, fetch data from S3
        const s3Data = s3Key && await getObjectFromS3(s3Key, this.config);

        // If there is a Body on the S3 data, mutate the dynamo file content
        const s3Content = get(s3Data, 'Body');
        if (s3Content) {
          set(dynamoData, contentPath, s3Content);
        }
        return response
      }
    }
  };
  
  /**
   * Puts and item to Dynamo. If the size is >400kB, the item content will be saved to S3.
   */
  put(params: AWS.DynamoDB.DocumentClient.PutItemInput): PromiseMethod<AWS.DynamoDB.DocumentClient.PutItemOutput> {
    const { bucketName: Bucket, contentPath, pathPath, clients: { s3, dynamo } } = this.config;
    const documentSize = getDynamoByteSize(params.Item);
    const shouldUseS3 = checkShouldUseS3(documentSize, this.config);

    const transformParams = () => {
      const paramsTransformed = cloneDeep(params);
      // If we should use s3, the s3Key and content must be transformed
      if (shouldUseS3) {
        // Set content to null
        set(paramsTransformed.Item, this.config.contentPath, undefined);
        // Set the s3Key to the path
        set(paramsTransformed.Item, this.config.s3KeyPath, get(paramsTransformed.Item, this.config.pathPath));
      }
      return paramsTransformed;
    };

    return {
      promise: async () => {
        const paramsTransformed = transformParams();
        const response = await dynamo.put(paramsTransformed).promise();
        const dynamoData = paramsTransformed.Item || {};
        const content = get(params.Item, contentPath);
        const path = get(dynamoData, pathPath);
  
        const undoSendToDynamo = () => this.delete({
          TableName: params.TableName,
          Key: {
            Path: path,
          },
        }).promise().catch();
  
        // Send to S3 if required
        if (shouldUseS3) {
          await s3.putObject({ Bucket, Key: path, Body: JSON.stringify(content) }).promise()
            .catch(e => undoSendToDynamo().then(() => {
              // If the S3 fails to save, we must undo the sendToDynamo
              // If this undo fails, the S3-Dyanamo store will be out of sync!
              throw new Error(e); // Throw the original S3 error
            }));
        }
  
        // Resolve the initial callback with the modified dynamoData
        set(dynamoData, contentPath, content);
  
        return {
          ...response,
          Attributes: dynamoData,
        };
      }
    }
  }
}


