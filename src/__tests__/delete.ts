import * as awsMock from 'aws-sdk-mock';
import { DynamoS3DocumentClient } from '../DynamoS3DocumentClient';
import * as cryto from 'crypto';

const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document';
const contentSmall = 'small content';
const contentLarge = cryto.randomBytes(400 * 1024);

it('deletes a document (small - dynamo)', async () => {
  awsMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
    return callback(null, {});
  });

  awsMock.mock('DynamoDB.DocumentClient', 'delete', (params, callback) => {
    expect(params.Key).toHaveProperty('Path', path);

    return callback(null, {
      Attributes: {
        Path: params.Key.Path,
        Content: contentSmall,
      },
    });
  });

  const dynamoS3DocumentClient = new DynamoS3DocumentClient({ bucketName });

  const result = await dynamoS3DocumentClient.delete({
    TableName: 'test-table',
    Key: {
      Path: path,
    },
  });

  expect(result).toHaveProperty('Attributes.Path', path);
  expect(result).toHaveProperty('Attributes.Content', contentSmall);
});

it('deletes a document (large - S3)', async () => {
  awsMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
    return callback(null, {});
  });

  awsMock.mock('DynamoDB.DocumentClient', 'delete', (params, callback) => {
    expect(params.Key).toHaveProperty('Path', path);

    return callback(null, {
      Attributes: {
        Path: params.Key.Path,
        Attributes: {
          S3Key: path,
        },
        Content: undefined,
      },
    });
  });

  awsMock.mock('S3', 'getObject', (params, callback) => {
    expect(params).toHaveProperty('Key', path);
    expect(params).toHaveProperty('Bucket', bucketName);
    return callback(null, {
      Body: contentLarge,
    });
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
  });

  expect(result).toHaveProperty('Attributes.Path', path);
  expect(result).toHaveProperty('Attributes.Content', contentLarge);
  expect(result).toHaveProperty('Attributes.Attributes.S3Key', path);
});
