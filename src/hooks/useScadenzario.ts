import { useRef } from "react";
import { filtraScadenzario, queryFontiScadenzario, scadenzaDaFonte } from "@/lib/finance/fontiScadenzario";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type GruppoMetodo } from "@/lib/finance/metodoScadenza";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { percheScadenzaNonModificabile, type ModificaScadenza } from "@/lib/finance/modificaScadenza";
import { eseguiPerRiga, messaggioErroreOperazione } from "@/lib/operazioniPerRiga";
import { completaCommesseScadenze } from "@/lib/finance/commesseScadenza";

export interface Scadenza {
  id: string;
  company_id: string;
  tipo: "incasso_cliente" | "pagamento_fornitore" | "costo_aziendale" | "scadenza_fiscale";
  direction: "entrata" | "uscita";
  description: string;
  amount: number;
  due_date: string | null;
  status: "da_pagare" | "pagata" | "parziale" | "annullata";
  paid_amount: number;
  paid_date: string | null;
  payment_method: string | null;
  invoice_id: string | null;
  order_id: string | null;
  supplier_id: string | null;
  cost_id: string | null;
  contact_id: string | null;
  order_item_id: string | null;
  prima_nota_entry_id: string | null;
  alert_days_before: number;
  alert_sent_at: string | null;
  is_auto_generated: boolean;
  auto_source: string | null;
  notes: string | null;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
  // joined
  suppliers?: { name: string } | null;
  invoices?: { invoice_number: string; client_company_name: string; issue_date?: string | null } | null;
  orders?: { order_code: string; client_name?: string | null; client_company?: string | null } | null;
  company_costs?: { name: string | null; order_id?: string | null; allocations?: unknown; notes?: string | null } | null;
  commesse?: Array<{ id: string; codice: string }>;
  marketing_contacts?: { first_name: string; last_name: string; company_name: string | null } | null;
}

/** Chi paga o chi incassa: dalla fattura, dal fornitore, dalla commessa o dal contatto. */
export function controparteScadenza(s: Pick<Scadenza, "invoices" | "suppliers" | "orders" | "marketing_contacts">): string | null {
  const contatto = s.marketing_contacts
    ? s.marketing_contacts.company_name || `${s.marketing_contacts.first_name ?? ""} ${s.marketing_contacts.last_name ?? ""}`.trim()
    : "";
  return s.invoices?.client_company_name || s.suppliers?.name || s.orders?.client_company || s.orders?.client_name || contatto || null;
}

export interface ScadenzarioSummary {
  /** Scadute in totale: entrate + uscite sommate. Da sola non risponde a nulla — vedi i due campi sotto. */
  scadute_count: number;
  scadute_amount: number;
  /** Scadute che i clienti devono all'azienda. */
  scadute_entrata_count?: number;
  scadute_entrata_amount?: number;
  /** Scadute che l'azienda deve ai fornitori. */
  scadute_uscita_count?: number;
  scadute_uscita_amount?: number;
  questa_settimana_count: number;
  questa_settimana_amount: number;
  prossimi_30gg_count: number;
  prossimi_30gg_amount: number;
  questo_mese_count: number;
  questo_mese_amount: number;
  entrate_previste: number;
  uscite_previste: number;
  // Conteggi per-tab (year-scoped). Opzionali: la RPC li ha aggiunti in un secondo momento.
  tutte_count?: number;
  da_incassare_count?: number;
  da_pagare_count?: number;
  pagate_count?: number;
  senza_data_count?: number;
}

export interface ScadenzarioFilters {
  includiSenzaData?: boolean;
  soloSenzaData?: boolean;
  direction?: 'entrata' | 'uscita' | null;
  status?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  /** Testo cercato: filtra sulla descrizione LATO SERVER, cosi' la ricerca
   *  guarda tutte le scadenze e non solo quelle della pagina caricata. */
  search?: string | null;
  /** Solo le scadute: aperte (da pagare o parziali) con scadenza passata. Prima
   *  la linguetta «Scadute» non passava nessun filtro e mostrava tutte. */
  soloScadute?: boolean;
  /** Incassi e pagamenti ancora aperti, incluse le rate parziali. */
  soloAperte?: boolean;
  /** Tipo di scadenza (incasso_cliente, pagamento_fornitore…): il filtro
   *  «Tipo» della pagina esisteva ma non arrivava alla query. */
  tipo?: string | null;
  /** RiBa, bonifico…: il gruppo del modo di pagamento (16/11/2026). */
  metodo?: GruppoMetodo | null;
  /**
   * L'anno del grafico dei mesi, quando il grafico c'è (23/11/2026). I dodici
   * mesi arrivano insieme al riepilogo, da una sola esecuzione: prima il
   * grafico si scaricava da solo tutte le righe dell'anno, a pagine da 500.
   * I filtri di data non lo toccano: è sempre l'anno intero.
   */
  annoGrafico?: number | null;
}

/** Un mese del grafico: gli importi pieni delle scadenze con una data in quel mese. */
export interface MeseScadenze { entrate: number; uscite: number }

export function useScadenzario(page: number = 1, pageSize: number = 50, filters: ScadenzarioFilters = {}) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const { direction, status, dateFrom, dateTo, search, soloScadute, soloAperte, tipo, metodo, includiSenzaData, soloSenzaData, annoGrafico } = filters;

  const scadenzeQuery = useQuery({
    queryKey: [...queryKeys.scadenzario.list(companyId), page, pageSize, direction, status, dateFrom, dateTo, search, soloScadute ?? false, tipo ?? null, soloAperte ?? false, metodo ?? null, includiSenzaData ?? false, soloSenzaData ?? false],
    queryFn: async () => {
      const query = filtraScadenzario(queryFontiScadenzario(companyId!)
        .select(`*, suppliers(name), invoices(invoice_number, client_company_name, issue_date),
          orders(order_code, client_name, client_company), company_costs(name, order_id, allocations, notes),
          marketing_contacts(first_name, last_name, company_name)`), filters)
        .order("due_date", { ascending: true, nullsFirst: false }).order("id");

      const { data, error, count } = await query
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) throw error;
      return { data: await completaCommesseScadenze(companyId!, (data ?? []) as unknown as Scadenza[]), totalCount: count ?? 0 };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Riepilogo e grafico dei mesi: UNA chiamata, una esecuzione di
  // scadenzario_fonti (23/11/2026). Costruire lo scadenzario costa quasi un
  // secondo su un'azienda piena, e prima si faceva tre volte: il riepilogo e
  // due giri del grafico, che si scaricava le righe dell'anno a pagine da 500.
  const summaryQuery = useQuery({
    queryKey: [...queryKeys.scadenzario.summary(companyId), dateFrom, dateTo, includiSenzaData ?? false, soloSenzaData ?? false, annoGrafico ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("scadenzario_totali" as never, {
        p_company_id: companyId!,
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
        p_includi_senza_data: includiSenzaData ?? false,
        p_solo_senza_data: soloSenzaData ?? false,
        p_anno: annoGrafico ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as { riepilogo: ScadenzarioSummary; mesi: MeseScadenze[] | null };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const paymentRequest = useRef({signature: "", id: ""});
  const markPaidMutation = useMutation({
    mutationFn: async (params: {
      scadenzaId: string;
      amount: number;
      paymentMethod?: string;
      paymentDate?: string;
      notes?: string;
      accountLabel?: string;
    }) => {
      const riga = scadenzeQuery.data?.data.find(s => s.id === params.scadenzaId);
      if (riga && scadenzaDaFonte(riga)) throw new Error("Registra il pagamento dalla fonte di questa scadenza.");
      const signature = JSON.stringify(params);
      if (paymentRequest.current.signature !== signature) paymentRequest.current = {signature, id:crypto.randomUUID()};
      const { data, error } = await (supabase as any).rpc("mark_scadenza_paid_con_richiesta", {
        p_request: paymentRequest.current.id,
        p_scadenza_id: params.scadenzaId,
        p_amount: params.amount,
        p_payment_method: params.paymentMethod || "bonifico",
        p_payment_date: params.paymentDate || new Date().toLocaleDateString("en-CA"),
        p_notes: params.notes || null,
        p_account_label: params.accountLabel || "banca",
      });
      if (error) throw error;
      const result = data as Record<string, unknown> | null;
      if (result?.error) throw new Error(String(result.error));
      return result;
    },
    onSuccess: () => {
      paymentRequest.current = {signature:"",id:""};
      refreshFinancialQueries(queryClient);
      toast.success("Pagamento registrato");
      queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.primaNota.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.scadenze(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const createMutation = useMutation({
    mutationFn: async (params: {
      tipo: string;
      description: string;
      amount: number;
      due_date: string;
      supplier_id?: string | null;
      contact_id?: string | null;
      invoice_id?: string | null;
      order_id?: string | null;
      cost_id?: string | null;
      notes?: string;
      payment_method?: string;
      alert_days_before?: number;
    }) => {
      const { error } = await supabase.from("scadenze").insert({
        company_id: companyId!,
        tipo: params.tipo,
        description: params.description,
        amount: params.amount,
        due_date: params.due_date,
        supplier_id: params.supplier_id || null,
        contact_id: params.contact_id || null,
        invoice_id: params.invoice_id || null,
        order_id: params.order_id || null,
        cost_id: params.cost_id || null,
        notes: params.notes || null,
        payment_method: params.payment_method || null,
        alert_days_before: params.alert_days_before ?? 7,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Scadenza creata");
      queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.scadenze(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const riga = scadenzeQuery.data?.data.find((s) => s.id === id);
      if (!riga) throw new Error("Ricarica le scadenze e riprova.");
      const motivo = percheScadenzaNonModificabile(riga);
      if (motivo) throw new Error(motivo);
      const { error } = await supabase.rpc("scadenza_annulla_manuale" as never, { p_id: id, p_versione: riga.updated_at } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshFinancialQueries(queryClient);
      toast.success("Scadenza annullata");
      queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.scadenze(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
    },
    onError: (e) => toast.error("Scadenza non annullata", { description: messaggioErroreOperazione(e) }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ riga, dati }: { riga: Scadenza; dati: ModificaScadenza }) => {
      const motivo = percheScadenzaNonModificabile(riga);
      if (motivo) throw new Error(motivo);
      const { error } = await supabase.rpc("scadenza_modifica_manuale" as never, { p_id: riga.id, p_versione: riga.updated_at, p_dati: dati } as never);
      if (error) throw error;
    },
    onSuccess: () => { refreshFinancialQueries(queryClient); toast.success("Scadenza modificata"); },
  });
  const cancelManyMutation = useMutation({
    mutationFn: (righe: Scadenza[]) => eseguiPerRiga(righe, async (s) => {
      const motivo = percheScadenzaNonModificabile(s);
      if (motivo) throw new Error(motivo);
      const { error } = await supabase.rpc("scadenza_annulla_manuale" as never, { p_id: s.id, p_versione: s.updated_at } as never);
      if (error) throw error;
    }),
    onSuccess: ({ completate, errori }) => {
      refreshFinancialQueries(queryClient);
      if (completate.length) toast.success(`${completate.length} scadenze annullate`, { description: errori.length ? `${errori.length} non elaborate: trovi il motivo nell'elenco.` : undefined });
      else toast.error("Nessuna scadenza annullata");
    },
  });

  const annullaIncassoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("annulla_incasso_scadenza" as never, { p_scadenza_id: id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshFinancialQueries(queryClient);
      toast.success("Incasso annullato: la scadenza è di nuovo da incassare");
    },
    onError: (e) => toast.error("Incasso non annullato", { description: (e as { message?: string }).message ?? String(e) }),
  });

  const totalCount = scadenzeQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Solo la nota (09/11/2026): si scrive anche su una scadenza nata da una
  // fattura. Non tocca importi né stato, quindi non sposta nessun incasso.
  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string | null }) => {
      const riga = scadenzeQuery.data?.data.find(s => s.id === id);
      if (riga && scadenzaDaFonte(riga)) throw new Error("Modifica la nota dalla fonte di questa scadenza.");
      const { error } = await supabase.from("scadenze").update({ notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota salvata");
      queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
    },
    onError: (e) => toast.error("Nota non salvata", { description: String(e) }),
  });

  return {
    updateNotes: (id: string, notes: string | null) =>
      updateNotesMutation.mutateAsync({ id, notes }),
    scadenze: scadenzeQuery.data?.data || [],
    isLoading: scadenzeQuery.isLoading,
    isError: scadenzeQuery.isError,
    refetch: scadenzeQuery.refetch,
    totalCount,
    totalPages,
    summary: summaryQuery.data?.riepilogo,
    /** I dodici mesi del grafico, quando è stato chiesto un anno: arrivano col riepilogo. */
    mesiScadenze: summaryQuery.data?.mesi ?? null,
    isSummaryLoading: summaryQuery.isLoading,
    isSummaryError: summaryQuery.isError,
    refetchSummary: summaryQuery.refetch,
    markPaid: markPaidMutation,
    create: createMutation,
    cancel: cancelMutation,
    update: updateMutation,
    cancelMany: cancelManyMutation,
    annullaIncasso: annullaIncassoMutation,
  };
}
