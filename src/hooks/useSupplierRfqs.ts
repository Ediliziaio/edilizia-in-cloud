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
  orders?: { order_code: string | null } | null;
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
}

export interface RfqSupplier {
  id: string;
  rfq_id: string;
  supplier_id: string;
  status: string;
  inviata_at: string | null;
  risposta_at: string | null;
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
  return lordo * (1 - Number(q.sconto_percentuale || 0) / 100);
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
        .select("*, orders(order_code)")
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
      const { data, error } = await (supabase as any)
        .from("supplier_rfq_suppliers")
        .select("rfq_id, status, totale_offerto")
        .eq("company_id", companyId!);
      if (error) throw error;
      const mappa: Record<string, { invitati: number; risposte: number; migliore: number | null }> = {};
      for (const r of (data ?? []) as { rfq_id: string; status: string; totale_offerto: number | null }[]) {
        const m = (mappa[r.rfq_id] ??= { invitati: 0, risposte: 0, migliore: null });
        m.invitati += 1;
        if (r.status === "risposta") {
          m.risposte += 1;
          const t = r.totale_offerto == null ? null : Number(r.totale_offerto);
          if (t != null && (m.migliore == null || t < m.migliore)) m.migliore = t;
        }
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
        (supabase as any).from("supplier_rfqs").select("*, orders(order_code)").eq("id", rfqId!).single(),
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
    mutationFn: async (updates: Record<string, unknown>) => {
      const { error } = await (supabase as any).from("supplier_rfqs").update(updates).eq("id", rfqId!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      queryClient.invalidateQueries({ queryKey: rfqKeys.all });
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
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from("supplier_rfq_suppliers").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalida,
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
   * fornitore scelto, con dentro i prezzi che ha offerto. E' il punto in cui
   * una trattativa diventa un impegno di spesa.
   */
  const aggiudica = useMutation({
    mutationFn: async (params: { rfq_supplier_id: string; motivazione?: string }) => {
      const dati = query.data;
      if (!dati) throw new Error("Richiesta non caricata");
      const vincitore = dati.fornitori.find((f) => f.id === params.rfq_supplier_id);
      if (!vincitore) throw new Error("Fornitore non trovato nella richiesta");

      const user = (await supabase.auth.getUser()).data.user;
      const { data: po, error: poErr } = await (supabase as any)
        .from("purchase_orders")
        .insert({
          company_id: companyId!,
          supplier_id: vincitore.supplier_id,
          order_id: dati.rfq.order_id,
          expected_delivery_date: dati.rfq.data_fabbisogno,
          payment_terms: vincitore.condizioni_pagamento,
          origine: "email",
          notes: `Da richiesta d'offerta ${dati.rfq.rfq_number} — ${dati.rfq.titolo}`,
          created_by: user?.id,
        })
        .select("id, oda_number")
        .single();
      if (poErr) throw poErr;

      // Le righe portano i prezzi offerti. Si saltano quelle che il fornitore
      // ha dichiarato non disponibili: metterle a zero le farebbe sembrare
      // regalate, e a fine ordine il totale sarebbe falso.
      const righe = dati.items
        .map((it) => {
          const q = dati.quotes.find(
            (x) => x.rfq_item_id === it.id && x.rfq_supplier_id === vincitore.id,
          );
          if (!q || !q.disponibile || q.prezzo_unitario == null) return null;
          return {
            purchase_order_id: po.id,
            company_id: companyId!,
            description: it.descrizione,
            quantity: Number(it.quantita),
            unit_of_measure: it.unita_misura ?? "pz",
            unit_price: Number(q.prezzo_unitario),
            discount_percent: Number(q.sconto_percentuale || 0),
            // ?? e non ||: l'IVA 0 e' legittima (es. fornitore intra-UE) e
            // il || la trasformava in un 22% inventato sull'ordine.
            vat_rate: Number(q.aliquota_iva ?? 22),
            sku: it.sku,
          };
        })
        .filter(Boolean);

      if (righe.length > 0) {
        // line_total e vat_amount sono colonne generate dal database: scriverle
        // qui farebbe fallire l'insert.
        const { error: itemsErr } = await (supabase as any).from("purchase_order_items").insert(righe);
        if (itemsErr) throw itemsErr;
      }

      const { error: rfqErr } = await (supabase as any)
        .from("supplier_rfqs")
        .update({
          status: "aggiudicata",
          supplier_id_aggiudicato: vincitore.supplier_id,
          purchase_order_id: po.id,
          aggiudicata_at: new Date().toISOString(),
          motivazione_scelta: params.motivazione || null,
        })
        .eq("id", rfqId!);
      if (rfqErr) throw rfqErr;

      return { purchaseOrderId: po.id as string, odaNumber: po.oda_number as string, righe: righe.length };
    },
    onSuccess: (r) => {
      toast.success(`Ordine ${r.odaNumber} creato`, {
        description: r.righe > 0 ? `${r.righe} righe dai prezzi offerti` : "Nessuna riga: il fornitore non aveva prezzi",
      });
      invalida();
      queryClient.invalidateQueries({ queryKey: rfqKeys.all });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e) => toast.error("Aggiudicazione non riuscita", { description: String(e) }),
  });

  return {
    rfq: query.data?.rfq ?? null,
    items: query.data?.items ?? [],
    fornitori: query.data?.fornitori ?? [],
    quotes: query.data?.quotes ?? [],
    isLoading: query.isLoading,
    aggiudica,
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
