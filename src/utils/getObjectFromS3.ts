import { s3BodyBufferToJson } from './s3BodyBufferToJson';
import { IDynamoS3DocumentClientConfigDefaulted } from '../types';

export function getObjectFromS3(s3Key: string, config: IDynamoS3DocumentClientConfigDefaulted) {
  return config.clients.s3.getObject({
    Bucket: config.bucketName,
    Key: s3Key,
  }).promise()
    .then(s3BodyBufferToJson);
}
