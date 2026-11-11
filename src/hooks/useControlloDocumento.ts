import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type ControlloDocumento } from "@/lib/acquisti/controlloDocumento";
import { useAuth } from "@/contexts/AuthContext";
import { preparaDocumento, mimeDocumento,improntaDocumenti } from "@/lib/ddt/preparaDocumento";
import type { BaseConferma } from "../../supabase/functions/_shared/revisioniConferma";
import {loadCatalogPages} from '@/lib/listino/loadCatalogPages';

// La tabella è nuova e non è ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type ObiettivoControllo = { purchaseOrderId: string; rfqSupplierId?: undefined } | { rfqSupplierId: string; purchaseOrderId?: undefined };

export interface AllegatoEmail {
  attachment_id: string;
  inbox_id: string;
  filename: string;
  mime_type: string | null;
  mittente: string | null;
  oggetto: string | null;
  ricevuta_il: string | null;
}

export const chiaviControllo = {
  tutti: ["controllo-documento"] as const,
  lista: (o: ObiettivoControllo) => ["controllo-documento", "lista", o.purchaseOrderId ?? o.rfqSupplierId] as const,
  email: (o: ObiettivoControllo) => ["controllo-documento", "email", o.purchaseOrderId ?? o.rfqSupplierId] as const,
  uno: (id?: string) => ["controllo-documento", "uno", id] as const,
};

async function messaggioFunzione(error: unknown): Promise<string> {
  const contesto = (error as { context?: Response } | null)?.context;
  if (contesto && typeof contesto.json === "function") {
    try {
      const corpo = await contesto.json();
      if (corpo?.error) return String(corpo.error);
    } catch { /* il corpo non è JSON: vale il messaggio generico */ }
  }
  return error instanceof Error ? error.message : "Riprova.";
}

export function useControlliDocumento(obiettivo: ObiettivoControllo, abilitato = true) {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const lista = useQuery({
    queryKey: chiaviControllo.lista(obiettivo),
    enabled: abilitato,
    refetchInterval:q=>q.state.data?.some(c=>c.stato==='in_lettura'&&Date.now()-new Date(c.updated_at||c.created_at).getTime()<10*60_000)?2500:false,
    queryFn: async () => {
      return loadCatalogPages<Pick<ControlloDocumento,'id'|'tipo'|'file_nome'|'stato'|'esito'|'accettato_il'|'created_at'|'updated_at'>>((a,b)=>{
        let q=db.from('controlli_documento_fornitore').select('id,tipo,file_nome,stato,esito,accettato_il,created_at,updated_at').order('created_at',{ascending:false}).order('id');
        q=obiettivo.purchaseOrderId?q.eq('purchase_order_id',obiettivo.purchaseOrderId):q.eq('rfq_supplier_id',obiettivo.rfqSupplierId);
        return q.range(a,b);
      });
    },
  });
  const email = useQuery({
    queryKey: chiaviControllo.email(obiettivo),
    enabled: abilitato,
    queryFn: async () => {
      const { data, error } = await db.rpc("controllo_documento_email", {
        p_po: obiettivo.purchaseOrderId ?? null, p_rfq_supplier: obiettivo.rfqSupplierId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as AllegatoEmail[];
    },
  });

  const avvia = useMutation({
    mutationFn: async (x: { tipo: "offerta" | "conferma"; file?: File; attachmentId?: string; controlloId?:string;allegatoOrdine?:boolean }) => {
      let datiFile:Record<string,unknown>={};
      if(x.file) {
        const {data:aziendaOrdine,error:erroreAzienda}=await db.rpc('controllo_documento_base',{p_po:obiettivo.purchaseOrderId??null,p_rfq:obiettivo.rfqSupplierId??null});
        if(erroreAzienda) throw erroreAzienda;
        if(!effectiveCompany||aziendaOrdine?.testata?.company_id!==effectiveCompany.id) throw new Error('Seleziona l’azienda dell’ordine prima di caricare il documento.');
        const mime=mimeDocumento(x.file);
        if(x.file.size>18*1024*1024) throw new Error("Documento troppo grande: massimo 18 MB.");
        if(!effectiveCompany) throw new Error("Scegli prima l’azienda.");
        const hash=await improntaDocumenti([x.file]);
        const originalePath=`${effectiveCompany.id}/controlli-fornitore/${hash}-originale.${x.file.name.split('.').pop()?.toLowerCase()||'bin'}`;
        const carica=async(path:string,file:File)=>{
          const {error}=await supabase.storage.from('order-attachments').upload(path,file,{contentType:file.type||mime});
          if(error&&!/already exists|duplicate/i.test(error.message)) throw error;
        };
        await carica(originalePath,new File([x.file],x.file.name,{type:mime}));
        const {lettura}=await preparaDocumento(x.file).catch(e=>{
          if(originalePath) return {lettura:new File([x.file!],x.file!.name,{type:mime})};
          throw e;
        });
        let pagine:number|undefined;
        if(lettura.type==='application/pdf') {
          const [pdf,worker]=await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
          pdf.GlobalWorkerOptions.workerSrc=worker.default;
          const task=pdf.getDocument({data:new Uint8Array(await lettura.arrayBuffer())});
          try {pagine=(await task.promise).numPages;} finally {await task.destroy();}
        }
        let path=originalePath;
        if(lettura!==x.file&&lettura.type!==mime){path=`${effectiveCompany.id}/controlli-fornitore/${hash}-lettura.${lettura.type==='image/png'?'png':'jpg'}`;await carica(path,lettura);}
        datiFile={document_path:path,file_nome:x.file.name,pagine_attese:pagine,originale_path:path!==originalePath?originalePath:undefined,originale_mime:path!==originalePath?mime:undefined};
      }
      const { data, error } = await supabase.functions.invoke("verify-purchase-order", {
        body: {
          azione: "controllo_documento", tipo: x.tipo,elaborazione_async:true,
          purchase_order_id: obiettivo.purchaseOrderId, rfq_supplier_id: obiettivo.rfqSupplierId,
          ...datiFile, email_attachment_id:x.attachmentId,controllo_id:x.controlloId,allegato_ordine:x.allegatoOrdine,
        },
      });
      if (error) throw new Error(await messaggioFunzione(error));
      return data as { id: string; esito: string; stato?:string; gia_caricato?: boolean };
    },
    onSuccess: (r) => {
      if (r.gia_caricato) toast.info("Questo documento era già stato caricato: apro il controllo fatto");
      qc.invalidateQueries({ queryKey: chiaviControllo.tutti });
      qc.invalidateQueries({queryKey:["fattura-confronto-originali"]});
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: chiaviControllo.tutti });
      void qc.invalidateQueries({ queryKey: ["fattura-confronto-originali"] });
      toast.error("Documento non letto", { description: e instanceof Error ? e.message : "Riprova." });
    },
  });
  return { controlli: lista.data ?? [], caricamento: lista.isLoading, errore:lista.isError, ricarica:lista.refetch, allegati: email.data ?? [], avvia };
}

export function useControlloDocumento(id: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: chiaviControllo.uno(id),
    enabled: !!id,
    refetchInterval:q=>q.state.data?.stato==='in_lettura'&&Date.now()-new Date(q.state.data.updated_at||q.state.data.created_at).getTime()<10*60_000?2000:false,
    queryFn: async () => {
      const { data, error } = await db.from("controlli_documento_fornitore").select("*").eq("id", id).single();
      if (error) throw error;
      const c=data as ControlloDocumento;
      return {...c,lettura_scaduta:c.stato==='in_lettura'&&Date.now()-new Date(c.updated_at||c.created_at).getTime()>=5*60_000};
    },
  });
  const aggiorna = () => { void qc.invalidateQueries({ queryKey: chiaviControllo.tutti });void qc.invalidateQueries({queryKey:["fattura-confronto-originali"]});void qc.invalidateQueries({queryKey:["pdf-richiesta-ordine"]}); };
  const decidi = useMutation({
    mutationFn: async (x: { chiave: string; esito: "verde" | "rosso"; nota?: string }) => {
      const { error } = await db.rpc("controllo_documento_decidi", { p_id: id,p_versione:query.data?.versione, p_chiave: x.chiave, p_esito: x.esito, p_nota: x.nota ?? null });
      if (error) throw new Error(error.message);
    },
    onSuccess: aggiorna,
    onError: (e) => toast.error("Non salvato", { description: e instanceof Error ? e.message : "Riprova." }),
  });
  const accetta = useMutation({
    mutationFn: async (motivo: string) => {
      const { error } = await db.rpc("controllo_documento_approva", { p_id: id,p_versione:query.data?.versione, p_motivo: motivo });
      if (error) throw new Error(error.message);
    },
    onSuccess: aggiorna,
    onError: (e) => toast.error("Non salvato", { description: e instanceof Error ? e.message : "Riprova." }),
  });
  const abbina=useMutation({mutationFn:async(x:{chiave:string;indici:number[];nota:string})=>{
    const c=query.data;if(!c) throw new Error("Controllo non disponibile.");
    const {data,error}=await supabase.functions.invoke("verify-purchase-order",{body:{azione:"controllo_documento",tipo:c.tipo,purchase_order_id:c.purchase_order_id??undefined,rfq_supplier_id:c.rfq_supplier_id??undefined,
      abbinamento:{controllo_id:c.id,versione:c.versione,chiave:x.chiave,indici:x.indici,nota:x.nota}}});
    if(error||data?.error) throw new Error(data?.error||await messaggioFunzione(error));
  },onSuccess:aggiorna,onError:(e:Error)=>toast.error("Abbinamento non salvato",{description:e.message})});
  const applicaPrezzi=useMutation({mutationFn:async(righe:string[])=>{
    const {data,error}=await db.rpc("controllo_documento_applica_prezzi",{p_id:id,p_versione:query.data?.versione,p_righe:righe});if(error)throw new Error(error.message);return data as number;
   },onSuccess:n=>{aggiorna();for(const key of ["purchase-orders","purchase-order-detail","purchase-order-items","pdf-richiesta-ordine"])void qc.invalidateQueries({queryKey:[key]});toast.success(`${n} prezzi applicati all’ordine`);},onError:(e:Error)=>toast.error("Prezzi non applicati",{description:e.message})});
  return { controllo: query.data, caricamento: query.isLoading, decidi, accetta,abbina,applicaPrezzi,ricarica:aggiorna };
}

export function useBaseConferma(obiettivo:ObiettivoControllo,abilitato=true) {
 return useQuery<BaseConferma>({queryKey:["controllo-documento","base",obiettivo.purchaseOrderId??obiettivo.rfqSupplierId],enabled:abilitato,staleTime:0,
  queryFn:async()=>{const {data,error}=await db.rpc("controllo_documento_base",{p_po:obiettivo.purchaseOrderId??null,p_rfq:obiettivo.rfqSupplierId??null});if(error) throw error;return data;}});
}
