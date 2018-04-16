import * as awsMock from 'aws-sdk-mock';
import * as AWS from 'aws-sdk';
import { DynamoS3DocumentClient } from '../../DynamoS3DocumentClient';

const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document';
const contentSmall = 'small content';

it('puts a document (small - dynamo)', async () => {

  if (process.env.TEST_TYPE === 'mock') {
    awsMock.mock('DynamoDB.DocumentClient', 'get', (params: AWS.DynamoDB.DocumentClient.GetItemInput, callback) => {
      return callback(null, {});
    });
  
    awsMock.mock('DynamoDB.DocumentClient', 'put', (params: AWS.DynamoDB.DocumentClient.PutItemInput, callback) => {
      expect(params.Item).toHaveProperty('Path', path);
      expect(params.Item).toHaveProperty('Content', contentSmall);
      const data: AWS.DynamoDB.DocumentClient.PutItemOutput = {
        Attributes: {
          Path: params.Item.Path,
          Attributes: params.Item.Attributes,
          Content: params.Item.Content,
        },
      }
      return callback(null, data);
    });
  }

  const dynamoS3DocumentClient = new DynamoS3DocumentClient({ bucketName });

  const result = await dynamoS3DocumentClient.put({
    TableName: 'test-table',
    Item: {
      Path: path,
      Content: contentSmall,
    },
  }).promise();

  expect(result.Attributes).toHaveProperty('Path', path);
  expect(result.Attributes).toHaveProperty('Content', contentSmall);
});
