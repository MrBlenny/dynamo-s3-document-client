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
    this.update = this.config.clients.dynamo.update.bind(this.config.clients.dynamo);
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
  delete(params: AWS.DynamoDB.DocumentClient.DeleteItemInput): AWS.Request<AWS.DynamoDB.DocumentClient.DeleteItemOutput, AWS.AWSError> {
    const dynamoDelete = this.config.clients.dynamo.delete(params);
    const oldPromise = dynamoDelete.promise;
    const config = this.config;
    dynamoDelete.promise = function() {
      return oldPromise.apply(this, arguments).then(async (response: AWS.DynamoDB.DocumentClient.DeleteItemOutput) => {
        const dynamoData = response.Attributes || {};
        // Get the S3 key
        const s3Key = get(dynamoData, config.s3KeyPath);

        // If the dynamo result has an S3 key, fetch data from S3
        const s3Data = s3Key && await getObjectFromS3(s3Key, config);

        // If there is a Body on the S3 data, mutate the dynamo file content
        const s3Content = get(s3Data, 'Body');

        if (s3Content) {
          set(dynamoData, config.contentPath, s3Content);
        }

        // Delete the item from S3
        if (s3Key) {
          await config.clients.s3.deleteObject({
            Bucket: config.bucketName,
            Key: s3Key,
          }).promise();
        }

        // Return the possibly mutated dynamo data
        return response;
      })
    }

    return dynamoDelete
  };

  get(params: AWS.DynamoDB.DocumentClient.GetItemInput): AWS.Request<AWS.DynamoDB.DocumentClient.GetItemOutput, AWS.AWSError> {
    const dynamoGet = this.config.clients.dynamo.get(params);
    const oldPromise = dynamoGet.promise;
    const config = this.config;
    dynamoGet.promise = function() {
      return oldPromise.apply(this, arguments).then(async (response: AWS.DynamoDB.DocumentClient.GetItemOutput) => {
        const dynamoData = response.Item || {};
        // Get the S3 key
        const s3Key = get(dynamoData, config.s3KeyPath);
  
        // If the dynamo result has an S3 key, fetch data from S3
        const s3Data = s3Key && await getObjectFromS3(s3Key, config);
  
        // If there is a Body on the S3 data, mutate the dynamo file content
        const s3Content = get(s3Data, 'Body');
        if (s3Content) {
          set(dynamoData, config.contentPath, s3Content);
        }
  
        return response
      })
    }

    return dynamoGet
  };
  
  put(params: AWS.DynamoDB.DocumentClient.PutItemInput): AWS.Request<AWS.DynamoDB.DocumentClient.PutItemOutput, AWS.AWSError> {
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
    const self = this;
    const oldPromise = dynamoPut.promise;
    dynamoPut.promise = function() {
      return oldPromise.apply(this, arguments).then(async (response: AWS.DynamoDB.DocumentClient.PutItemOutput) => {
        const dynamoData = paramsTransformed.Item || {};
        const content = get(params.Item, self.config.contentPath);
        const path = get(dynamoData, self.config.pathPath);
  
        const undoSendToDynamo = () => self.delete({
          TableName: params.TableName,
          Key: {
            Path: path,
          },
        }).promise().catch();
  
        // Send to S3 if required
        if (shouldUseS3) {
          await self.config.clients.s3.putObject({
            Bucket: self.config.bucketName,
            Key: path,
            Body: JSON.stringify(content),
          }).promise().catch(e => undoSendToDynamo().then(() => {
          // If the S3 fails to save, we must undo the sendToDynamo
          // If this undo fails, the S3-Dyanamo store will be out of sync!
            throw new Error(e); // Throw the original S3 error
          }));
        }
  
        // Resolve the initial callback with the modified dynamoData
        set(dynamoData, self.config.contentPath, content);
  
        return {
          ...response,
          Attributes: dynamoData,
        };
      })
    }

    return dynamoPut
  }
}


