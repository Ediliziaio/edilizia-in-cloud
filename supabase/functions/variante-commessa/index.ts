import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { prepareVariation, validateVariationWorkspace, variationDraftPublicTerms, variationProposalPdf, variationPdfFilename } from "./_render.mjs";

const bucket = "order-variation-documents";
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
const sha = async (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).buffer))).map(x => x.toString(16).padStart(2,"0")).join("");
const safeFileName = (value: string) => value.replace(/[\r\n/\\]/g,"_").slice(0,180);

Deno.serve(async req => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null,{headers:cors});
  if (req.method !== "POST") return errorResponse("Metodo non consentito",405,cors);
  try {
    if (Number(req.headers.get("content-length") ?? 0)>15*1024*1024) return errorResponse("File troppo grande",413,cors);
    const raw = await req.text();
    if (raw.length>15*1024*1024) return errorResponse("File troppo grande",413,cors);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("Richiesta non valida",400,cors);

    // The only unauthenticated operation is a download scoped by a valid, unexpired proposal token.
    if (body.action === "public_open") {
      if (!uuid(body.token)) return errorResponse("Link non valido",404,cors);
      const admin = createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
      const {data:view,error:viewError} = await admin.rpc("odv_view_by_token",{p_token:body.token});
      if (viewError || view?.valid!==true || !view?.has_document || !uuid(view.id)) return errorResponse("Documento non disponibile o link scaduto",404,cors);
      const {data:variation,error:varError} = await admin.from("ordini_variazione").select("id,current_document_id,status").eq("id",view.id).eq("firma_token",body.token).single();
      if (varError || !variation?.current_document_id) return errorResponse("Documento non disponibile",404,cors);
      const {data:document,error:docError} = await admin.from("order_variation_documents").select("*").eq("id",variation.current_document_id).eq("variation_id",variation.id).single();
      if (docError || !document) return errorResponse("Documento non disponibile",404,cors);
      let path=document.pdf_path, name=document.pdf_name;
      if (body.file_id && body.file_id!=="proposal") {
        const file=(document.attachments ?? []).find((item: {id:string})=>item.id===body.file_id);
        if (!file) return errorResponse("Allegato non presente nella proposta",404,cors);
        path=file.path;name=file.name;
      }
      const {data:file,error:fileError} = await admin.storage.from(bucket).download(path);
      const expected=path===document.pdf_path?document.document_hash:document.attachments.find((item: {path:string})=>item.path===path)?.hash;
      if (fileError || !file || !expected || await sha(await file.arrayBuffer())!==expected) return errorResponse("Integrità del documento non verificata",409,cors);
      const {data:url,error:urlError} = await admin.storage.from(bucket).createSignedUrl(path,300,{download:safeFileName(name)});
      if (urlError || !url?.signedUrl) return errorResponse("Download non disponibile",500,cors);
      return jsonResponse({success:true,url:url.signedUrl,name:safeFileName(name),hash:expected},200,cors);
    }

    const {userId,supabaseAdmin:admin} = await requireAuth(req,cors);
    const actions=["save","load","document","open","publish","upload_evidence","approve_offline","cancel"];
    if (!actions.includes(body.action) || !uuid(body.order_id) || !uuid(body.id) || (body.revision!==undefined && (!Number.isSafeInteger(body.revision)||body.revision<0))) return errorResponse("Richiesta non valida",400,cors);
    const caller=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:req.headers.get("Authorization")!}},auth:{persistSession:false}});
    const {data:order,error:orderError} = await caller.from("orders").select("id,company_id,order_code,total_amount,vat_rate").eq("id",body.order_id).maybeSingle();
    if (orderError || !order) return errorResponse("Commessa non disponibile o non autorizzata",403,cors);
    await requireCompanyAccess(admin,userId,order.company_id,cors);
    const {data:canEdit,error:permissionError} = await caller.rpc("has_permission_for_company",{_user_id:userId,_permission:"can_edit_orders",_company_id:order.company_id});
    if (permissionError) return errorResponse("Permessi non verificabili",403,cors);
    if (canEdit!==true) {
      if (body.action!=="open") return errorResponse("Non hai il permesso di modificare le varianti",403,cors);
      const {data:canView,error} = await caller.rpc("has_permission_for_company",{_user_id:userId,_permission:"can_view_orders",_company_id:order.company_id});
      if (error || canView!==true) return errorResponse("Non hai il permesso di consultare la variante",403,cors);
    }
    if (body.action==="approve_offline") {
      const {data:allowed,error} = await caller.rpc("has_permission_for_company",{_user_id:userId,_permission:"can_approve_variations",_company_id:order.company_id});
      if (error || allowed!==true) return errorResponse("Non hai il permesso di registrare approvazioni",403,cors);
    }
    const scope={company:order.company_id,order:order.id,id:body.id};
    const getVariation=async()=>{
      const {data,error}=await admin.from("ordini_variazione").select("*").eq("id",scope.id).eq("order_id",scope.order).eq("company_id",scope.company).maybeSingle();
      if(error)throw new Error("Variante non disponibile");return data;
    };
    const getWorkspace=async()=>{
      const {data,error}=await admin.from("order_variation_workspaces").select("*").eq("variation_id",scope.id).eq("order_id",scope.order).eq("company_id",scope.company).maybeSingle();
      if(error)throw new Error("Bozza non disponibile");return data;
    };
    const getDocument=async(documentId:string|null)=>{
      if(!documentId)return null;
      const {data,error}=await admin.from("order_variation_documents").select("*").eq("id",documentId).eq("variation_id",scope.id).eq("order_id",scope.order).eq("company_id",scope.company).maybeSingle();
      if(error)throw new Error("Documento non disponibile");return data;
    };
    const invoke=async(action:string,payload:unknown,revision=body.revision??0)=>{
      const {data,error}=await admin.rpc("variation_workflow_commit",{p_action:action,p_actor:userId,p_order:scope.order,p_id:scope.id,p_revision:revision,p_payload:payload});
      if(error||!data?.variation?.id)throw new Error(error?.message??"Esito non confermato: riapri la variante prima di riprovare");
      if(data.variation.id!==scope.id||data.variation.company_id!==scope.company||data.variation.order_id!==scope.order)throw new Error("Ambito della risposta non verificabile");
      return data;
    };
    const evidenceList=async()=>{
      const {data,error}=await admin.from("order_variation_evidence").select("id,document_id,file_name,file_size,created_at").eq("variation_id",scope.id).eq("company_id",scope.company).eq("order_id",scope.order).order("created_at",{ascending:false}).limit(30);
      if(error)throw new Error("Copie caricate non disponibili");return data??[];
    };
    const response=async(variation:unknown,workspace:unknown,document:unknown)=>jsonResponse({success:true,variation,workspace:canEdit===true?workspace:null,document,evidence:await evidenceList()},200,cors);

    if(body.action==="save"){
      const valid=validateVariationWorkspace(body.content,body.context);
      const {data:approved,error}=await admin.from("ordini_variazione").select("impatto_economico").eq("order_id",order.id).eq("company_id",order.company_id).eq("status","approvato");
      if(error||(approved??[]).length>=1000)throw new Error("Valore del contratto non verificabile");
      valid.context.currentNet=Number(order.total_amount)+(approved??[]).reduce((sum:number,row:{impatto_economico:number})=>sum+Number(row.impatto_economico),0);
      valid.context.vatRate=order.vat_rate??undefined;valid.context.orderCode=order.order_code??order.id;
      const data=await invoke("save",{...valid,terms:variationDraftPublicTerms(valid.content)});
      return await response(data.variation,data.workspace,null);
    }
    const variation=await getVariation();
    if(!variation)return errorResponse("Variante non trovata",404,cors);
    const workspace=canEdit===true?await getWorkspace():null;
    const document=await getDocument(variation.current_document_id);
    if(body.action==="load")return await response(variation,workspace,document);
    if(body.action==="open"){
      if(!document)return errorResponse("Questa variante precedente non ha un originale conservato. Usa la ristampa della proposta",422,cors);
      let path=document.pdf_path,name=document.pdf_name,expected=document.document_hash;
      if(body.file_id&&body.file_id!=="proposal"){
        const attachment=(document.attachments??[]).find((item:{id:string})=>item.id===body.file_id);
        if(attachment){path=attachment.path;name=attachment.name;expected=attachment.hash;}
        else if(uuid(body.file_id)){
          const {data:copy,error}=await admin.from("order_variation_evidence").select("pdf_path,file_name,document_hash").eq("id",body.file_id).eq("variation_id",scope.id).eq("company_id",scope.company).eq("order_id",scope.order).single();
          if(error||!copy)return errorResponse("Copia caricata non trovata",404,cors);path=copy.pdf_path;name=copy.file_name;expected=copy.document_hash;
        }else return errorResponse("Allegato non valido",400,cors);
      }
      const {data:file,error}=await admin.storage.from(bucket).download(path);
      if(error||!file||await sha(await file.arrayBuffer())!==expected)return errorResponse("Integrità del file non verificata",409,cors);
      const {data:url,error:urlError}=await admin.storage.from(bucket).createSignedUrl(path,300,{download:safeFileName(name)});
      if(urlError||!url?.signedUrl)throw new Error("Download non disponibile");
      return jsonResponse({success:true,url:url.signedUrl,name:safeFileName(name),hash:expected,document},200,cors);
    }
    if(body.action==="cancel")return jsonResponse({success:true,...await invoke("cancel",{})},200,cors);
    if(body.action==="publish"){
      if(body.reviewed!==true||typeof body.document_hash!=="string")return errorResponse("Controlla il PDF prima di creare il link",422,cors);
      return jsonResponse({success:true,...await invoke("publish",{document_hash:body.document_hash})},200,cors);
    }
    if(body.action==="approve_offline"){
      const date=typeof body.signed_on==="string"?body.signed_on:"";
      const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)===date;
      const today=new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Rome"});
      if(!uuid(body.evidence_id)||body.confirmed!==true||typeof body.signer_name!=="string"||body.signer_name.trim().length<2||body.signer_name.length>200||!validDate||date>today)return errorResponse("Indica firmatario, data reale e conferma la copia firmata",422,cors);
      return jsonResponse({success:true,...await invoke("approve_offline",{evidence_id:body.evidence_id,signer_name:body.signer_name.trim(),signed_on:date,confirmed:true})},200,cors);
    }
    if(body.action==="document"){
      if(!workspace||variation.status!=="bozza"||workspace.revision!==body.revision)return errorResponse("Bozza modificata. Riaprila prima di preparare il documento",409,cors);
      if(document&&document.source_revision===workspace.revision)return await response(variation,workspace,document);
      const valid=validateVariationWorkspace(workspace.content,workspace.context);
      const terms=prepareVariation(valid.content);
      if([terms.descrizione,workspace.context.companyName,workspace.context.customerName,workspace.context.documentHeading].some(value=>typeof value==="string"&&/{{|}}/.test(value)))return errorResponse("Completa le variabili del documento",422,cors);
      const docId=crypto.randomUUID(),prefix=`${scope.company}/${scope.order}/${scope.id}/${docId}/`;
      const pdf=await variationProposalPdf(terms,{...workspace.context,proposalNumber:variation.numero_odv,proposalRegisteredAt:variation.created_at,archivedOriginal:true});
      const bytes=pdf.output("arraybuffer"),path=`${prefix}proposal.pdf`,hash=await sha(bytes);
      if(bytes.byteLength>10*1024*1024)return errorResponse("Documento troppo grande",413,cors);
      const sourceContent=valid.content as typeof valid.content & {attachmentIds?:string[];templateId?:string};
      const selected=sourceContent.attachmentIds??[];
      const attachments:{id:string;name:string;path:string;size:number;hash:string;source_id:string}[]=[];
      const uploads:string[]=[];
      try{
        for(const sourceId of selected){
          const {data:source,error}=await admin.from("order_variation_template_files").select("id,company_id,template_id,file_name,file_size,storage_path,is_active").eq("id",sourceId).eq("company_id",scope.company).eq("template_id",sourceContent.templateId).eq("is_active",true).single();
          if(error||!source||source.storage_path!==`${scope.company}/${source.template_id}/${source.id}.pdf`)throw new Error("Un allegato del modello è cambiato. Ricontrolla la selezione");
          const {data:file,error:downloadError}=await admin.storage.from("variation-template-files").download(source.storage_path);
          if(downloadError||!file||file.size!==source.file_size||file.size>10*1024*1024)throw new Error("Allegato non disponibile o incompleto");
          const fileBytes=await file.arrayBuffer();
          const {PDFDocument}=await import("npm:pdf-lib@1.17.1");await PDFDocument.load(fileBytes,{ignoreEncryption:false});
          const id=crypto.randomUUID(),filePath=`${prefix}${id}.pdf`;
          const uploaded=await admin.storage.from(bucket).upload(filePath,fileBytes,{contentType:"application/pdf",upsert:false});
          if(uploaded.error)throw new Error("Caricamento dell'allegato non riuscito");uploads.push(filePath);
          attachments.push({id,name:safeFileName(source.file_name),path:filePath,size:fileBytes.byteLength,hash:await sha(fileBytes),source_id:source.id});
        }
        const uploaded=await admin.storage.from(bucket).upload(path,bytes,{contentType:"application/pdf",upsert:false});
        if(uploaded.error)throw new Error("Conservazione del PDF non riuscita");uploads.push(path);
        const data=await invoke("document",{id:docId,pdf_path:path,pdf_name:variationPdfFilename(order.order_code,`OdV-${variation.numero_odv}-${terms.titolo}`),pdf_size:bytes.byteLength,document_hash:hash,public_terms:terms,attachments},workspace.revision);
        // Concurrent preparation can win with another immutable file: discard only our unused upload.
        if(data.document?.id!==docId)await admin.storage.from(bucket).remove(uploads);
        return await response(data.variation,data.workspace,data.document);
      }catch(error){
        const receipt=await admin.from("order_variation_documents").select("id").eq("id",docId).eq("variation_id",scope.id).eq("company_id",scope.company).maybeSingle();
        if(!receipt.error&&receipt.data){const current=await getVariation();return await response(current,await getWorkspace(),await getDocument(current?.current_document_id));}
        if(!receipt.error&&!receipt.data&&uploads.length)await admin.storage.from(bucket).remove(uploads);
        throw error;
      }
    }
    if(body.action==="upload_evidence"){
      if(!document||!uuid(body.evidence_id)||!['bozza','in_attesa'].includes(variation.status)||body.proposal_hash!==document.document_hash||typeof body.file_name!=="string"||body.file_name.length>180||!/[.]pdf$/i.test(body.file_name)||typeof body.file_base64!=="string")return errorResponse("Copia o proposta non valida. Riapri il PDF prima di caricare",422,cors);
      const binary=atob(body.file_base64);
      if(binary.length<5||binary.length>10*1024*1024||!binary.startsWith("%PDF-"))return errorResponse("Carica un PDF valido fino a 10 MB",422,cors);
      const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const {PDFDocument}=await import("npm:pdf-lib@1.17.1");await PDFDocument.load(bytes,{ignoreEncryption:false});
      const path=`${scope.company}/${scope.order}/${scope.id}/evidence/${body.evidence_id}.pdf`,hash=await sha(bytes);
      const {data:existing,error:receiptError}=await admin.from("order_variation_evidence").select("*").eq("id",body.evidence_id).eq("variation_id",scope.id).eq("company_id",scope.company).maybeSingle();
      if(receiptError)throw new Error("Esito precedente non verificabile");
      if(existing){if(existing.document_hash!==hash||existing.document_id!==document.id)return errorResponse("Identificativo della copia già utilizzato",409,cors);return jsonResponse({success:true,variation,document,evidence:existing},200,cors);}
      const upload=await admin.storage.from(bucket).upload(path,bytes,{contentType:"application/pdf",upsert:false});
      if(upload.error)throw new Error("Caricamento non confermato. Riapri la variante prima di riprovare");
      try{return jsonResponse({success:true,...await invoke("evidence",{id:body.evidence_id,pdf_path:path,file_name:safeFileName(body.file_name),file_size:bytes.byteLength,document_hash:hash,proposal_hash:document.document_hash})},200,cors);}
      catch(error){const receipt=await admin.from("order_variation_evidence").select("id").eq("id",body.evidence_id).eq("variation_id",scope.id).eq("company_id",scope.company).maybeSingle();if(!receipt.error&&!receipt.data)await admin.storage.from(bucket).remove([path]);throw error;}
    }
    return errorResponse("Azione non supportata",400,cors);
  }catch(error){
    if(error instanceof Response)return error;
    console.error("variante-commessa",error instanceof Error?error.message:"Operazione non riuscita");
    return errorResponse(error instanceof Error?error.message:"Operazione non riuscita: la bozza salvata è conservata",422,cors);
  }
});
