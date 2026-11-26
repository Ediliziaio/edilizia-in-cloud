// A single model slot for the established worker, dossier extraction and review.
// No credentials or request data are persisted in this queue.
let tail=Promise.resolve();
export async function modelSlot(task,signal){
 let release;const previous=tail;tail=new Promise(resolve=>{release=resolve;});
 await previous;
 try{signal?.throwIfAborted();return await task();}finally{release();}
}
