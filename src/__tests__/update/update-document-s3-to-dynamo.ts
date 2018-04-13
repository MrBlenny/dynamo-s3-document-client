import * as awsMock from 'aws-sdk-mock';
import * as AWS from 'aws-sdk';
import { DynamoS3DocumentClient } from '../../DynamoS3DocumentClient';
import { createBytesString } from '../../utils/createBytesString';

// Config
const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document-s3-to-dynamo';
const content = {
  other: 'data',
  here: createBytesString(400 * 1024), 
};
const newContent = {
  other: 'data',
  here: 'this is some small content so it should save in dynamo', 
};

it('updates a document that becomes small (S3 -> dynamo)', async () => {
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

  awsMock.mock('DynamoDB.DocumentClient', 'put', (params: AWS.DynamoDB.DocumentClient.PutItemInput, callback) => {
    expect(params.Item).toHaveProperty('Path', path);
    expect(params.Item).toHaveProperty('Content', newContent);
    const data: AWS.DynamoDB.DocumentClient.PutItemOutput = {
      Attributes: {
        Path: params.Item.Path,
        Content: newContent,
      },
    }
    return callback(null, data);
  });

  awsMock.mock('S3', 'deleteObject', (params: AWS.S3.DeleteObjectRequest, callback) => {
    const data: AWS.S3.DeleteObjectOutput = {};
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
