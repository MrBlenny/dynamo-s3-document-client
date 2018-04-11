export function s3BodyBufferToJson(data: any) {
  let Body;
  try {
    Body = data.Body
    Body = JSON.parse(Body);
  } catch (e) { }
  return {
    ...data,
    Body,
  };
}
