import * as awsMock from 'aws-sdk-mock';
import { DynamoS3DocumentClient } from '../../DynamoS3DocumentClient';
import * as AWS from 'aws-sdk';

// Config
const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document-dynamo';
const content = {
  here: 'is-some-content-to-be-saved-in-dynamo', 
};
const newContent = {
  here: 'is some new content', 
};
const dynamoExpressions = {
  UpdateExpression: 'SET here = :c',
  ExpressionAttributeValues: {
    ':c': { S: 'is some new content' },
  },
  ReturnValues: 'ALL_NEW',
};

it('updates a document (small - dynamo)', async () => {
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
  
    awsMock.mock('DynamoDB.DocumentClient', 'update', (params: AWS.DynamoDB.DocumentClient.UpdateItemInput, callback) => {
      expect(params).toHaveProperty('UpdateExpression', dynamoExpressions.UpdateExpression);
      expect(params).toHaveProperty('ExpressionAttributeValues', dynamoExpressions.ExpressionAttributeValues);
      expect(params.Key).toHaveProperty('Path', path);
      const data: AWS.DynamoDB.DocumentClient.UpdateItemOutput = {
        Attributes: {
          Path: params.Key.Path,
          Attributes: {
            S3Key: path,
          },
          Content: newContent,
        },
      }
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
