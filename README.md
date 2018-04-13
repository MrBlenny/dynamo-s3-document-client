# Dynamo S3 Document Client

[![CircleCI](https://circleci.com/gh/MrBlenny/dynamo-s3-document-client.svg?style=svg)](https://circleci.com/gh/MrBlenny/dynamo-s3-document-client)

This is just like `AWS.DynamoDB.DocumentClient` from the `aws-sdk` but saves oversize files to AWS. 

DynamoDB will saves files up to 400kB, any files larger than this will be saved in S3.

## Install
`npm i dynamo-s3-document-client` or `yarn add dynamo-s3-document-client`

## Method Support

This lib wraps the basic `AWS.DynamoDB.DocumentClient` methods by adding calls to `S3` as needed.

- [x] delete
- [x] get
- [x] put
- [x] config (no changed needed)
- [ ] batchGet
- [ ] batchWrite
- [x] createSet (no changed needed)
- [x] query (no changed needed)
- [x] update - **Must pass in `getNewItem` function**

#### Important note about `update`
Update requires intepreting dynamoDB's `UpdateExpression`. This is pretty difficult. In addition to `UpdateExpression` this method requires a `getNewItem` function to be passed in. This is used instead of `UpdateExpression` when determining how the update affects an item saved in S3.

## Notes about usage

In order to use this you'll need to have a nested object format where the bulk of your content is on one Key. For example:

```js
Item: {
  // Saved in Dynamo (Item < 400kB), Saved in S3 (Item > 400kB)
  Content: 'This is where the large content goes - it can be any format', 
  // Saved in Dynamo
  Attributes: {}, 
  // Saved in Dynamo
  Path: '', 
}
```

The names of these keys can be modified using configuration passed in to the `DynamoS3DocumentClient` constructor.

## Example

To create a client with the following functionality.
* Item <= 400kB - **Save to DynamoDB**
* Item > 400KB and <= maxDocumentSize - **Save to S3**
* Item > maxDocumentSize  - **Reject, don't save**

```ts
import { DynamoS3DocumentClient } from 'dynamo-s3-document-client';
import * as crypto from 'crypto';

// Create a client that can save files up to 10MB.
const dynamoS3DocumentClient = new DynamoS3DocumentClient({
  bucketName: 'the-name-of-an-s3-bucket',
  maxDocumentSize: 10 * 1024 * 1024, // 10MB max
})

// Save a large file (this will save the Content to S3 and the Path, Attributes to Dynamo)
await dynamoS3DocumentClient.put({
  TableName: 'test-table',
  Item: {
    Path: 'path/of/the/file',
    Attributes: {},
    Content: crypto.randomBytes(1 * 1024 * 1024)
  }
}).promise()
  .then(console.log);

// Read the large file
await dynamoS3DocumentClient.get({
  TableName: 'test-table',
  Key: {
    Path: 'path/of/the/file',
  }
}).promise()
  .then(console.log);

```

## Configuration
[IDynamoS3DocumentClientConfig](./src/DynamoS3DocumentClient.ts)

## Development

Publish using `yarn run publish`
Test using `yarn test`
Build dist with `yarn build`