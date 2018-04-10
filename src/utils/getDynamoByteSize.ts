import * as AWS from 'aws-sdk';
import { getByteSize } from './getByteSize';

/**
 * Returns the byte size of any given value after it has been converted to DynamoDB format.
 *
 * @param {any} anything
 * @return {integer}
 */
export function getDynamoByteSize(content: any) {
  return getByteSize(AWS.DynamoDB.Converter.marshall(content));
}
