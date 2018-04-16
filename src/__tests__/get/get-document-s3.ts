import * as awsMock from 'aws-sdk-mock';
import * as AWS from 'aws-sdk';
import { DynamoS3DocumentClient } from '../../DynamoS3DocumentClient';

const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document';
const s3Content = 'S3 Content';
const dynamoContent = 'Dynamo Content';

it('gets a document (S3)', async () => {
  
  if (process.env.TEST_TYPE === 'mock') {
    awsMock.mock('DynamoDB.DocumentClient', 'get', (params: AWS.DynamoDB.DocumentClient.GetItemInput, callback) => {
      expect(params).toHaveProperty('Key.Path', path);
      const data: AWS.DynamoDB.DocumentClient.GetItemOutput = {
        Item: {
          Path: params.Key.Path,
          Content: dynamoContent,
          Attributes: {
            S3Key: path,
          },
        },
      }
      return callback(null, data);
    });
  
    awsMock.mock('S3', 'getObject', (params: AWS.S3.GetObjectRequest, callback) => {
      expect(params).toHaveProperty('Key', path);
      expect(params).toHaveProperty('Bucket', bucketName);
      const data: AWS.S3.GetObjectOutput = {
        Body: Buffer.from(JSON.stringify(s3Content), 'utf8'),
      };
      return callback(null, data);
    });
  }

  const dynamoS3DocumentClient = new DynamoS3DocumentClient({ bucketName });

  const result = await dynamoS3DocumentClient.get({
    TableName: 'test-table',
    Key: {
      Path: path,
    },
  }).promise();

  expect(result).toHaveProperty('Item.Path', path);
  expect(result).toHaveProperty('Item.Content', s3Content);
  expect(result).toHaveProperty('Item.Attributes.S3Key', path);
});
