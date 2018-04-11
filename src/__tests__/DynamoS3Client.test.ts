import * as awsMock from 'aws-sdk-mock';

describe('Confirm all DynamoS3DocumentClient methods work', () => {
  require('./get');
  require('./put');
  require('./delete');
  afterEach(() => {
    awsMock.restore('DynamoDB.DocumentClient');
    awsMock.restore('S3');
  });
});
