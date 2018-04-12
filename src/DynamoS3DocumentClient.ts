import * as AWS from 'aws-sdk';
import { get, set, cloneDeep } from 'lodash';
import { checkShouldUseS3 } from './utils/checkShouldUseS3';
import { getObjectFromS3 } from './utils/getObjectFromS3';
import { getDynamoByteSize } from './utils/getDynamoByteSize';
import { prototype } from 'aws-sdk/clients/cloudwatchevents';

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

export interface IDynamoS3DocumentClientConfigDefaulted {
  clients: {
    dynamo: AWS.DynamoDB.DocumentClient,
    s3: AWS.S3,
  },
  bucketName: string;
  contentPath: string;
  s3KeyPath: string;
  pathPath: string;
  maxDocumentSize: number;
};

export type IGetNewItem = (s3Data: any) => any;

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

  // Modified Methods
  update(params: AWS.DynamoDB.DocumentClient.UpdateItemInput, getNewItem: IGetNewItem) {
    const { bucketName: Bucket, contentPath, pathPath, clients: { s3, dynamo } } = this.config;
    const { TableName } = params;

    return {
      promise: async (): Promise<AWS.DynamoDB.DocumentClient.UpdateItemOutput> => {
        const getResponse = await this.get(params).promise();
        const oldItem = getResponse.Item;
        const newItem = getNewItem(getResponse.Item);
        const oldShouldUseS3 = checkShouldUseS3(getDynamoByteSize(oldItem), this.config);
        const newShouldUseS3 = checkShouldUseS3(getDynamoByteSize(newItem), this.config);
        const Path = get(params.Key, pathPath);
        const newContent = get(newItem, contentPath);
    
        // Create the updateRequests function, we'll use this soon
        const sendUpdateRequests = () => {
          if (!oldShouldUseS3 && !newShouldUseS3) {
            // Save to Dynamo
            return dynamo.update(params)
  
          } else if (!oldShouldUseS3 && newShouldUseS3) {
            // Save from Dynamo -> S3
            return Promise.all([
              // Delete from dynamo
              dynamo.delete(params),
              // Save to S3
              s3.putObject({ Bucket, Key: Path, Body: JSON.stringify(newContent) })
            ]);            
          } else if (oldShouldUseS3 && !newShouldUseS3) {
            // Save from S3 -> Dynamo
            return Promise.all([
              // Delete from S3
              s3.deleteObject({ Bucket, Key: Path }),
              // Save to Dynamo
              dynamo.put({ TableName, Item: newItem })
            ])
          } else {
            // S3 to S3
            return s3.putObject({ Bucket, Key: Path, Body: JSON.stringify(newContent) });
          }
        }

        // Send the update requests
        await sendUpdateRequests()

        return {
          Attributes: newItem,
        }
      }
    }
  };

  delete(params: AWS.DynamoDB.DocumentClient.DeleteItemInput) {
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

  get(params: AWS.DynamoDB.DocumentClient.GetItemInput) {
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
  
  put(params: AWS.DynamoDB.DocumentClient.PutItemInput) {
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


