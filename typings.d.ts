declare module 'aws-sdk-mock' {
  type IMockCallback = (error: any, data: any) => null
  type IMockFunc = (parms: any, callback: IMockCallback) => null
  type IMock = (model: string, funcName: string, func: IMockFunc) => any
  type IRestore = (str: string) => any

  const mock: IMock
  const restore: IRestore;

  export {
    mock,
    restore,
  }
}
