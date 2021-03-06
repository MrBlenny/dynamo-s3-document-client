import * as awsMock from 'aws-sdk-mock';
import * as AWS from 'aws-sdk';
import { DynamoS3DocumentClient } from '../../DynamoS3DocumentClient';
import { createBytesString } from '../../utils/createBytesString';

// Config
const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document-s3';
const content = {
  other: 'data',
  here: createBytesString(400 * 1024), 
};
const newContent = {
  other: 'data',
  here: createBytesString(500 * 1024), 
};

it('updates a document (large - S3)', async () => {
  awsMock.mock('DynamoDB.DocumentClient', 'get', (params: AWS.DynamoDB.DocumentClient.GetItemInput, callback) => {
    const data: AWS.DynamoDB.DocumentClient.GetItemOutput = {
      Item: {
        Path: params.Key.Path,
        Attributes: {
          S3Key: params.Key.Path,
        },
        Content: undefined,
      },
    };
    return callback(null, data);
  });

  awsMock.mock('S3', 'getObject', (params: AWS.S3.GetObjectRequest, callback) => {
    expect(params).toHaveProperty('Key', path);
    expect(params).toHaveProperty('Bucket', bucketName);
    const data: AWS.S3.GetObjectOutput = {
      Body: Buffer.from(JSON.stringify(content), 'utf8'),
    };
    return callback(null, data);
  });

  awsMock.mock('S3', 'putObject', (params: AWS.S3.PutObjectRequest, callback) => {
    const data: AWS.S3.PutObjectOutput = {};
    return callback(null, data);
  });

  const dynamoS3DocumentClient = new DynamoS3DocumentClient({ bucketName });

  const getNewItem = (item: any) => {
    expect(item).toHaveProperty('Content', content);
    return {
      ...item,
      Content: newContent,
    }
  };

  const result = await dynamoS3DocumentClient.update({
    TableName: 'test-table',
    Key: {
      Path: path,
    },
  }, getNewItem).promise();

  expect(result).toHaveProperty('Attributes.Path', path);
  expect(result).toHaveProperty('Attributes.Content', newContent);
});
