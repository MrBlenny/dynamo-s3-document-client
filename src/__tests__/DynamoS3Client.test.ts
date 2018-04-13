import * as awsMock from 'aws-sdk-mock';
import * as AWS from 'aws-sdk';

awsMock.setSDKInstance(AWS);

describe('Confirm all DynamoS3DocumentClient methods work', () => {
  require('./get');
  require('./put');
  require('./delete');
  require('./update');
  afterEach(() => {
    awsMock.restore('DynamoDB.DocumentClient');
    awsMock.restore('S3');
  });
});
