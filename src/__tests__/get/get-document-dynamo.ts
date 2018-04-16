import * as awsMock from 'aws-sdk-mock';
import * as AWS from 'aws-sdk';
import { DynamoS3DocumentClient } from '../../DynamoS3DocumentClient';

const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document';
const dynamoContent = 'Dynamo Content';

it('gets a document (dynamo)', async () => {

  if (process.env.TEST_TYPE === 'mock') {
    awsMock.mock('DynamoDB.DocumentClient', 'get', (params: AWS.DynamoDB.DocumentClient.GetItemInput, callback) => {
      expect(params).toHaveProperty('Key.Path', path);
      const data: AWS.DynamoDB.DocumentClient.GetItemOutput = {
        Item: {
          Path: params.Key.Path,
          Content: dynamoContent,
        },
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
  expect(result).toHaveProperty('Item.Content', dynamoContent);
  expect(result).toHaveProperty('Item.Attributes.S3Key', undefined);
});
