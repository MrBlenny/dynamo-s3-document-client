import { s3BodyBufferToJson } from './s3BodyBufferToJson';
import { IDynamoS3DocumentClientConfig } from '../DynamoS3DocumentClient';

export function getObjectFromS3(s3Key: string, config: IDynamoS3DocumentClientConfig) {
  return config.clients.s3.getObject({
    Bucket: config.bucketName,
    Key: s3Key,
  }).promise()
    .then(s3BodyBufferToJson);
}
