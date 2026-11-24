// Only contexts already verified by auth.getUser + tenant membership enter here.
// Credentials stay in memory. Existing jobs share the newest authenticated context.
const expiry=token=>{try{return Number(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).exp)||0;}catch{return 0;}};
export function sessionContexts(){
 const contexts=new Map();
 return{accept(verified){const key=verified.userId+':'+verified.companyId,old=contexts.get(key);if(!old){contexts.set(key,verified);return verified;}
  if(expiry(verified.token)>=expiry(old.token))Object.assign(old,verified);
  else Object.assign(old,{role:verified.role,company:verified.company});
  return old;
 }};
}
