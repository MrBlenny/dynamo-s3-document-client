import * as AWS from 'aws-sdk';
import { get, set, cloneDeep } from 'lodash';
import { checkShouldUseS3 } from './utils/checkShouldUseS3';
import { getObjectFromS3 } from './utils/getObjectFromS3';

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
        s3:config.clients && config.clients.s3 
        ? config.clients.s3 
        : new AWS.S3(),
      },
      contentPath: config.contentPath || 'Content',
      s3KeyPath: config.s3KeyPath || 'Attributes.S3Key',
      pathPath: config.pathPath || 'Path',
      maxDocumentSize: config.maxDocumentSize || 5 * 1024 * 1024,
    };

    // Default dynamo methods
    this.batchGet = this.config.clients.dynamo.batchGet;
    this.batchWrite = this.config.clients.dynamo.batchWrite;
    this.createSet = this.config.clients.dynamo.createSet;
    this.query = this.config.clients.dynamo.query;
    this.scan = this.config.clients.dynamo.scan;
    this.update = this.config.clients.dynamo.update;
  }

  // Default Dynamo method types
  config: IDynamoS3DocumentClientConfigDefaulted;
  batchGet: AWS.DynamoDB.DocumentClient['batchGet'];
  batchWrite: AWS.DynamoDB.DocumentClient['batchWrite'];
  createSet: AWS.DynamoDB.DocumentClient['createSet'];
  query: AWS.DynamoDB.DocumentClient['query'];
  scan: AWS.DynamoDB.DocumentClient['scan'];
  update: AWS.DynamoDB.DocumentClient['update'];

  // Modified Methods
  delete = (params: AWS.DynamoDB.DocumentClient.DeleteItemInput) => {
    const dynamoDelete = this.config.clients.dynamo.delete(params);
    const dynamoDeletePromise = dynamoDelete.promise
    dynamoDelete.promise = () => dynamoDeletePromise().then(async (response) => {
      const dynamoData = response.Attributes || {};
      // Get the S3 key
      const s3Key = get(dynamoData, this.config.s3KeyPath);

      // If the dynamo result has an S3 key, fetch data from S3
      const s3Data = s3Key && await getObjectFromS3(s3Key, this.config);

      // If there is a Body on the S3 data, mutate the dynamo file content
      const s3Content = get(s3Data, 'Body');
      if (s3Content) {
        set(dynamoData, this.config.contentPath, s3Content);
      }

      // Delete the item from S3
      if (s3Key) {
        await this.config.clients.s3.deleteObject({
          Bucket: this.config.bucketName,
          Key: s3Key,
        }).promise();
      }

      // Return the possibly mutated dynamo data
      return response;
    })

    return dynamoDelete
  }
  get(params: AWS.DynamoDB.DocumentClient.GetItemInput) {
    const dynamoGet = this.config.clients.dynamo.get(params);
    const dynamoGetPromise = dynamoGet.promise;
    dynamoGet.promise = () => dynamoGetPromise().then(async (response) => {
      const dynamoData = response.Item || {};
      // Get the S3 key
      const s3Key = get(dynamoData, this.config.s3KeyPath);

      // If the dynamo result has an S3 key, fetch data from S3
      const s3Data = s3Key && await getObjectFromS3(s3Key, this.config);

      // If there is a Body on the S3 data, mutate the dynamo file content
      const s3Content = get(s3Data, 'Body');
      if (s3Content) {
        set(dynamoData, this.config.contentPath, s3Content);
      }

      return response
    })

    return dynamoGet
  }
  put(params: AWS.DynamoDB.DocumentClient.PutItemInput) {
    const shouldUseS3 = checkShouldUseS3(params.Item, this.config);
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
    const paramsTransformed = transformParams();
    const dynamoPut = this.config.clients.dynamo.put(paramsTransformed);
    const dynamoPutPromise = dynamoPut.promise;
    dynamoPut.promise = () => dynamoPutPromise().then(async (response) => {
      const dynamoData = response.Attributes || {};
      const content = get(params.Item, this.config.contentPath);
      const path = get(dynamoData, this.config.pathPath);

      const undoSendToDynamo = () => this.delete({
        TableName: params.TableName,
        Key: {
          Path: path,
        },
      }).promise();

      // Send to S3 if required
      if (shouldUseS3) {
        await this.config.clients.s3.putObject({
          Bucket: this.config.bucketName,
          Key: path,
          Body: JSON.stringify(content),
        }).promise().catch(e => undoSendToDynamo().then(() => {
        // If the S3 fails to save, we must undo the sendToDynamo
        // If this undo fails, the S3-Dyanamo store will be out of sync!
          throw new Error(e); // Throw the original S3 error
        }));
      }

      // Resolve the initial callback with the modified dynamoData
      set(dynamoData, this.config.contentPath, content);

      return response;
    })

    return dynamoPut
  }
}


