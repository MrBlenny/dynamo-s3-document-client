import * as awsMock from 'aws-sdk-mock';
import * as AWS from 'aws-sdk';
import { DynamoS3DocumentClient } from '../../DynamoS3DocumentClient';
import { createBytesString } from '../../utils/createBytesString';

// Config
const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document-dynamo-to-s3';
const content = {
  other: 'data',
  here: 'is-some-content-to-be-saved-in-dynamo', 
};
const newContent = {
  other: 'data',
  here: createBytesString(400 * 1024), 
};
const dynamoExpressions = {
  UpdateExpression: 'SET here = :c',
  ExpressionAttributeValues: {
    ':c': { B: newContent.here },
  },
  ReturnValues: 'ALL_NEW',
};

it('updates a document that becomes large (dynamo -> S3)', async () => {
  
  if (process.env.TEST_TYPE === 'mock') {
    awsMock.mock('DynamoDB.DocumentClient', 'get', (params: AWS.DynamoDB.DocumentClient.GetItemInput, callback) => {
      const data: AWS.DynamoDB.DocumentClient.GetItemOutput = {
        Item: {
          Path: params.Key.Path,
          Content: content,
        },
      };
      return callback(null, data);
    });
  
    awsMock.mock('DynamoDB.DocumentClient', 'put', (params: AWS.DynamoDB.DocumentClient.PutItemInput, callback) => {
      expect(params.Item).toHaveProperty('Path', path);
      expect(params.Item.Attributes).toHaveProperty('S3Key', path);
      expect(params.Item.Content).toBeUndefined();
      const data: AWS.DynamoDB.DocumentClient.PutItemOutput = {
        Attributes: {
          Path: params.Item.Path,
          Attributes: {
            S3Key: path,
          },
          Content: undefined,
        },
      }
      return callback(null, data);
    });
  
    awsMock.mock('S3', 'putObject', (params: AWS.S3.PutObjectRequest, callback) => {
      const data: AWS.S3.PutObjectOutput = {};
      return callback(null, data);
    });
  }

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
    ...dynamoExpressions,
  }, getNewItem).promise();

  expect(result).toHaveProperty('Attributes.Path', path);
  expect(result).toHaveProperty('Attributes.Content', newContent);
});
