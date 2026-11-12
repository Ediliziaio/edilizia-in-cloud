let handler:((req:Request)=>Promise<Response>)|null=null;
export function serve(fn:(req:Request)=>Promise<Response>){handler=fn;}
export function takeHandler(){if(!handler)throw new Error('Handler non registrato');return handler;}
