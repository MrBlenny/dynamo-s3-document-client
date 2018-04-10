import * as AWS from 'aws-sdk';
import * as awsMock from 'aws-sdk-mock';
import * as cryto from 'crypto';
import { DynamoS3DocumentClient } from '../DynamoS3DocumentClient';

const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document';
const contentSmall = 'small content';
const contentLarge = cryto.randomBytes(400 * 1024);

it('puts a document (small - dynamo)', async () => {
  awsMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
    return callback(null, {});
  });

  awsMock.mock('DynamoDB.DocumentClient', 'put', (params, callback) => {
    expect(params.Item).toHaveProperty('Path', path);
    expect(params.Item).toHaveProperty('Content', contentSmall);

    return callback(null, {
      Item: {
        Path: params.Item.Path,
        Attributes: params.Item.Attributes,
        Content: params.Item.Content,
      },
    });
  });

  const DynamoS3DocumentClient = new DynamoS3DocumentClient({
    clients: {
      dynamo: new AWS.DynamoDB.DocumentClient(),
      s3: new AWS.S3(),
    },
    bucketName,
  });

  const result = await DynamoS3DocumentClient.put({
    Key: {
      Path: path,
    },
    Item: {
      Path: path,
      Content: contentSmall,
    },
  });

  expect(result).toHaveProperty('Item.Path', path);
  expect(result).toHaveProperty('Item.Content', contentSmall);
});

it('puts a document (large - S3)', async () => {
  awsMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
    return callback(null, {});
  });

  awsMock.mock('DynamoDB.DocumentClient', 'put', (params, callback) => {
    expect(params.Item).toHaveProperty('Path', path);
    expect(params.Item).toHaveProperty('Content', undefined);
    expect(params.Item).toHaveProperty('Attributes.S3Key', path);

    return callback(null, {
      Item: {
        Path: params.Item.Path,
        Attributes: params.Item.Attributes,
        Content: params.Item.Content,
      },
    });
  });

  awsMock.mock('S3', 'putObject', (params, callback) => {
    expect(params).toHaveProperty('Key', path);
    expect(params).toHaveProperty('Bucket', bucketName);
    expect(params).toHaveProperty('Body', JSON.stringify(contentLarge));

    return callback(null, {
      Body: Buffer.from(params.Body, 'utf8'),
    });
  });

  const DynamoS3DocumentClient = new DynamoS3DocumentClient({
    clients: {
      dynamo: new AWS.DynamoDB.DocumentClient(),
      s3: new AWS.S3(),
    },
    bucketName,
  });

  const result = await DynamoS3DocumentClient.put({
    Key: {
      Path: path,
    },
    Item: {
      Path: path,
      Content: contentLarge,
    },
  });

  expect(result).toHaveProperty('Item.Path', path);
  expect(result).toHaveProperty('Item.Content', contentLarge);
  expect(result).toHaveProperty('Item.Attributes.S3Key', path);
});
