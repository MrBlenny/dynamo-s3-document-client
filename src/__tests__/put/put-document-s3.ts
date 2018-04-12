import * as awsMock from 'aws-sdk-mock';
import * as AWS from 'aws-sdk';
import * as cryto from 'crypto';
import { DynamoS3DocumentClient } from '../../DynamoS3DocumentClient';

const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document';
const contentLarge = cryto.randomBytes(400 * 1024);

it('puts a document (large - S3)', async () => {
  awsMock.mock('DynamoDB.DocumentClient', 'get', (params: AWS.DynamoDB.DocumentClient.GetItemInput, callback) => {
    return callback(null, {});
  });

  awsMock.mock('DynamoDB.DocumentClient', 'put', (params: AWS.DynamoDB.DocumentClient.PutItemInput, callback) => {
    expect(params.Item).toHaveProperty('Path', path);
    expect(params.Item).toHaveProperty('Content', undefined);
    expect(params.Item).toHaveProperty('Attributes.S3Key', path);
    const data: AWS.DynamoDB.DocumentClient.PutItemOutput = {
      Attributes: {
        Path: params.Item.Path,
        Attributes: params.Item.Attributes,
        Content: params.Item.Content,
      },
    }
    return callback(null, data);
  });

  awsMock.mock('S3', 'putObject', (params: AWS.S3.PutObjectRequest, callback) => {
    expect(params).toHaveProperty('Key', path);
    expect(params).toHaveProperty('Bucket', bucketName);
    expect(params).toHaveProperty('Body', JSON.stringify(contentLarge));
    const data: AWS.S3.PutObjectOutput = {}
    return callback(null, data);
  });

  const dynamoS3DocumentClient = new DynamoS3DocumentClient({ bucketName });

  const result = await dynamoS3DocumentClient.put({
    TableName: 'test-table',
    Item: {
      Path: path,
      Content: contentLarge,
    },
  }).promise();

  expect(result.Attributes).toHaveProperty('Path', path);
  expect(result.Attributes).toHaveProperty('Content', contentLarge);
  expect(result.Attributes).toHaveProperty('Attributes.S3Key', path);
});
