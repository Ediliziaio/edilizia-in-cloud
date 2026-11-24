let flushCurrent: (()=>Promise<boolean>) | undefined;
export function registerLocalLeaveGuard(flush:()=>Promise<boolean>){flushCurrent=flush;return()=>{if(flushCurrent===flush)flushCurrent=undefined;};}
export async function flushLocalDraft(){return flushCurrent?flushCurrent():true;}
