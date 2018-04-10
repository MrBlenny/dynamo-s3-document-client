# Dynamo S3 Document Client

This is just like `AWS.DynamoDB.DocumentClient` from the `aws-sdk` but saves oversize files to AWS. DynamoDB will saves files up to 400B, any files larger than this will be saved in S3.

### Example

To create a client with the following functionality.
* Item <= 400kB *Save to DynamoDB*
* Item > 400KB and <= maxDocumentSize *Save to S3*
* Item > maxDocumentSize *Reject, don't save*

```ts
import { DynamoS3DocumentClient } from 'dynamo-s3-document-client';
import * as AWS from 'aws-sdk';
import * as crypto from 'cryto';

const dynamoS3DocumentClient = new DynamoS3DocumentClient({
  clients: {
    dynamo: new AWS.DynamoDB.DocumentClient(),
    s3: new AWS.S3,
  },
  bucketName: 'the-name-of-an-s3-bucket',
  maxDocumentSize: 10 * 1024 * 1024, // 10MB max
})

// Use this just like you would AWS.DynamoDB.DocumentClient

// Save the a small file (this will save to DynamoDB)
await dynamoS3DocumentClient.put({
  Item: {
    Path: 'path/of/the/file',
    Attributes: {},
    Content: {
      here: 'is where your content goes',
    }
  }
}).promise()
  .then(console.log);

// Read the small file
await dynamoS3DocumentClient.get({
  Key: {
    Path: 'path/of/the/file',
  }
}).promise()
  .then(console.log);

// Save a large file (this will save the Content to S3 and the Path, Attributes to Dynamo)
await dynamoS3DocumentClient.put({
  Item: {
    Path: 'path/of/the/file',
    Attributes: {},
    Content: crypto.randomBytes(1 * 1024 * 1024)
  }
}).promise()
  .then(console.log);

// Read the large file
await dynamoS3DocumentClient.get({
  Key: {
    Path: 'path/of/the/file',
  }
}).promise()
  .then(console.log);

```
