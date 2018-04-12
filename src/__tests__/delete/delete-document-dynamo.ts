import * as awsMock from 'aws-sdk-mock';
import * as AWS from 'aws-sdk';
import { DynamoS3DocumentClient } from '../../DynamoS3DocumentClient';

const bucketName = 'some-s3-bucket-name';
const path = 'path/to/document';
const contentSmall = 'small content';

it('deletes a document (small - dynamo)', async () => {
  awsMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
    return callback(null, {});
  });

  awsMock.mock('DynamoDB.DocumentClient', 'delete', (params, callback) => {
    expect(params.Key).toHaveProperty('Path', path);
    const data: AWS.DynamoDB.DocumentClient.DeleteItemOutput = {
      Attributes: {
        Path: params.Key.Path,
        Content: contentSmall,
      },
    };
    
    return callback(null, data);
  });

  const dynamoS3DocumentClient = new DynamoS3DocumentClient({ bucketName });

  const result = await dynamoS3DocumentClient.delete({
    TableName: 'test-table',
    Key: {
      Path: path,
    },
  }).promise();

  expect(result).toHaveProperty('Attributes.Path', path);
  expect(result).toHaveProperty('Attributes.Content', contentSmall);
});

