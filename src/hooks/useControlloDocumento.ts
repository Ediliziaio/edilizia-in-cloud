import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fileInBase64, type ControlloDocumento } from "@/lib/acquisti/controlloDocumento";

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
  const lista = useQuery({
    queryKey: chiaviControllo.lista(obiettivo),
    enabled: abilitato,
    queryFn: async () => {
      let q = db.from("controlli_documento_fornitore").select("*").order("created_at", { ascending: false }).limit(10);
      q = obiettivo.purchaseOrderId ? q.eq("purchase_order_id", obiettivo.purchaseOrderId) : q.eq("rfq_supplier_id", obiettivo.rfqSupplierId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ControlloDocumento[];
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
    mutationFn: async (x: { tipo: "offerta" | "conferma"; file?: File; attachmentId?: string }) => {
      const { data, error } = await supabase.functions.invoke("verify-purchase-order", {
        body: {
          azione: "controllo_documento", tipo: x.tipo,
          purchase_order_id: obiettivo.purchaseOrderId, rfq_supplier_id: obiettivo.rfqSupplierId,
          ...(x.file ? { document_base64: await fileInBase64(x.file), file_nome: x.file.name } : { email_attachment_id: x.attachmentId }),
        },
      });
      if (error) throw new Error(await messaggioFunzione(error));
      return data as { id: string; esito: string; gia_caricato?: boolean };
    },
    onSuccess: (r) => {
      if (r.gia_caricato) toast.info("Questo documento era già stato caricato: apro il controllo fatto");
      qc.invalidateQueries({ queryKey: chiaviControllo.tutti });
    },
    onError: (e) => toast.error("Documento non letto", { description: e instanceof Error ? e.message : "Riprova." }),
  });
  return { controlli: lista.data ?? [], caricamento: lista.isLoading, allegati: email.data ?? [], avvia };
}

export function useControlloDocumento(id: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: chiaviControllo.uno(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from("controlli_documento_fornitore").select("*").eq("id", id).single();
      if (error) throw error;
      return data as ControlloDocumento;
    },
  });
  const aggiorna = () => { void qc.invalidateQueries({ queryKey: chiaviControllo.tutti }); };
  const decidi = useMutation({
    mutationFn: async (x: { chiave: string; esito: "verde" | "rosso"; nota?: string }) => {
      const { error } = await db.rpc("controllo_documento_riga_decidi", { p_id: id, p_chiave: x.chiave, p_esito: x.esito, p_nota: x.nota ?? null });
      if (error) throw new Error(error.message);
    },
    onSuccess: aggiorna,
    onError: (e) => toast.error("Non salvato", { description: e instanceof Error ? e.message : "Riprova." }),
  });
  const accetta = useMutation({
    mutationFn: async (motivo: string) => {
      const { error } = await db.rpc("controllo_documento_accetta", { p_id: id, p_motivo: motivo });
      if (error) throw new Error(error.message);
    },
    onSuccess: aggiorna,
    onError: (e) => toast.error("Non salvato", { description: e instanceof Error ? e.message : "Riprova." }),
  });
  return { controllo: query.data, caricamento: query.isLoading, decidi, accetta };
}
