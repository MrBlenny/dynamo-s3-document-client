# Dynamo S3 Document Client

[![CircleCI](https://circleci.com/gh/MrBlenny/dynamo-s3-document-client.svg?style=svg)](https://circleci.com/gh/MrBlenny/dynamo-s3-document-client)

This is almost identical to `AWS.DynamoDB.DocumentClient` from the `aws-sdk` but saves oversize files to AWS. There are a few minor differences which are documented below.

DynamoDB will saves files up to 400kB, any files larger than this will be saved in S3.

## Install
`npm i dynamo-s3-document-client` or `yarn add dynamo-s3-document-client`

## Method Support / Differences

This lib wraps the basic `AWS.DynamoDB.DocumentClient` methods by adding calls to `S3` as needed.

- [x] delete
- [x] get
- [x] put
- [x] config (no changed needed)
- [x] createSet (no changed needed)
- [x] query (no changed needed)
- [x] update - **Must pass in `getNewItem` function**
- [ ] batchGet
- [ ] batchWrite

#### Important note about `update`

Update requires intepreting dynamoDB's `UpdateExpression`. This is pretty difficult and I have not yet figured out how to do it... So, instead of doing this, you must pass in a `getNewItem`. This is used instead of `UpdateExpression` when determining how the update affects an item saved in S3.

## Date Assumptions

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

The names of these keys can be modified using configuration passed in to the `DynamoS3DocumentClient` constructor. Nonetheless, the all need to be children of the Item.

## Configuration

You can configure custom clients, paths, buckets, sizes etc.
The real type definition is available in: [IDynamoS3DocumentClientConfig](./src/DynamoS3DocumentClient.ts)


```ts
export interface IDynamoS3DocumentClientConfig {
  clients?: {
    /** A configured DynamoDB.DocumentClient */
    dynamo?: AWS.DynamoDB.DocumentClient,
    /** A configured S3 Client */
    s3?: AWS.S3,
  },
  /** The name of the bucket to save things to */
  bucketName: string;
  /** Path to the content on the 'params.Item' */
  contentPath?: string;
  /** Path to the S3Key on the 'params.Item' */
  s3KeyPath?: string;
  /** Path to the Path on the 'params.Item' or 'params.Key' */
  pathPath?: string;
  /** Maximum Document size to save to S3 */
  maxDocumentSize?: number;
  /** Debug console logs */
  debug?: boolean;
};
```

## Example

To create a client with the following functionality.
* Item <= 400kB - **Save to DynamoDB**
* Item > 400KB and <= maxDocumentSize - **Save to S3**
* Item > maxDocumentSize  - **Reject, don't save**

```ts
import { DynamoS3DocumentClient } from 'dynamo-s3-document-client';

// Create a Client.
const dynamoS3DocumentClient = new DynamoS3DocumentClient({
  bucketName: 'the-name-of-an-s3-bucket',
  maxDocumentSize: 10 * 1024 * 1024, // 10MB max
})

```

### Save a large file.
This will save the 'Content' to S3 and the'Path', 'Attributes' to Dynamo.

```ts
await dynamoS3DocumentClient.put({
  TableName: 'test-table',
  Item: {
    Path: 'path/of/the/file',
    Attributes: {},
    Content: crypto.randomBytes(1 * 1024 * 1024)
  }
}).promise()
  .then(console.log);

```

### Get a file.

This will get the 'Path' and 'Attributes' from Dynamo and the content from S3.

```ts
await dynamoS3DocumentClient.get({
  TableName: 'test-table',
  Key: {
    Path: 'path/of/the/file',
  }
}).promise()
  .then(console.log);
```

### Update a file.

This will get the 'Path' and 'Attributes' from Dynamo and the content from S3.

```ts
const getNewItem = currentItem => ({
  ...currentItem,
  here: 'is some new content',
})

const params = {
  TableName: 'test-table',
  Key: {
    Path: 'path/of/the/file',
    Attributes: {},
    Content: {
      other: 'data',
      here: 'is-some-content-to-be-saved-in-dynamo', 
    },
  }
  UpdateExpression: 'SET here = :c',
  ExpressionAttributeValues: {
    ':c': { S: 'is some new content' },
  },
  ReturnValues: 'ALL_NEW',
}

await dynamoS3DocumentClient.update(params, getNewItem).promise()
  .then(console.log);


```

## Development

* Publish using `yarn run publish`
* Test using `yarn test`
* Build dist with `yarn build`