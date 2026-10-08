// NO database, network or real messages: only synthetic fixtures.
export const useAuth=()=>({effectiveCompany:{id:"test-company"}});
export const useModelliEmail=()=>({data:[{id:"test-template",name:"Conferma demo",subject:"Conferma per {{contatto.first_name}}",html_content:"<p>Ciao {{contatto.first_name}},</p><p>Confermiamo il tuo appuntamento.</p>",folder:"Demo"}],isLoading:false,isError:false});
export const supabase={
  from(table:string){const rows=table==="marketing_custom_fields"?[{id:"abc123",name:"Email referente",field_type:"email"},{id:"def456",name:"Preferenza finitura",field_type:"text"}]:table==="email_oauth_connections"?[{id:"test-mailbox",email_address:"ufficio@example.invalid",status:"active"}]:[];const chain:any=new Proxy({},{get(_,method){if(method==="then")return(resolve:any)=>Promise.resolve({data:rows,error:null}).then(resolve);if(!["select","eq","is","order"].includes(String(method)))throw new Error("Scritture vietate nel collaudo");return()=>chain;}});return chain;},
  functions:{invoke:async(_name:string,{body}:any)=>body.mode!=="preview"?{error:new Error("Invio reale disabilitato nel collaudo")}: {data:{ok:true,html:`<h2>Impresa demo — anteprima simulata</h2>${String(body.corpo).replaceAll("{{contatto.first_name}}","Marco")}`,subject:String(body.oggetto).replaceAll("{{contatto.first_name}}","Marco"),missingVariables:[]},error:null}},
};
