export interface IS3BodyBufferToJson {
  Body: any
}

export function s3BodyBufferToJson(data: IS3BodyBufferToJson) {
  let Body = data.Body;
  try {
    Body = JSON.parse(Body);
  } catch (e) { }
  return {
    ...data,
    Body,
  };
}
