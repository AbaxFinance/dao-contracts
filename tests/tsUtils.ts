export type ReturnPromiseType<T extends (...args: any) => any> = T extends (...args: any[]) => PromiseLike<infer R> ? R : any;
