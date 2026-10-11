/** Stored internal demo conversations only: no WhatsApp, mentions, or push. */
import {C,A,YEAR,AS_OF,MARK,uid,q,sql,guard,read,insert,plan,stamp} from './demo-company-history.mjs';
guard();const d=read('before'),jobs=read('business-manifest').orders,batches=[];
const members=[A,...d.members.filter(u=>u.role==='company_staff').map(u=>u.user_id)].slice(0,3);
if(d.chatTriggers.some(t=>/internal_chat_messages/i.test(t.definition)&&!/tg_campo_chat_push|notify_order_channel_mentions/.test(t.body)))throw Error('Unexpected outbound chat trigger: review before seeding');
for(const o of jobs){
  const channel=uid('chat-'+o.id),created=o.invoices?.[0]?.date||o.start;
  const s=[insert('internal_chat_channels',{id:channel,company_id:C,order_id:o.id,name:`DEMO · ${o.code}`,description:MARK+' Conversazione fittizia, nessun messaggio effettivamente inviato.',type:'group',created_by:A,is_dm:false,is_private:true,is_system:false,created_at:stamp(created),updated_at:stamp(created)})];
  for(const user of members)s.push(insert('internal_chat_members',{id:uid('member-'+channel+'-'+user),channel_id:channel,user_id:user,company_id:C,role:user===A?'admin':'member',joined_at:stamp(created),last_read_at:stamp(AS_OF),is_muted:true,notification_pref:'none'}));
  const lines=[
    [o.start,`Piano squadra ${o.model}: avvio della commessa ${o.code}. Capitoli, importi e date nel preventivo collegato.`],
    [o.start,'Materiali ricevuti e DDT confrontato con l’ordine di acquisto. Consumabili e articoli installati saranno tracciati nei rapportini.'],
    [o.dates[19],'Verifica SAL intermedio: lavorazioni controllate, ore confrontate con le presenze. Nessun pagamento aggiuntivo generato dalla chat.'],
    [o.end,'Controllo finale eseguito nella simulazione. Collaudo e documenti disponibili in commessa; nessuna firma o certificazione reale.'],
  ];
  for(const [i,[date,content]]of lines.entries())if(date<=AS_OF)s.push(insert('internal_chat_messages',{id:uid('message-'+channel+'-'+i),channel_id:channel,company_id:C,sender_id:members[i%members.length],content:'[MESSAGGIO FITTIZIO DEMO] '+content,created_at:stamp(date,['08:15:00','09:20:00','16:10:00','16:30:00'][i]),updated_at:stamp(date),message_type:'text',is_edited:false,is_pinned:false}));
  s.push(`do $$begin if exists(select 1 from internal_chat_messages m where m.company_id=${q(C)} and m.channel_id=${q(channel)} and (cardinality(m.mentions)>0 or m.created_at::date>${q(AS_OF)}::date)) then raise exception 'Unsafe demo chat';end if;end $$;`);
  batches.push(s);
}
plan('chat',batches,{company:C,year:YEAR,channels:jobs.length,externalMessages:0,complete:false});
