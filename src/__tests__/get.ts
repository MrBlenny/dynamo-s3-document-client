import * as AWS from 'aws-sdk';
import * as awsMock from 'aws-sdk-mock';
import { DynamoS3DocumentClient } from '../DynamoS3DocumentClient';

const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document';
const s3Content = 'S3 Content';
const dynamoContent = 'Dynamo Content';

it('gets a document (dynamo)', async () => {
  awsMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
    expect(params).toHaveProperty('Key.Path', path);
    return callback(null, {
      Item: {
        Path: params.Key.Path,
        Content: dynamoContent,
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

  const result = await DynamoS3DocumentClient.get({
    Key: {
      Path: path,
    },
  });

  expect(result).toHaveProperty('Item.Path', path);
  expect(result).toHaveProperty('Item.Content', dynamoContent);
  expect(result).toHaveProperty('Item.Attributes.S3Key', undefined);
});

it('gets a document (S3)', async () => {
  awsMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
    expect(params).toHaveProperty('Key.Path', path);
    return callback(null, {
      Item: {
        Path: params.Key.Path,
        Content: dynamoContent,
        Attributes: {
          S3Key: path,
        },
      },
    });
  });

  awsMock.mock('S3', 'getObject', (params, callback) => {
    expect(params).toHaveProperty('Key', path);
    expect(params).toHaveProperty('Bucket', bucketName);
    return callback(null, {
      Body: Buffer.from(JSON.stringify(s3Content), 'utf8'),
    });
  });

  const dynamoS3DocumentClient = new DynamoS3DocumentClient({
    clients: {
      dynamo: new AWS.DynamoDB.DocumentClient(),
      s3: new AWS.S3(),
    },
    bucketName,
  });

  const result = await dynamoS3DocumentClient.get({
    Key: {
      Path: path,
    },
  });

  expect(result).toHaveProperty('Item.Path', path);
  expect(result).toHaveProperty('Item.Content', s3Content);
  expect(result).toHaveProperty('Item.Attributes.S3Key', path);
});
