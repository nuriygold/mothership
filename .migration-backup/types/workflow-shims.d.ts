declare module 'workflow/api' {
  const api: any;
  export = api;
}

declare module 'workflow/runtime' {
  const runtime: any;
  export = runtime;
}

declare module 'workflow' {
  export const createHook: any;
  export const sleep: any;
  export class FatalError extends Error {}
}

declare module '@workflow/ai/agent' {
  export const DurableAgent: any;
}
