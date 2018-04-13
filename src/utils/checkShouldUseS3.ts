import { IDynamoS3DocumentClientConfigDefaulted } from '../types';

const dynamoMaxDocumentSize = 4 * 1024; // 400 KB - Greater than this, will revert to S3

/**
 * Checks to see if the file is too large for the DynamoDB and should
 * instead be stored in S3. If it is over the S3 limit, an error is thrown.
 *
 * @access private
 * @param opts DynamoDB method call parameters object
 * @returns boolean
 */
export function checkShouldUseS3(documentSize: number, config: IDynamoS3DocumentClientConfigDefaulted) {
  const isOverDynamoLimit = documentSize > dynamoMaxDocumentSize;
  const isOverS3SizeLimit = documentSize > config.maxDocumentSize;

  // Throw an error if the file is too large
  if (isOverS3SizeLimit) {
    throw new Error('Item size has exceeded the maximum allowed size');
  }

  // If it is over the DynamoDB limit but not over the maxDocumentSize we should use S3
  return isOverDynamoLimit;
}
