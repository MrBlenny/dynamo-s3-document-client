export function s3BodyBufferToJson(data: any) {
  let Body;
  try {
    Body = JSON.parse(data.Body);
  } catch (e) { }
  return {
    ...data,
    Body,
  };
}
