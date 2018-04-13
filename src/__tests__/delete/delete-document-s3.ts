import * as awsMock from 'aws-sdk-mock';
import { DynamoS3DocumentClient } from '../../DynamoS3DocumentClient';
import * as crypto from 'crypto';
import * as AWS from 'aws-sdk';

const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document';
const contentLarge = crypto.randomBytes(400 * 1024);

it('deletes a document (large - S3)', async () => {
  awsMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
    return callback(null, {});
  });

  awsMock.mock('DynamoDB.DocumentClient', 'delete', (params: AWS.DynamoDB.DocumentClient.DeleteItemInput, callback) => {
    expect(params.Key).toHaveProperty('Path', path);
    const data: AWS.DynamoDB.DocumentClient.DeleteItemOutput = {
      Attributes: {
        Path: params.Key.Path,
        Attributes: {
          S3Key: path,
        },
        Content: undefined,
      },
    }
    return callback(null, data);
  });

  awsMock.mock('S3', 'getObject', (params: AWS.S3.GetObjectRequest, callback) => {
    expect(params).toHaveProperty('Key', path);
    expect(params).toHaveProperty('Bucket', bucketName);
    const data: AWS.S3.GetObjectOutput = {
      Body: contentLarge,
    };
    return callback(null, data);
  });

  awsMock.mock('S3', 'deleteObject', (params, callback) => {
    expect(params).toHaveProperty('Key', path);
    expect(params).toHaveProperty('Bucket', bucketName);

    return callback(null, {});
  });

  const dynamoS3DocumentClient = new DynamoS3DocumentClient({ bucketName });


  const result = await dynamoS3DocumentClient.delete({
    TableName: 'test-table',
    Key: {
      Path: path,
    },
  }).promise();

  expect(result).toHaveProperty('Attributes.Path', path);
  expect(result).toHaveProperty('Attributes.Content', contentLarge);
  expect(result).toHaveProperty('Attributes.Attributes.S3Key', path);
});
