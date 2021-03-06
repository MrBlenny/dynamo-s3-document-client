declare module 'aws-sdk-mock' {
  type IMockCallback = (error: any, data: any) => null
  type IMockFunc = (parms: any, callback: IMockCallback) => null
  type IMock = (model: string, funcName: string, func: IMockFunc) => any
  type IRestore = (str: string) => any
  type ISetSDKInstance = (args: any) => any

  const mock: IMock
  const restore: IRestore;
  const setSDKInstance: ISetSDKInstance;

  export {
    mock,
    restore,
    setSDKInstance,
  }
}
