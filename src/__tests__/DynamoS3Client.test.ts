import * as awsMock from 'aws-sdk-mock';
import * as AWS from 'aws-sdk';

const possibleTestTypes = ['mock', 'integration'];
const testType = process.env.TEST_TYPE || '';

// Check Test Environment Variables
if (!possibleTestTypes.includes(testType)) {
  throw new Error(`process.env.TEST_TYPE must be either 'mock' or 'integration'`)
}

awsMock.setSDKInstance(AWS);

describe(`Test type: ${testType}`, () => {
  require('./put');
  require('./get');
  require('./update');
  require('./delete');
  afterEach(() => {
    if (process.env.TEST_TYPE === 'mock') {
      awsMock.restore('DynamoDB.DocumentClient');
      awsMock.restore('S3');
    }
  });
});
