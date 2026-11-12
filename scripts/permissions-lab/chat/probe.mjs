import{createClient}from'@supabase/supabase-js';
const n=Number(process.argv[2]??1);const c=createClient('http://127.0.0.1:5189','local-fixture',{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await c.auth.signInWithPassword({email:`u${n}@example.test`,password:'LocalePermessi2026!'});if(error)throw error;
const channel=await c.rpc('ensure_user_silvio_channel');console.log('channel',channel);if(channel.error)process.exit(1);
const id=typeof channel.data==='string'?channel.data:channel.data?.id;
const r=await fetch('http://127.0.0.1:5189/functions/v1/silvio-chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({channel_id:id,message:process.argv[3]??'Riepiloga le commesse'})});console.log(r.status,await r.text());
