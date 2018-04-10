/**
 * Returns the byte size of any given value.
 *
 * @param {any} anything
 * @return {integer}
 */
export function getByteSize(content: any) {
  const contentString = JSON.stringify(content);
  return Buffer.byteLength(contentString, 'utf8');
}
