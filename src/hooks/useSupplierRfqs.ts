import { confrontoOfferta } from "@/lib/acquisti/confronto";
import { oggiLocale } from "@/lib/acquisti/attivita";
import type {TablesUpdate} from "@/integrations/supabase/types";
/**
 * Richieste d'offerta ai fornitori (RDO).
 *
 * Lo stesso fabbisogno va a piu' fornitori, si aspettano i prezzi, si
 * confronta e si aggiudica a uno solo — che a quel punto diventa un ordine
 * d'acquisto vero, con i prezzi offerti gia' dentro.
 *
 * Le tabelle sono nuove e types.ts non le conosce ancora: da qui si passa da
 * `(supabase as any)`, che e' la convenzione del progetto per lo stesso caso.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const rfqKeys = {
  all: ["supplier-rfqs"] as const,
  list: (companyId?: string) => ["supplier-rfqs", companyId] as const,
  detail: (id: string | null) => ["supplier-rfq-detail", id] as const,
};

export interface SupplierRfq {
  id: string;
  company_id: string;
  rfq_number: string;
  titolo: string;
  descrizione: string | null;
  order_id: string | null;
  data_fabbisogno: string | null;
  scadenza_offerte: string | null;
  status: string;
  supplier_id_aggiudicato: string | null;
  purchase_order_id: string | null;
  aggiudicata_at: string | null;
  motivazione_scelta: string | null;
  note: string | null;
  created_at: string;
  orders?: { order_code: string | null; work_address?: string | null } | null;
}

export interface RfqItem {
  id: string;
  rfq_id: string;
  descrizione: string;
  quantita: number;
  unita_misura: string | null;
  sku: string | null;
  note: string | null;
  posizione: number;
  order_item_id?: string | null;
  riferimento?: string | null;
  misure_fonte?: string | null;
  /** Rif., misure, colore e apertura della posizione: vuoto per gli articoli normali. */
  misure_testo?: string | null;
}

/** Come si è chiesta l'offerta: «app» è l'email partita dal compositore. */
export type CanaleRichiesta = "app" | "email" | "telefono" | "whatsapp" | "di_persona";

export const CANALE_RICHIESTA_LABELS: Record<CanaleRichiesta, string> = {
  app: "email dall'app",
  email: "email",
  telefono: "telefono",
  whatsapp: "WhatsApp",
  di_persona: "di persona",
};

export interface RfqSupplier {
  id: string;
  rfq_id: string;
  supplier_id: string;
  status: string;
  inviata_at: string | null;
  inviata_via: CanaleRichiesta | null;
  risposta_at: string | null;
  trasporto_tipo?: "da_confermare" | "incluso" | "extra" | "ritiro";
  costo_trasporto?: number | null;
  disponibilita_note?: string | null;
  totale_offerto: number | null;
  giorni_consegna: number | null;
  validita_offerta: string | null;
  condizioni_pagamento: string | null;
  note: string | null;
  allegato_url: string | null;
  email_inbox_id: string | null;
  aggancio_da: string | null;
  aggancio_confidenza: number | null;
  aggancio_da_confermare: boolean;
  suppliers?: { name: string; email: string | null } | null;
}

export interface RfqQuote {
  id: string;
  rfq_supplier_id: string;
  rfq_item_id: string;
  prezzo_unitario: number | null;
  sconto_percentuale: number;
  aliquota_iva: number;
  disponibile: boolean;
  note: string | null;
}

/** Prezzo netto di una riga offerta: quantita' x prezzo, meno lo sconto. */
export function totaleRigaOfferta(q: RfqQuote | undefined, quantita: number): number | null {
  if (!q || q.prezzo_unitario == null || !q.disponibile) return null;
  const lordo = Number(q.prezzo_unitario) * quantita;
  return Math.round((lordo * (1 - Number(q.sconto_percentuale || 0) / 100) + Number.EPSILON) * 100) / 100;
}

export interface ContatoriRichiesta {
  invitati: number;
  risposte: number;
  /** fornitori a cui è stata chiesta e che non hanno ancora risposto */
  inAttesa: number;
  /** la richiesta più vecchia ancora senza risposta: da qui si contano i giorni */
  attesaDal: string | null;
  migliore: number | null;
  /** Fornitori invitati: servono al filtro per fornitore della pipeline acquisti. */
  fornitori: string[];
}

/** Il numero accanto alla vista «Richieste d'offerta»: da solo, senza leggere tutte le richieste dell'azienda. */
export function useConteggioRichiesteCommessa(orderId: string | undefined, companyId: string | undefined, abilitato = true) {
  return useQuery<number | null>({
    queryKey: [...rfqKeys.all, "conteggio", orderId, companyId],
    enabled: !!orderId && !!companyId && abilitato,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const { count, error } = await (supabase as any).from("supplier_rfqs")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId!).eq("company_id", companyId!);
      return error ? null : count;
    },
  });
}

export function useSupplierRfqs() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const listQuery = useQuery({
    queryKey: rfqKeys.list(companyId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("supplier_rfqs")
        .select("*, orders(order_code, work_address)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupplierRfq[];
    },
    enabled: !!companyId,
  });

  // Quanti fornitori e quante risposte per ciascuna richiesta: serve in lista
  // per sapere a colpo d'occhio chi e' ancora in attesa. Query separata invece
  // di un embed annidato: l'embed con RLS su tre livelli e' lento.
  const contatoriQuery = useQuery({
    queryKey: [...rfqKeys.list(companyId), "contatori"],
    queryFn: async () => {
      const PAGINA = 1000;
      // tutte le pagine di una tabella dell'azienda, ordinate per id
      const tutte = async <T,>(tabella: string, colonne: string): Promise<T[]> => {
        const out: T[] = [];
        for (let da = 0; ; da += PAGINA) {
          const { data, error } = await (supabase as any).from(tabella).select(colonne)
            .eq("company_id", companyId!).order("id").range(da, da + PAGINA - 1);
          if (error) throw error;
          out.push(...((data ?? []) as T[]));
          if (!data || data.length < PAGINA) return out;
        }
      };

      const [fornitori, voci, righe] = await Promise.all([
        tutte<RfqSupplier>(
          "supplier_rfq_suppliers", "id, rfq_id, supplier_id, status, totale_offerto, inviata_at, trasporto_tipo, costo_trasporto, validita_offerta"),
        tutte<{ id: string; rfq_id: string }>("supplier_rfq_items", "id, rfq_id"),
        tutte<RfqQuote & { supplier_rfq_items: { quantita: number } | null }>(
          "supplier_rfq_quotes", "id, rfq_supplier_id, prezzo_unitario, sconto_percentuale, disponibile, supplier_rfq_items(quantita)"),
      ]);

      // Il totale di chi ha risposto si calcola come nel dettaglio: la somma
      // delle righe e trasporto, oppure il totale documento già comprensivo.
      // Come nel dettaglio: migliore solo tra offerte complete, valide e confrontabili.
      const vociPerRichiesta = new Map<string, number>();
      for (const v of voci) vociPerRichiesta.set(v.rfq_id, (vociPerRichiesta.get(v.rfq_id) ?? 0) + 1);
      const sommaRighe = new Map<string, { totale: number; coperte: number }>();
      for (const q of righe) {
        const t = totaleRigaOfferta(q, Number(q.supplier_rfq_items?.quantita ?? 0));
        if (t == null) continue;
        const r = sommaRighe.get(q.rfq_supplier_id) ?? { totale: 0, coperte: 0 };
        r.totale += t; r.coperte += 1;
        sommaRighe.set(q.rfq_supplier_id, r);
      }

      const mappa: Record<string, ContatoriRichiesta> = {};
      const offerte = new Map<string, Array<{ totale: number; coperte: number }>>();
      for (const r of fornitori) {
        const m = (mappa[r.rfq_id] ??= { invitati: 0, risposte: 0, inAttesa: 0, attesaDal: null, migliore: null, fornitori: [] });
        m.invitati += 1;
        m.fornitori.push(r.supplier_id);
        // in attesa = chiesta e senza risposta; chi non è ancora stato contattato non «tace»
        if (r.status === "inviata") {
          m.inAttesa += 1;
          if (r.inviata_at && (!m.attesaDal || r.inviata_at < m.attesaDal)) m.attesaDal = r.inviata_at;
        }
        if (r.status === "risposta") {
          m.risposte += 1;
          const daRighe = sommaRighe.get(r.id);
          const numeroVoci=vociPerRichiesta.get(r.rfq_id)??0;
          const offerta=confrontoOfferta(r,{
            totale:daRighe?.totale??(r.totale_offerto==null?null:Number(r.totale_offerto)),
            righeCoperte:daRighe?.coperte??(r.totale_offerto==null?0:numeroVoci),
            daRighe:!!daRighe,
          },numeroVoci,oggiLocale());
          if (offerta.confrontabile && offerta.totale!=null) offerte.set(r.rfq_id,[...(offerte.get(r.rfq_id)??[]),{totale:offerta.totale,coperte:numeroVoci}]);
        }
      }
      for (const [rfqId, elenco] of offerte) {
        const piuCompleta = Math.max(...elenco.map((o) => o.coperte));
        const valide = elenco.filter((o) => o.coperte === piuCompleta).map((o) => o.totale);
        if (mappa[rfqId] && valide.length > 0) mappa[rfqId].migliore = Math.min(...valide);
      }
      return mappa;
    },
    enabled: !!companyId,
  });

  const create = useMutation({
    mutationFn: async (params: {
      titolo: string;
      descrizione?: string;
      order_id?: string | null;
      data_fabbisogno?: string | null;
      scadenza_offerte?: string | null;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await (supabase as any)
        .from("supplier_rfqs")
        .insert({
          company_id: companyId!,
          titolo: params.titolo,
          descrizione: params.descrizione || null,
          order_id: params.order_id || null,
          data_fabbisogno: params.data_fabbisogno || null,
          scadenza_offerte: params.scadenza_offerte || null,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as SupplierRfq;
    },
    onSuccess: () => {
      toast.success("Richiesta d'offerta creata");
      queryClient.invalidateQueries({ queryKey: rfqKeys.all });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return {
    rfqs: listQuery.data ?? [],
    contatori: contatoriQuery.data ?? {},
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    create,
  };
}

export function useSupplierRfqDetail(rfqId: string | null) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const invalida = () => queryClient.invalidateQueries({ queryKey: rfqKeys.detail(rfqId) });

  const query = useQuery({
    queryKey: rfqKeys.detail(rfqId),
    queryFn: async () => {
      const [rfqRes, itemsRes, fornRes] = await Promise.all([
        (supabase as any).from("supplier_rfqs").select("*, orders(order_code, work_address)").eq("id", rfqId!).single(),
        (supabase as any).from("supplier_rfq_items").select("*").eq("rfq_id", rfqId!).order("posizione"),
        (supabase as any)
          .from("supplier_rfq_suppliers")
          .select("*, suppliers(name, email)")
          .eq("rfq_id", rfqId!)
          .order("created_at"),
      ]);
      if (rfqRes.error) throw rfqRes.error;

      const fornitori = (fornRes.data ?? []) as RfqSupplier[];
      let quotes: RfqQuote[] = [];
      if (fornitori.length > 0) {
        const { data } = await (supabase as any)
          .from("supplier_rfq_quotes")
          .select("*")
          .in("rfq_supplier_id", fornitori.map((f) => f.id));
        quotes = (data ?? []) as RfqQuote[];
      }
      return {
        rfq: rfqRes.data as SupplierRfq,
        items: (itemsRes.data ?? []) as RfqItem[],
        fornitori,
        quotes,
      };
    },
    enabled: !!rfqId,
  });

  const updateRfq = useMutation({
    mutationFn: async (updates: TablesUpdate<"supplier_rfqs">) => {
      if(!companyId) throw new Error("Azienda non selezionata");
      const { error } = await supabase.from("supplier_rfqs").update(updates).eq("id", rfqId!).eq("company_id",companyId).select("id").single();
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([invalida(),queryClient.invalidateQueries({ queryKey: rfqKeys.all })]);
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const addItem = useMutation({
    mutationFn: async (item: Partial<RfqItem>) => {
      const { error } = await (supabase as any).from("supplier_rfq_items").insert({
        rfq_id: rfqId!,
        company_id: companyId!,
        descrizione: item.descrizione ?? "Nuova voce",
        quantita: item.quantita ?? 1,
        unita_misura: item.unita_misura ?? "pz",
        sku: item.sku ?? null,
        note: item.note ?? null,
        posizione: item.posizione ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: invalida,
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from("supplier_rfq_items").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalida,
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("supplier_rfq_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalida,
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const addFornitore = useMutation({
    mutationFn: async (supplier_id: string) => {
      const { error } = await (supabase as any).from("supplier_rfq_suppliers").insert({
        rfq_id: rfqId!,
        company_id: companyId!,
        supplier_id,
      });
      if (error) throw error;
    },
    onSuccess: invalida,
    onError: (e) => toast.error("Fornitore non aggiunto", { description: String(e) }),
  });

  const updateFornitore = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"supplier_rfq_suppliers"> }) => {
      const { error } = await supabase.from("supplier_rfq_suppliers").update(updates).eq("id", id).eq("company_id",companyId!).select("id").single();
      if (error) throw error;
    },
    onSuccess: async () => {await invalida();},
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const removeFornitore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("supplier_rfq_suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalida,
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  /** Prezzo di una riga per un fornitore: si crea o si aggiorna. */
  const setQuote = useMutation({
    mutationFn: async (params: {
      rfq_supplier_id: string;
      rfq_item_id: string;
      updates: Record<string, unknown>;
    }) => {
      const { error } = await (supabase as any)
        .from("supplier_rfq_quotes")
        .upsert(
          {
            rfq_supplier_id: params.rfq_supplier_id,
            rfq_item_id: params.rfq_item_id,
            company_id: companyId!,
            ...params.updates,
          },
          { onConflict: "rfq_supplier_id,rfq_item_id" },
        );
      if (error) throw error;
    },
    onSuccess: invalida,
    onError: (e) => toast.error("Prezzo non salvato", { description: String(e) }),
  });

  /**
   * Aggiudicazione: la richiesta finisce e nasce l'ordine d'acquisto al
   * fornitore scelto, con dentro i prezzi che ha offerto. Tutto in una sola
   * operazione nel database (rdo_aggiudica): o nascono ordine e righe e la
   * richiesta si chiude, o non resta niente. Un secondo clic trova la
   * richiesta già aggiudicata e non crea un altro ordine.
   */
  const aggiudica = useMutation({
    mutationFn: async (params: { rfq_supplier_id: string; motivazione?: string }) => {
      const { data, error } = await (supabase as any).rpc("rdo_aggiudica", {
        p_rfq_supplier_id: params.rfq_supplier_id,
        p_motivazione: params.motivazione ?? null,
      });
      if (error) throw new Error(error.message);
      const r = data as { purchase_order_id: string; oda_number: string; righe: number; saltate?: Array<{ descrizione: string; oda: string }> };
      return { purchaseOrderId: r.purchase_order_id, odaNumber: r.oda_number, righe: r.righe, saltate: r.saltate ?? [] };
    },
    onSuccess: (r) => {
      toast.success(`Ordine ${r.odaNumber} creato`, {
        description: r.righe > 0 ? `${r.righe} righe dai prezzi offerti` : "Nessuna riga: il fornitore non aveva prezzi",
      });
      if (r.saltate.length > 0) {
        toast.warning(`${r.saltate.length} ${r.saltate.length === 1 ? "voce non ordinata" : "voci non ordinate"}: già coperte`, {
          description: r.saltate.map((s) => `${s.descrizione} (${s.oda})`).join(", "),
        });
      }
      invalida();
      queryClient.invalidateQueries({ queryKey: rfqKeys.all });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e) => {
      invalida();
      toast.error("Aggiudicazione non riuscita", { description: e instanceof Error ? e.message : String(e) });
    },
  });

  /**
   * Richiesta fatta fuori dall'app (telefono, WhatsApp, la propria email, al
   * banco): si registra come chiesta, così l'attesa si conta da oggi.
   */
  const segnaChiesta = useMutation({
    mutationFn: async ({ id, via }: { id: string; via: CanaleRichiesta }) => {
      const { error } = await (supabase as any).from("supplier_rfq_suppliers")
        .update({ status: "inviata", inviata_at: new Date().toISOString(), inviata_via: via })
        .eq("id", id);
      if (error) throw error;
      if (query.data?.rfq.status === "bozza") {
        const { error: e2 } = await (supabase as any).from("supplier_rfqs").update({ status: "inviata" }).eq("id", rfqId!);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      invalida();
      queryClient.invalidateQueries({ queryKey: rfqKeys.all });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  /** L'offerta è arrivata (a voce, su carta, in un PDF): si registra a mano. */
  const registraOfferta = useMutation({
    mutationFn: async (f: RfqSupplier) => {
      const updates: Record<string, unknown> = { status: "risposta", risposta_at: new Date().toISOString() };
      if (!f.aggancio_da) updates.aggancio_da = "manuale";
      const { error } = await (supabase as any).from("supplier_rfq_suppliers").update(updates).eq("id", f.id);
      if (error) throw error;
      if (query.data?.rfq.status === "bozza" || query.data?.rfq.status === "inviata") {
        const { error: e2 } = await (supabase as any).from("supplier_rfqs").update({ status: "in_valutazione" }).eq("id", rfqId!);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      invalida();
      queryClient.invalidateQueries({ queryKey: rfqKeys.all });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  /** Il PDF o la foto dell'offerta, per controllare il confronto sul documento. */
  const allegaOfferta = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      if (file.size > 10 * 1024 * 1024) throw new Error("File troppo grande (max 10 MB)");
      const nome = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `${companyId}/rdo/${rfqId}/${Date.now()}-${nome}`;
      const { error: upErr } = await supabase.storage.from("order-attachments").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error } = await (supabase as any).from("supplier_rfq_suppliers")
        .update({ allegato_url: `order-attachments/${path}` }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Offerta allegata");
      invalida();
    },
    onError: (e) => toast.error("Allegato non caricato", { description: e instanceof Error ? e.message : String(e) }),
  });

  return {
    rfq: query.data?.rfq ?? null,
    items: query.data?.items ?? [],
    fornitori: query.data?.fornitori ?? [],
    quotes: query.data?.quotes ?? [],
    isLoading: query.isLoading,
    aggiudica,
    segnaChiesta,
    registraOfferta,
    allegaOfferta,
    updateRfq,
    addItem,
    updateItem,
    deleteItem,
    addFornitore,
    updateFornitore,
    removeFornitore,
    setQuote,
  };
}
