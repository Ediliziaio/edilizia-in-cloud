import { describe, it, expect } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as email from "../../../supabase/functions/_shared/automationEmail";
import { automationEmailSampleValues } from "../../../supabase/functions/_shared/automationEmailSamples";
import { resolveAutomationRecord } from "../../../supabase/functions/_shared/automationContext";
import { loadContactCustomFieldResolver, applyContactCustomFields } from "../../../supabase/functions/_shared/contactCustomFields";
import { numeroWhatsApp, senzaSpazioPrimaDellaVirgola } from "../../../supabase/functions/_shared/sequenzaContatto";
import { nomeSaluto, nomeAzienda } from "../../../supabase/functions/_shared/outreach-template";
import { urlGestione } from "../../../supabase/functions/_shared/appuntamentiPubblici";
import { TRIGGER_CATALOG, emailSenzaOggettoOTesto } from "@/lib/flow-node-catalog";
import { buildVariableCategories } from "@/components/flow-builder/config-panels/emailVariableCatalog";

const source = fs.readFileSync("supabase/functions/process-automation/index.ts", "utf8");
const company = "company-test";
const contactId = "00000000-0000-4000-a000-000000000001";
const relatedId = "00000000-0000-4000-a000-000000000002";
const contact = { id: contactId, first_name: "Marco <&>", last_name: "Rossi", email: "marco@example.invalid", phone: "+393331234567", city: "Roma", province: "RM", region: "Lazio", address: "Via Test", postal_code: "00100", company_name: "Test", source: "manual", tags: ["A", "B"], created_at: "2026-09-30", date_of_birth: "1980-01-01" };
type Call = { table: string; steps: any[][] };
const has = (q: Call, method: string) => q.steps.some(s=>s[0]===method);
const eq = (q: Call, key: string) => q.steps.find(s=>s[0]==="eq" && s[1]===key)?.[2];
function db(resolve?: (q: Call) => any) {
  const calls: Call[] = [];
  return { calls, from(table: string) {
    const q: Call = { table, steps: [] };
    const chain: any = new Proxy({}, { get(_, method) {
      if (method === "then") return (ok: any, bad: any) => { calls.push(q); return Promise.resolve(resolve?.(q) ?? { data: table === "marketing_contacts" ? contact : table === "companies" ? { name: "Impresa Test", email: "info@example.invalid", phone: "123" } : [] }).then(ok,bad); };
      return (...args: any[]) => { q.steps.push([method,...args]); return chain; };
    } }); return chain;
  } };
}
function load(name: string, globals: Record<string, any> = {}, from = source): any {
  const ast = ts.createSourceFile("worker.ts",from,ts.ScriptTarget.Latest,true);
  const declaration = ast.statements.find(n=>ts.isFunctionDeclaration(n) && n.name?.text===name)!;
  const js = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return vm.runInNewContext(`${js};${name}`, { ...email, exports: {}, Date, Set, Map, String, Number, Response, FormData, Blob, console: { log(){}, warn(){}, error(){} },
    fetch: () => { throw new Error("NETWORK FORBIDDEN"); }, UUID_RE: /^[0-9a-f-]{36}$/i,
    resolveAutomationRecord, loadContactCustomFieldResolver, applyContactCustomFields, numeroWhatsApp, nomeSaluto, nomeAzienda, senzaSpazioPrimaDellaVirgola, automationEmailSampleValues, ...globals });
}
const appointmentVars = load("variabiliAppuntamento", { urlGestione, APP_ORIGINE_PUBBLICA: "https://example.invalid", GIORNI_IT: ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"], MESI_IT: ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"] });
const resolveText = load("resolveContactText", { variabiliAppuntamento: appointmentVars });
const visibleKeys = [...new Set(TRIGGER_CATALOG.flatMap(t=>buildVariableCategories([], t.id).flatMap(c=>c.variables.map(v=>v.key))))].filter(key=>key!=="unsubscribe_url");

describe("automation email variable contract", () => {
  it("every offered standard variable has a synthetic preview, including unsubscribe", () => {
    const text = [...visibleKeys, "unsubscribe_url"].map(key => `{{${key}}}`).join(" | ");
    const result = email.renderEmailSample(text, automationEmailSampleValues(new Date("2026-09-30T23:30:00Z")), true);
    expect(result.missing).toEqual([]);
    expect(result.text).not.toContain("{{");
    expect(result.text).toContain("01/10/2026");
    expect(result.text).toContain("example.invalid");
  });
  it.each(visibleKeys)("every offered variable resolves: %s", async key => {
    const record: Record<string,any> = { id: relatedId };
    for (const fields of Object.values(email.EMAIL_RECORD_FIELDS)) for (const field of fields) record[field] = `value-${field}`;
    Object.assign(record, { id: relatedId, appointment_date: "2026-10-06", appointment_time: "09:30", appointment_end_time: "10:00", value: 0, total: 0 });
    const mock = db(q=>["marketing_custom_fields","marketing_contact_field_values"].includes(q.table) ? { data: [] } : q.table === "companies" ? { data: {name:"Impresa Test",email:"info@example.invalid",phone:"123"} } : q.table === "marketing_contacts" ? {data: contact} : { data: record });
    const rendered = await resolveText(mock, `{{${key}}}`, contact, company, { strict: true, entityId: contactId, queueItem: { entity_type: "contact", context_json: { payload: { opportunity_id: relatedId, appointment_id: relatedId, order_id: relatedId, quote_id: relatedId, invoice_id: relatedId, task_id: relatedId, ticket_id: relatedId } } } });
    expect(rendered).not.toContain("{{"); expect(String(rendered).length).toBeGreaterThan(0);
    for (const q of mock.calls.filter(q=>q.table!=="companies" && !q.table.endsWith("field_values"))) expect(eq(q,"company_id")).toBe(company);
  });
  it("removes unrelated, technical and internal fields from the email picker", () => {
    const keys = buildVariableCategories([],"contatto_creato").flatMap(c=>c.variables.map(v=>v.key));
    expect(keys).not.toContain("opportunita.name"); expect(keys).not.toContain("appuntamento.internal_notes");
    expect(keys.some(k=>k.endsWith(".id") || k.endsWith("_id"))).toBe(false);
  });
  it("escapes HTML values but not plain-text subjects", async () => {
    const html = await resolveText(db(),"<p>{{contatto.first_name}}</p>",contact,company,{html:true,strict:true});
    expect(html).toBe("<p>Marco &lt;&amp;&gt;</p>");
    expect(await resolveText(db(),"{{contatto.first_name}}",contact,company,{strict:true})).toBe(contact.first_name);
  });
  it("appointment fields use the exact event appointment and keep contact ID intact", async () => {
    const mock = db(q=>q.table === "appointments" ? { data: {id:relatedId,appointment_date:"2026-10-06",appointment_time:"09:30",title:"Exact"} } : {data:[]});
    const value = await resolveText(mock,"{{contatto.id}} {{appuntamento.title}} {{appointment.time}}",contact,company,{ strict:true, entityId: contactId, queueItem:{context_json:{payload:{appointment_id:relatedId}}} });
    expect(value).toBe(`${contactId} Exact 09:30`); expect(eq(mock.calls.find(q=>q.table==="appointments")!,"id")).toBe(relatedId);
  });
  it("stable custom key survives renames and does not interpret replacement dollar tokens", async () => {
    const fieldId = "00000000-0000-4000-a000-000000000003";
    const mock = db(q=>({data:q.table==="marketing_custom_fields" ? [{id:fieldId,name:"Renamed field",deleted_at:null}] : [{contact_id:contactId,field_id:fieldId,value:"$& <test>"}]}));
    expect(await resolveText(mock,`{{${email.emailCustomFieldKey(fieldId)}}}`,contact,company,{html:true,strict:true})).toBe("$&amp; &lt;test&gt;");
  });
  it("a custom field named Email cannot override the contact email; stable custom ID still works", async () => {
    const fieldId = "00000000-0000-4000-a000-000000000003";
    const mock = db(q=>({data:q.table==="marketing_custom_fields" ? [{id:fieldId,name:"Email",deleted_at:null}] : [{contact_id:contactId,field_id:fieldId,value:"custom@example.invalid"}]}));
    const rendered = await resolveText(mock,`{{contatto.email}} / {{contact.email}} / {{${email.emailCustomFieldKey(fieldId)}}}`,contact,company,{strict:true});
    expect(rendered).toBe(`${contact.email} / ${contact.email} / custom@example.invalid`);
  });
  it("custom fields with the same name remain distinct by their stable ID", async () => {
    const fieldIds = ["00000000-0000-4000-a000-000000000003","00000000-0000-4000-a000-000000000004"];
    const mock = db(q=>({data:q.table==="marketing_custom_fields" ? fieldIds.map(id=>({id,name:"Colore",deleted_at:null as null})) : fieldIds.map((field_id,i)=>({contact_id:contactId,field_id,value:i===0?"Bianco":"Grigio"}))}));
    expect(await resolveText(mock,fieldIds.map(id=>`{{${email.emailCustomFieldKey(id)}}}`).join(" / "),contact,company,{strict:true})).toBe("Bianco / Grigio");
  });
  it("custom field database failures block sending instead of inventing empty values", async () => {
    await expect(resolveText(db(()=>({error:new Error("database offline")})),"{{contact.custom_test}}",contact,company,{strict:true})).rejects.toThrow("database offline");
  });
  it.each(["<p></p>","<p><br></p>","<p>&nbsp;</p>","\u200b"])("empty editor HTML is not publishable: %s", corpo=>{
    expect(email.emailContentEmpty(corpo)).toBe(true); expect(emailSenzaOggettoOTesto("invia_email",{oggetto:"Subject",corpo})).toBe(true);
  });
  it("legacy template keys are accepted by publication validation",()=>expect(emailSenzaOggettoOTesto("send_email",{template_id:relatedId})).toBe(false));
  it("clearing visible fields or detaching a template overrides stale legacy values",()=>{
    expect(email.normalizeAutomationEmailConfig({oggetto:"",email_subject:"Old",modello_id:"",template_id:relatedId})).toMatchObject({email_subject:"",template_id:""});
    expect(emailSenzaOggettoOTesto("invia_email",{oggetto:"",email_subject:"Old",corpo:"<p>Body</p>"})).toBe(true);
  });
  it("preview preserves and lists unknown placeholders rather than hiding them",()=>{
    expect(email.renderEmailSample("{{known}} {{missing}}",{known:"<&>"},true)).toEqual({text:"&lt;&amp;&gt; {{missing}}",missing:["missing"]});
  });
  it.each([[0,"minuti",0],[2,"ore",7200000],[1,"giorni",86400000]])("email delay %s %s",(n,unit,expected)=>expect(email.automationEmailDelayMs({ritardo_valore:n,ritardo_unita:unit})).toBe(expected));
  it.each([-1,"foo",1.5])("rejects invalid email delay %s",n=>expect(()=>email.automationEmailDelayMs({ritardo_valore:n})).toThrow());
});

function sender(overrides: Record<string,any> = {}) {
  const sent: any[] = []; const charged: any[] = []; const branded: any[] = [];
  const fn = load("executeSendEmail", {
    resolveContactText: resolveText, caricaContestoCommessa: async():Promise<null>=>null,
    loadProviderSettings: async()=>({provider:"resend",apiKey:"mock",fromDefault:"noreply@example.invalid"}),
    getSuppressedEmailMap: async()=>new Map(), normalizeEmailAddress:(s:string)=>s.toLowerCase(),
    mittenteDelPasso:()=>({}),mittenteDelFlusso:async():Promise<null>=>null, sanitizeFromName:(s:string)=>s,
    resolveSender:async()=>({from:"noreply@example.invalid"}),getReplyAddress:async():Promise<null>=>null,
    brandEmailBody:async(_db:any,id:string,html:string)=>{branded.push(id);return {html:`<div class="brand">${html}</div>`,text:"text"};},
    Deno:{env:{get:()=>"https://example.invalid"}},appendTrackingSig:async(url:string)=>url,
    deductEmailCredits:async(...args:any[])=>{charged.push(args);},addEmailCredits:async()=>{},
    sendViaProviderWithFailover:async(...args:any[])=>{sent.push(args);return {ok:true,status:200,providerUsed:"resend"};},
    logEmailDelivery:async()=>{},mittenteRifiutatoDalProvider:()=>false,invioEmailDaRimandare:()=>false,
    soloIndirizzo:(s:string)=>s,fetch:async()=>new Response("{}"),...overrides,
  });
  return {fn,sent,charged,branded};
}
const emailConfig = {email_subject:"Ciao {{contatto.first_name}}",email_body:"<p>Ciao {{contatto.first_name}}</p>", stream:"transactional"};
describe("email delivery preparation, only simulated providers",()=>{
  it("connected mailbox replaces spaced unsubscribe token and retains sender name",async()=>{
    const delivered:any[]=[];
    const s=sender({mittenteDelPasso:()=>({nome:"Team"}),inviaDaCasellaAzienda:async(_db:any,p:any)=>{delivered.push(p);return {success:true};}});
    expect((await s.fn(db(),{...emailConfig,casella_id:relatedId,email_body:'<p>Test <a href="{{ unsubscribe_url }}">Esci</a></p>'},contactId,company,{})).success).toBe(true);
    expect(delivered[0].fromName).toBe("Team");expect(delivered[0].html).toContain("automation_unsub");expect(delivered[0].html).not.toContain("{{");
  });
  it("renders subject and HTML correctly, applies company branding and forwards CC",async()=>{
    const s=sender();const mock=db(q=>q.table==="marketing_contacts" && has(q,"in")?{data:[]}:undefined);
    expect((await s.fn(mock,{...emailConfig,cc:"CC@example.invalid, cc@example.invalid"},contactId,company,{})).success).toBe(true);
    expect(s.sent).toHaveLength(1);expect(s.sent[0][2]).toMatchObject({cc:["cc@example.invalid"],subject:`Ciao ${contact.first_name}`});
    expect(s.sent[0][2].html).toContain("Marco &lt;&amp;&gt;");expect(s.branded).toEqual([company]);
  });
  it.each([
    {email_subject:"",email_body:"<p>Hello</p>"},
    {email_body:"<p><br></p>"},
    {email_body:"<p>{{not_supported.anything}}</p>"},
    {email_to:"not-an-email"},
    {cc:"bad-address"},
    {casella_id:"missing-uuid"},
    {template_id:relatedId,email_body:"<p>Old copy must not send</p>"},
  ])("invalid configuration never sends or charges: %j",async patch=>{
    const s=sender();const result=await s.fn(db(),{...emailConfig,...patch},contactId,company,{});
    expect(result.success).toBe(false);expect(s.sent).toHaveLength(0);expect(s.charged).toHaveLength(0);
  });
  it("template is authoritative and hidden A/B values cannot override it",async()=>{
    const s=sender();const mock=db(q=>q.table==="email_templates"?{data:{subject:"Template subject",html_content:"<p>Template body</p>"}}:undefined);
    expect((await s.fn(mock,{...emailConfig,template_id:relatedId,oggetto_b:"Stale B",corpo_b:"Stale body"},contactId,company,{})).success).toBe(true);
    expect(s.sent[0][2].subject).toBe("Template subject");expect(s.sent[0][2].html).toContain("Template body");
    expect(eq(mock.calls.find(q=>q.table==="email_templates")!,"company_id")).toBe(company);
  });
  it("marketing credit failure prevents provider calls",async()=>{
    const s=sender({deductEmailCredits:async()=>{throw new Error("insufficient credit");}});
    expect((await s.fn(db(),{...emailConfig,stream:"marketing"},contactId,company,{})).success).toBe(false);expect(s.sent).toHaveLength(0);
  });
  it("opted-out explicit recipient never receives email",async()=>{
    const s=sender();const mock=db(q=>has(q,"ilike")?{data:[{id:relatedId,email:"other@example.invalid",optout_email:true}]}:undefined);
    expect((await s.fn(mock,{...emailConfig,email_to:"other@example.invalid"},contactId,company,{})).success).toBe(false);expect(s.sent).toHaveLength(0);
  });
  it("missing invoice attachment prevents a misleading email",async()=>{
    const s=sender({caricaContestoCommessa:async()=>({contatto:contact,variabili:{},fattura:null as null}),sostituisciVariabiliCommessa:(t:string)=>t});
    expect((await s.fn(db(),{...emailConfig,allega_fattura_commessa:true},relatedId,company,{entity_type:"order"})).success).toBe(false);expect(s.sent).toHaveLength(0);
  });
});

describe("provider CC payloads without networking",()=>{
  const providerSource = fs.readFileSync("supabase/functions/_shared/emailProvider.ts","utf8");
  it.each(["resend","sendgrid","brevo","elastic_email","mailgun","smtp"])("forwards CC through %s",async provider=>{
    const calls:any[]=[];
    const send=load("sendViaProvider",{
      extractEmail:(s:string)=>s,extractName:():undefined=>undefined,btoa:(s:string)=>Buffer.from(s).toString("base64"),
      fetchWithRetry:async(url:string,request:any)=>{calls.push({url,body:request.body instanceof FormData ? request.body : JSON.parse(request.body)});return new Response(JSON.stringify({id:"test"}),{status:200});},
      smtpSend:async(_config:any,message:any)=>{calls.push({body:message});return {messageId:"test"};},
    },providerSource);
    const result=await send(provider,"test-key",{from:"sender@example.invalid",to:[contact.email],cc:["copy@example.invalid"],subject:"Test",html:"<p>Test</p>"},{domain:"example.invalid",stream:"transactional",smtp:{}});
    expect(result.ok).toBe(true);expect(calls).toHaveLength(1);
    const body=calls[0].body;
    const cc=provider==="sendgrid"?body.personalizations[0].cc:provider==="elastic_email"?body.Recipients.CC:provider==="mailgun"?body.getAll("cc"):body.cc;
    expect(JSON.stringify(cc)).toContain("copy@example.invalid");
  });
  it("unsupported marketing CC fails explicitly without changing the email stream",async()=>{
    const send=load("sendViaProvider",{extractEmail:(s:string)=>s,extractName:():undefined=>undefined},providerSource);
    const result=await send("elastic_email","test",{from:"sender@example.invalid",to:[contact.email],cc:["copy@example.invalid"],subject:"Test",html:"<p>Test</p>"},{stream:"marketing"});
    expect(result.ok).toBe(false);expect(result.status).toBe(400);
  });
});

describe("preview endpoint: company scope and no implicit sending",()=>{
  const previewSource=fs.readFileSync("supabase/functions/automation-email-render/index.ts","utf8");
  function previewHarness(denied=false){
    const sends:any[]=[];const brands:any[]=[];const checks:any[]=[];
    const admin={auth:{getUser:async()=>({data:{user:{id:contactId,email:"me@example.invalid"}}})}};
    const fn=load("handleAutomationEmailRender",{
      getCorsHeaders:()=>({}),Deno:{env:{get:()=>"test"}},createClient:()=>admin,
      requireCompanyAccess:async(_db:any,_user:string,id:string)=>{checks.push(id);if(denied)throw new Response("Forbidden",{status:403});},
      brandEmailBody:async(_db:any,id:string,html:string)=>{brands.push(id);return {html,text:"test"};},
      sendEmailUnified:async(p:any)=>{sends.push(p);return {ok:true};},
    },previewSource);
    return {fn,sends,brands,checks};
  }
  const request=(mode="preview")=>new Request("https://example.invalid",{method:"POST",headers:{Authorization:"Bearer fake"},body:JSON.stringify({mode,company_id:company,oggetto:"Test",corpo:"<p>{{contatto.first_name}} {{custom.missing}}</p>"})});
  it("preview is read-only, branded for the authorized company, with missing-variable feedback",async()=>{
    const h=previewHarness();const res=await h.fn(request());const body=await res.json();
    expect(body.ok).toBe(true);expect(body.missingVariables).toEqual(["custom.missing"]);expect(h.sends).toHaveLength(0);expect(h.brands).toEqual([company]);expect(h.checks).toEqual([company]);
  });
  it("cross-company access is rejected before rendering or sending",async()=>{
    const h=previewHarness(true);expect((await h.fn(request("test"))).status).toBe(403);expect(h.sends).toHaveLength(0);expect(h.brands).toHaveLength(0);
  });
  it("explicit test mode can only target the authenticated user",async()=>{
    const h=previewHarness();expect((await h.fn(request("test"))).status).toBe(200);expect(h.sends[0]).toMatchObject({companyId:company,to:"me@example.invalid"});
  });
});
