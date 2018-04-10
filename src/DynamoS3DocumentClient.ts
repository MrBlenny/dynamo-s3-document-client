import * as AWS from 'aws-sdk';
import { get, set, cloneDeep } from 'lodash';
import { checkShouldUseS3 } from './utils/checkShouldUseS3';
import { getObjectFromS3 } from './utils/getObjectFromS3';

export interface IDynamoS3DocumentClientConfig {
  clients: {
    dynamo: AWS.DynamoDB.DocumentClient,
    s3: AWS.S3,
  },
  bucketName: string;
  contentPath?: string; // Path to the content on the 'params.Item'
  s3KeyPath?: string; // Path to the S3Key on the 'params.Item'
  pathPath?: string; // Path to the Path on the 'params.Item' or 'params.Key'
  maxDocumentSize?: number;
};

const transformParams = (params: any, shouldUseS3: boolean, config: IDynamoS3DocumentClientConfig) => {
  const paramsTransformed = cloneDeep(params);

  // If we should use s3, the s3Key and content must be transformed
  if (shouldUseS3) {
    // Set content to null
    set(paramsTransformed.Item, config.contentPath, undefined);
    // Set the s3Key to the path
    set(paramsTransformed.Item, config.s3KeyPath, get(paramsTransformed.item, config.pathPath));
  }

  return paramsTransformed;
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
  config: IDynamoS3DocumentClientConfig;
  constructor(config: IDynamoS3DocumentClientConfig) {
    // Set config and defaults
    this.config = config;
    this.config.contentPath = config.contentPath || 'Content';
    this.config.s3KeyPath = config.s3KeyPath || 'Attributes.S3Key';
    this.config.pathPath = config.pathPath || 'Path';
    this.config.maxDocumentSize = config.maxDocumentSize || 5 * 1024 * 1024;
  }
  // Method Summary
  batchGet(...args) {
    return this.config.clients.dynamo.batchGet(...args);
  }
  batchWrite(...args) {
    return this.config.clients.dynamo.batchWrite(...args);
  }
  createSet(...args) {
    return this.config.clients.dynamo.createSet(...args);
  }
  delete(params) {
    const func = this.config.clients.dynamo.delete(params).promise()
      .then(async (raw) => {
        const dynamoData = raw.Attributes;
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
        return raw;
      });

    func.promise = () => func;
    return func;
  }
  get(params) {
    const func = this.config.clients.dynamo.get(params).promise()
      .then(async (raw) => {
        const dynamoData = raw.Item;
        // Get the S3 key
        const s3Key = get(dynamoData, this.config.s3KeyPath);

        // If the dynamo result has an S3 key, fetch data from S3
        const s3Data = s3Key && await getObjectFromS3(s3Key, this.config);

        // If there is a Body on the S3 data, mutate the dynamo file content
        const s3Content = get(s3Data, 'Body');
        if (s3Content) {
          set(dynamoData, this.config.contentPath, s3Content);
        }

        return raw;
      });


    func.promise = () => func;
    return func;
  }
  put(params) {
    const shouldUseS3 = checkShouldUseS3(params.Item, this.config);
    const paramsTransformed = transformParams(params, shouldUseS3, this.config);
    const func = this.config.clients.dynamo.put(paramsTransformed).promise()
    .then(async (raw) => {
      const dynamoData = raw.Item;
      const content = get(params, ['Item', this.config.contentPath]);
      const path = get(dynamoData, this.config.pathPath);

      const undoSendToDynamo = () => this.delete({
        Key: {
          Path: path,
        },
      });

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

      return raw;
    });

    func.promise = () => func;
    return func;
  }
  query(...args) {
    return this.config.clients.dynamo.query(...args);
  }
  scan(...args) {
    return this.config.clients.dynamo.scan(...args);
  }
  update(...args) {
    return this.config.clients.dynamo.update(...args);
  }
}
