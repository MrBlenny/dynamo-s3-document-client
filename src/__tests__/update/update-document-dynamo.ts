import * as awsMock from 'aws-sdk-mock';
import { DynamoS3DocumentClient } from '../../DynamoS3DocumentClient';
import * as AWS from 'aws-sdk';

const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document';
const content = {
  here: 'is-some-content', 
};

it('updates a document (small - dynamo)', async () => {
  awsMock.mock('DynamoDB.DocumentClient', 'get', (params: AWS.DynamoDB.DocumentClient.GetItemInput, callback) => {
    const data: AWS.DynamoDB.DocumentClient.GetItemOutput = {};
    return callback(null, data);
  });

  awsMock.mock('DynamoDB.DocumentClient', 'update', (params: AWS.DynamoDB.DocumentClient.UpdateItemInput, callback) => {
    expect(params.Key).toHaveProperty('Path', path);
    const data: AWS.DynamoDB.DocumentClient.UpdateItemOutput = {
      Attributes: {
        Path: params.Key.Path,
        Attributes: {
          S3Key: path,
        },
        Content: content,
      },
    }
    return callback(null, data);
  });


  const dynamoS3DocumentClient = new DynamoS3DocumentClient({ bucketName });

  const result = await dynamoS3DocumentClient.update({
    TableName: 'test-table',
    Key: {
      Path: path,
    },
  }, item => item).promise();

  expect(result).toHaveProperty('Attributes.Path', path);
  expect(result).toHaveProperty('Attributes.Content', content);
  expect(result).toHaveProperty('Attributes.Attributes.S3Key', path);
});
