import * as AWS from 'aws-sdk';

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
  debug: boolean;
};

export type IGetNewItem = (s3Data: any) => any;

export interface PromiseMethod<T> {
  promise: () => Promise<T>,
};