/** Analisi bancaria: proposte di sempre, esiti con regola e motivi e, solo dove l'interruttore
 * comune del collegamento automatico è acceso, conferma degli esiti «unico e verificato»
 * (docs/automazioni-tesoreria-cdg.md). Per le fatture importate la conferma porta «esterne»:
 * qui si allinea il gestionale esterno con billing-payment-push «allinea_banca», che usa il
 * valore assoluto del server (un retry non somma due volte). */
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {cronSecretValido} from "../_shared/cronAuth.ts";
import {serveConMetricheRapida} from "../_shared/withMetricsRapida.ts";
import {requireAuth,requireCompanyAccess} from "../_shared/auth.ts";
import {getCorsHeaders,jsonResponse,errorResponse} from "../_shared/headers.ts";
import {aziendeDelGiro,classificaALotti,LOTTO_CLASSIFICA,TEMPO_GIRO_MS,TETTO_AZIENDE_GIRO,TETTO_MOVIMENTI_AZIENDA,type AziendaDaClassificare} from "./giroClassifica.ts";
serveConMetricheRapida("bank-auto-reconcile",async(req)=>{
 const headers=getCorsHeaders(req);if(req.method==="OPTIONS")return new Response(null,{headers});
 try {
  const body=await req.json().catch(()=>({}));const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cron=cronSecretValido(req);let client=admin;let company=typeof body.company_id==="string"?body.company_id:null;
  if(!cron){
   const {userId,supabaseAdmin}=await requireAuth(req,headers);
   if(!company)return errorResponse("Seleziona un’azienda",400,headers);
   await requireCompanyAccess(supabaseAdmin,userId,company,headers);
   client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:req.headers.get("Authorization")!}}});
  }
  // Tutte le aziende con movimenti aperti recenti, non solo le collegate: chi carica l'estratto a
  // mano non veniva mai classificato. Ordine, rotazione e tetti in giroClassifica.ts.
  let companies:string[]=[];
  if(company)companies=[company];else{
   const daClassificare=await admin.rpc("tesoreria_aziende_da_classificare",{p_giorni:180,p_limite:TETTO_AZIENDE_GIRO});
   if(daClassificare.error)throw new Error("Impossibile leggere le aziende da verificare");
   const collegate:string[]=[];
   for(let offset=0;;offset+=1000){
    const {data,error}=await admin.from("bank_connections").select("company_id").in("status",["active","linked"]).order("id").range(offset,offset+999);
    if(error)throw new Error("Impossibile leggere le aziende da verificare");collegate.push(...(data??[]).map(r=>r.company_id));if(!data||data.length<1000)break;
   }
   companies=aziendeDelGiro(daClassificare.data as AziendaDaClassificare[]|null,collegate,TETTO_AZIENDE_GIRO+collegate.length);
  }
  let proposals=0;const errors:string[]=[];const classified:Record<string,unknown>[]=[];const confirmed:Record<string,unknown>[]=[];
  const fineClassifica=Date.now()+TEMPO_GIRO_MS;
  for(const id of companies){
   const {data,error}=await client.rpc("bank_suggerisci_riconciliazioni",{p_company:id});
   if(error){errors.push(`${id}: ${error.message}`);continue;}proposals+=Number(data??0);
   // Esiti con regola e motivi (docs/automazioni-tesoreria-cdg.md): classifica, non registra denaro.
   // A lotti da 5: 100 in una chiamata superavano gli 8 secondi di PostgREST e tornavano indietro.
   const esiti=await classificaALotti(limite=>client.rpc("tesoreria_classifica_movimenti",{p_company:id,p_limite:limite,p_anteprima:false}),
    {lotto:LOTTO_CLASSIFICA,tetto:TETTO_MOVIMENTI_AZIENDA,tempoScaduto:()=>Date.now()>fineClassifica});
   if(esiti.errore)errors.push(`${id}: esiti ${esiti.errore}`);
   classified.push({company_id:id,...esiti});
   // Conferma automatica: solo dove l'azienda l'ha accesa, per conto di chi l'ha autorizzata.
   const conferme=await client.rpc("tesoreria_conferma_automatica",{p_company:id,p_limite:50});
   // Un errore delle conferme non salta i riallineamenti arretrati qui sotto.
   if(conferme.error)errors.push(`${id}: conferme ${conferme.error.message}`);else confirmed.push({company_id:id,...(conferme.data as Record<string,unknown>)});
   const confermatiEsterne=((conferme.data as {confermati?:{transaction_id?:string;esterne?:{invoice_id?:string}[]}[]}|null)?.confermati??[]).filter(c=>(c.esterne??[]).length>0);
   // La data del pagamento su Fatture in Cloud è quella del movimento in banca, non quella del giro.
   const date=new Map<string,string>();
   if(confermatiEsterne.length){
    const {data:righe}=await admin.from("bank_transactions").select("id,booking_date").in("id",confermatiEsterne.map(c=>c.transaction_id!).filter(Boolean));
    for(const r of righe??[])if(r.booking_date)date.set(r.id,r.booking_date);
   }
   const nuove=confermatiEsterne.flatMap(c=>(c.esterne??[]).map(e=>({invoice_id:e.invoice_id,transaction_id:c.transaction_id,paid_date:c.transaction_id?date.get(c.transaction_id):undefined})));
   // Più quelle rimaste indietro nei giri precedenti: il gestionale si allinea al valore assoluto del
   // server, quindi riprovare non somma due volte.
   const {data:arretrate}=await admin.rpc("tesoreria_riallineo_da_fare",{p_company:id,p_limite:20});
   const daFare=new Map<string,{invoice_id:string;transaction_id?:string;paid_date?:string}>();
   for(const a of (arretrate as {invoice_id:string;paid_date?:string|null}[]|null)??[])daFare.set(a.invoice_id,{invoice_id:a.invoice_id,paid_date:a.paid_date??undefined});
   for(const e of nuove)if(e.invoice_id)daFare.set(e.invoice_id,{invoice_id:e.invoice_id,transaction_id:e.transaction_id,paid_date:e.paid_date});
   for(const e of daFare.values()){
    const r=await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/billing-payment-push`,{method:"POST",
     headers:{"Content-Type":"application/json",Authorization:`Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`},
     body:JSON.stringify({invoice_id:e.invoice_id,azione:"allinea_banca",...(e.paid_date?{paid_date:e.paid_date}:{})})}).catch(()=>null);
    const esito=r?await r.json().catch(()=>null) as {ok?:boolean;skipped?:boolean;messaggio?:string}|null:null;
    if(esito&&(esito.ok||esito.skipped)){await admin.rpc("tesoreria_riallineo_risolto",{p_company:id,p_invoice:e.invoice_id});continue;}
    const messaggio=esito?.messaggio??"gestionale esterno non raggiungibile";
    await admin.rpc("tesoreria_riallineo_segna",{p_company:id,p_invoice:e.invoice_id,p_tx:e.transaction_id??null,p_paid_date:e.paid_date??null,p_errore:messaggio});
    errors.push(`${id}: gestionale esterno da riallineare per la fattura ${e.invoice_id} (${messaggio})`);
   }
  }
  return jsonResponse({success:errors.length===0,review_required:true,auto_matched:0,costs_matched:0,pending_review:proposals,proposals_created:proposals,esiti:classified,conferme:confirmed,errors},200,headers);
 }catch(e){if(e instanceof Response)return e;return errorResponse(e instanceof Error?e.message:"Analisi non riuscita",500,headers);}
});
