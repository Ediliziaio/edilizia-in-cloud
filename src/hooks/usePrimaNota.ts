import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { ACCONTI_SU_FATTURE_IN_CLOUD } from "@/lib/fatturazione/incassi";
import { eseguiPerRiga } from "@/lib/operazioniPerRiga";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";


/**
 * L'incasso di una fattura che viene da Fatture in Cloud va registrato anche lì,
 * come fa la scheda della fattura (GestionaleEsterno): altrimenti alla prossima
 * sincronizzazione la fattura torna «da incassare». Best effort: l'incasso qui
 * resta comunque, e chi lo registra sa se deve ripeterlo sul gestionale.
 */
export async function allineaFattureInCloud(invoiceId: string, importo: number, data: string): Promise<"ok" | "non_allineata" | "solo_qui" | null> {
  const { data: f } = await supabase.from("invoices").select("external_provider, total, paid_amount").eq("id", invoiceId).maybeSingle();
  if (!f || f.external_provider !== "fattureincloud") return null;
  // paid_amount è già ricalcolato dal trigger del registro pagamenti.
  const saldo = Number(f.paid_amount ?? 0) >= Number(f.total ?? 0) - 0.005;
  if (!saldo && !ACCONTI_SU_FATTURE_IN_CLOUD) return "solo_qui";
  try {
    const body = saldo
      ? { invoice_id: invoiceId, paid_date: data }
      : { invoice_id: invoiceId, paid_date: data, azione: "incassa", importo };
    const { data: pr, error } = await supabase.functions.invoke("billing-payment-push", { body });
    return !error && pr?.ok ? "ok" : "non_allineata";
  } catch {
    return "non_allineata";
  }
}

export interface PrimaNotaEntry {
  id: string;
  company_id: string;
  direction: "entrata" | "uscita";
  category: string;
  description: string;
  amount: number;
  entry_date: string;
  payment_method: string | null;
  reference_number: string | null;
  invoice_id: string | null;
  installment_id?: string | null;
  order_id: string | null;
  supplier_id: string | null;
  cost_id: string | null;
  scadenza_id: string | null;
  documento_fiscale_id?: string | null;
  bank_transaction_id?: string | null;
  sal_sub_id?: string | null;
  reversal_of?: string | null;
  stornata?: boolean;
  movimento_id?: string | null;
  unita_movimento_id?: string | null;
  updated_at?: string;
  order_item_id: string | null;
  account_label: string | null;
  bank_account_id?: string | null;
  conto_liquidita_id?: string | null;
  is_auto: boolean;
  auto_source: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  notes: string | null;
  created_at: string;
  // joined
  suppliers?: { name: string } | null;
  invoices?: { invoice_number: string } | null;
  orders?: { order_code: string } | null;
  /** Fattura/NC nativa che ha generato la registrazione (incasso fattura) */
  documenti_fiscali?: { id: string; numero: string | null; tipo: string } | null;
}

/**
 * Perché una registrazione non si modifica da qui (le stesse regole di
 * `prima_nota_modificabile` nel database): ha un suo percorso. `null` = si modifica.
 */
export function perchePrimaNotaNonModificabile(e: Pick<PrimaNotaEntry, "is_auto" | "cost_id" | "documento_fiscale_id" | "bank_transaction_id">): string | null {
  if (e.bank_transaction_id) return "Viene dalla riconciliazione bancaria: si cambia da Tesoreria.";
  if (e.documento_fiscale_id) return "È l'incasso di una fattura emessa dal programma: si annulla dalla fattura.";
  if (e.cost_id) return "È collegata a un costo: usa lo storno dei pagamenti. La registrazione resta nello storico.";
  if (e.is_auto) return "È una registrazione automatica: si cambia dal documento che l'ha creata.";
  return null;
}

/** I pagamenti dei costi si possono eliminare ricalcolandone il saldo. */
export function perchePrimaNotaNonEliminabile(e: Pick<PrimaNotaEntry, "is_auto" | "auto_source" | "cost_id" | "documento_fiscale_id" | "bank_transaction_id" | "movimento_id" | "unita_movimento_id" | "sal_sub_id">): string | null {
  if (e.bank_transaction_id) return "Il movimento è collegato alla banca: scollega prima il pagamento da Tesoreria.";
  if (e.documento_fiscale_id || e.movimento_id) return "Elimina l’incasso dal dettaglio della fattura, per aggiornare anche il documento.";
  if (e.unita_movimento_id) return "Elimina o annulla l’incasso dalla scheda dell’unità.";
  if (e.sal_sub_id) return "Il pagamento è collegato a un SAL: gestiscilo dal SAL di origine.";
  if (e.cost_id && (!e.is_auto || ["company_cost_payment", "storno_pagamento"].includes(e.auto_source ?? ""))) return null;
  if (e.is_auto) return "La registrazione proviene da un altro documento: correggila dalla sua origine.";
  return null;
}

/** I campi del modulo di registrazione, gli stessi per una nuova e per una modifica. */
export interface DatiRegistrazione {
  direction: "entrata" | "uscita";
  category: string;
  description: string;
  amount: number;
  entry_date: string;
  payment_method?: string;
  reference_number?: string;
  account_label?: string;
  bank_account_id?: string | null;
  conto_liquidita_id?: string | null;
  supplier_id?: string | null;
  order_id?: string | null;
  invoice_id?: string | null;
  attachment_url?: string;
  attachment_name?: string;
  notes?: string;
}

export interface PrimaNotaSaldo {
  entrate: number;
  uscite: number;
  saldo: number;
  entry_count: number;
}

export interface PrimaNotaFilters {
  fromDate?: string;
  toDate?: string;
  direction?: "entrata" | "uscita" | "";
  category?: string;
  search?: string;
  isAuto?: boolean | null; // true=auto only, false=manual only, null=all
  autoSource?: string;
  bankAccountId?: string;
  liquiditaId?: string;
  accountLabel?: string;
}

export function usePrimaNota(
  filters: PrimaNotaFilters = {},
  page = 1,
  pageSize = 50,
  { includeMonthlyChart = true }: { includeMonthlyChart?: boolean } = {},
) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const filtriConto = {
    p_bank_account_id: filters.bankAccountId || undefined,
    p_conto_liquidita_id: filters.liquiditaId || undefined,
    p_account_label_pattern: filters.accountLabel ? `${filters.accountLabel}%` : undefined,
  };
  const ricerca = filters.search?.trim();
  const parametri = {
    ...filtriConto,
    p_company_id: companyId!,
    p_from_date: filters.fromDate || undefined,
    p_to_date: filters.toDate || undefined,
    p_direction: filters.direction || undefined,
    p_category: filters.category || undefined,
    p_is_auto: filters.isAuto ?? undefined,
    p_auto_source: filters.autoSource || undefined,
    p_description_pattern: ricerca ? `%${ricerca}%` : undefined,
  };

  // Un unico posto per i filtri → lista, saldo ed export restano allineati.
  // (Prima il saldo ignorava direzione/categoria/ricerca e l'export prendeva
  //  solo la pagina corrente: due incoerenze sui numeri, ora rimosse.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any) => {
    if (parametri.p_from_date) q = q.gte("entry_date", parametri.p_from_date);
    if (parametri.p_to_date) q = q.lte("entry_date", parametri.p_to_date);
    if (parametri.p_direction) q = q.eq("direction", parametri.p_direction);
    if (parametri.p_category) q = q.eq("category", parametri.p_category);
    if (parametri.p_is_auto !== undefined) q = q.eq("is_auto", parametri.p_is_auto);
    if (parametri.p_auto_source) q = q.eq("auto_source", parametri.p_auto_source);
    if (parametri.p_description_pattern) q = q.ilike("description", parametri.p_description_pattern);
    if (parametri.p_bank_account_id) q = q.eq("bank_account_id", parametri.p_bank_account_id);
    if (parametri.p_conto_liquidita_id) q = q.eq("conto_liquidita_id", parametri.p_conto_liquidita_id);
    if (parametri.p_account_label_pattern) q = q.ilike("account_label", parametri.p_account_label_pattern);
    return q;
  };

  const entriesQuery = useQuery({
    queryKey: [...queryKeys.primaNota.list(companyId, filters), page, pageSize],
    queryFn: async ({ signal }) => {
      let query = applyFilters(
        supabase
          .from("prima_nota_entries")
          .select(`*, suppliers(name), invoices(invoice_number), orders(order_code), documenti_fiscali(id, numero, tipo)`, { count: "exact" })
          .eq("company_id", companyId!)
      );

      query = query
        .range((page - 1) * pageSize, page * pageSize - 1)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .abortSignal(signal);

      const { data, error, count } = await query;
      if (error) throw error;
      const righe = data as unknown as PrimaNotaEntry[];
      const ids = righe.filter(r => r.cost_id && r.direction === "uscita").map(r => r.id);
      const stornate = new Set<string>();
      if (ids.length) {
        const { data: storni, error: erroreStorni } = await supabase.from("prima_nota_entries")
          .select("reversal_of").eq("company_id", companyId!).in("reversal_of", ids)
          .abortSignal(signal);
        if (erroreStorni) throw erroreStorni;
        for (const r of storni ?? []) if (r.reversal_of) stornate.add(r.reversal_of);
      }
      return { data: righe.map(r => ({ ...r, stornata: stornate.has(r.id) })), totalCount: count ?? 0 };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const saldoQuery = useQuery({
    queryKey: [
      ...queryKeys.primaNota.saldo(companyId, filters.fromDate, filters.toDate),
      filters.direction ?? "", filters.category ?? "", filters.search?.trim() ?? "",
      filters.isAuto ?? "", filters.autoSource ?? "",
      filters.bankAccountId ?? "", filters.liquiditaId ?? "", filters.accountLabel ?? "",
    ],
    queryFn: async ({ signal }): Promise<PrimaNotaSaldo> => {
      const { data, error } = await supabase.rpc("prima_nota_riepilogo_filtrato", parametri).abortSignal(signal);
      if (error) throw error;
      return data?.[0] ?? { entrate: 0, uscite: 0, saldo: 0, entry_count: 0 };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Il grafico mantiene il proprio periodo e il conto scelto, indipendenti
  // dai filtri dell'elenco. La prima pagina dei movimenti parte per prima.
  const oggi = new Date();
  const daMese = format(startOfMonth(subMonths(oggi, 5)), "yyyy-MM-dd");
  const aMese = format(endOfMonth(oggi), "yyyy-MM-dd");
  const monthlyChartQuery = useQuery({
    queryKey: [...queryKeys.primaNota.all, "chart6m", companyId, daMese, aMese, filtriConto],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("prima_nota_riepilogo_filtrato", {
        ...filtriConto,
        p_company_id: companyId!,
        p_from_date: daMese,
        p_to_date: aMese,
        p_monthly: true,
      }).abortSignal(signal);
      if (error) throw error;
      const buckets: Record<string, { entrate: number; uscite: number }> = {};
      for (const r of data ?? []) {
        if (r.mese) buckets[r.mese.slice(0, 7)] = { entrate: r.entrate, uscite: r.uscite };
      }
      return buckets;
    },
    enabled: !!companyId && includeMonthlyChart && entriesQuery.isSuccess,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  /** Tutte le righe filtrate (senza paginazione) per l'export CSV completo. */
  const fetchAllForExport = async (): Promise<PrimaNotaEntry[]> => {
    if (!companyId) return [];
    const { data, error } = await applyFilters(
      supabase
        .from("prima_nota_entries")
        .select(`*, suppliers(name), invoices(invoice_number), orders(order_code), documenti_fiscali(id, numero, tipo)`)
        .eq("company_id", companyId)
    ).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(50000);
    if (error) throw error;
    return (data as unknown as PrimaNotaEntry[]) ?? [];
  };

  const createMutation = useMutation({
    mutationFn: async (params: {
      direction: "entrata" | "uscita";
      category: string;
      description: string;
      amount: number;
      entry_date: string;
      payment_method?: string;
      reference_number?: string;
      supplier_id?: string | null;
      order_id?: string | null;
      /** Incasso di una fattura emessa: chiude anche la fattura e la sua scadenza. */
      invoice_id?: string | null;
      account_label?: string;
      bank_account_id?: string | null;
      conto_liquidita_id?: string | null;
      attachment_url?: string;
      attachment_name?: string;
      notes?: string;
    }) => {
      const { data: riga, error } = await supabase.from("prima_nota_entries").insert({
        company_id: companyId!,
        direction: params.direction,
        category: params.category,
        description: params.description,
        amount: params.amount,
        entry_date: params.entry_date,
        payment_method: params.payment_method || null,
        reference_number: params.reference_number || null,
        supplier_id: params.supplier_id || null,
        order_id: params.order_id || null,
        invoice_id: params.invoice_id || null,
        account_label: params.account_label || "banca",
        bank_account_id: params.bank_account_id || null,
        conto_liquidita_id: params.conto_liquidita_id || null,
        attachment_url: params.attachment_url || null,
        attachment_name: params.attachment_name || null,
        notes: params.notes || null,
        is_auto: false,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      } as never).select("id").single();
      if (error) throw error;
      // L'incasso di una fattura passa anche dal registro dei pagamenti, come la
      // riconciliazione bancaria: lì i trigger ricalcolano pagato, stato e scadenze.
      // Se non riesce, si toglie la riga appena scritta: niente incasso a metà.
      if (params.invoice_id && riga?.id) {
        const { error: errPagamento } = await supabase.from("invoice_payments").insert({
          invoice_id: params.invoice_id,
          company_id: companyId!,
          amount: params.amount,
          payment_date: params.entry_date,
          payment_method: params.payment_method || null,
          reference: `prima_nota:${riga.id}`,
          notes: "Incasso registrato dalla Prima nota",
        } as never);
        if (errPagamento) {
          // Il delete che le regole d'accesso non lasciano fare non dà errore: tocca
          // zero righe. Si controlla, così una riga rimasta a metà non passa in silenzio
          // (e chi riprova non la duplica senza saperlo).
          const { data: tolte } = await supabase.from("prima_nota_entries").delete().eq("id", riga.id).select("id");
          if (!tolte || tolte.length === 0) {
            throw new Error(
              "La fattura non è stata aggiornata (manca il permesso sugli incassi) e la riga di prima nota è rimasta: " +
              "non riprovare, chiedi a un amministratore di registrare l'incasso dalla fattura e di togliere la riga.",
            );
          }
          throw errPagamento;
        }
        return await allineaFattureInCloud(params.invoice_id, params.amount, params.entry_date);
      }
      return null;
    },
    onSuccess: (gestionale, params) => {
      toast.success(params.invoice_id ? "Incasso registrato e fattura aggiornata" : "Registrazione creata",
        gestionale === "non_allineata"
          ? { description: "Su Fatture in Cloud non è stato registrato: va segnato anche lì." }
          : gestionale === "solo_qui"
            ? { description: "È un acconto: su Fatture in Cloud va registrato a mano (lì per ora si segna solo il saldo)." }
            : undefined);
      queryClient.invalidateQueries({ queryKey: queryKeys.primaNota.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
      if (params.invoice_id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.scadenze(companyId) });
      }
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  // Solo la nota (09/11/2026): si scrive anche su una riga nata da sola, che
  // non si può né modificare né cancellare. La nota non tocca gli importi,
  // quindi non altera nessun saldo: serve a dire «pagato in contanti da
  // Mario», che il movimento di banca non sa.
  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string | null }) => {
      const { error } = await supabase
        .from("prima_nota_entries")
        .update({ notes })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota salvata");
      queryClient.invalidateQueries({ queryKey: queryKeys.primaNota.all });
    },
    onError: (e) => toast.error("Nota non salvata", { description: String(e) }),
  });

  // Modifica (10/11/2026): la registrazione e l'incasso della sua fattura cambiano insieme
  // (prima_nota_modifica): importo, data e metodo seguono; la fattura si può cambiare o togliere.
  const invalidaIncassi = () => {
    refreshFinancialQueries(queryClient);
    queryClient.invalidateQueries({ queryKey: queryKeys.primaNota.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.scadenze(companyId) });
  };
  const rpc = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  };
  /** Una fattura di Fatture in Cloud cambiata qui va cambiata anche lì: lo si dice, non lo si indovina. */
  const tocca_fattureincloud = async (ids: Array<string | null | undefined>) => {
    const validi = ids.filter((x): x is string => !!x);
    if (!validi.length) return false;
    const { data } = await supabase.from("invoices").select("id").in("id", validi).eq("external_provider", "fattureincloud");
    return (data ?? []).length > 0;
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, dati, prima }: { id: string; dati: DatiRegistrazione; prima?: Pick<PrimaNotaEntry, "amount" | "entry_date" | "invoice_id" | "updated_at"> }) => {
      const versione = prima?.updated_at;
      const { data, error } = await rpc.rpc("prima_nota_modifica", { p_id: id, p_dati: { ...dati, ...(versione ? { versione } : {}) } });
      if (error) throw new Error(error.message);
      const esito = (data ?? {}) as { esito?: string; invoice_id?: string | null; invoice_id_prima?: string | null };
      // L'avviso per Fatture in Cloud solo se l'incasso è cambiato davvero (importo, data o fattura).
      const incassoCambiato = !prima || Number(prima.amount) !== Number(dati.amount) || prima.entry_date !== dati.entry_date
        || (prima.invoice_id ?? null) !== (dati.invoice_id ?? null);
      return { esito: esito.esito ?? "modificata", fic: incassoCambiato && await tocca_fattureincloud([esito.invoice_id, esito.invoice_id_prima]) };
    },
    onSuccess: ({ esito, fic }) => {
      const dettaglio = {
        fattura_collegata: "La fattura risulta incassata.",
        fattura_cambiata: "L'incasso è passato sull'altra fattura; la precedente torna da incassare.",
        fattura_tolta: "La fattura torna da incassare.",
      }[esito];
      toast.success("Registrazione modificata", {
        description: [dettaglio, fic ? "La fattura viene da Fatture in Cloud: aggiorna l'incasso anche lì." : ""].filter(Boolean).join(" ") || undefined,
      });
      invalidaIncassi();
    },
    onError: (e) => toast.error("Registrazione non modificata", { description: e instanceof Error ? e.message : String(e) }),
  });

  // Elimina insieme all'incasso della sua fattura: prima la fattura restava «pagata» senza movimento.
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const riga = entriesQuery.data?.data.find(r => r.id === id);
      if (!riga) throw new Error("Registrazione non trovata. Ricarica la pagina.");
      const { data, error } = await rpc.rpc("prima_nota_elimina_registrazione", { p_id: id, p_versione: riga.updated_at ?? null });
      if (error) throw new Error(error.message);
      const esito = (data ?? {}) as { incassi_tolti?: number; invoice_id?: string | null };
      return { tolti: Number(esito.incassi_tolti ?? 0), fic: (esito.incassi_tolti ?? 0) > 0 && await tocca_fattureincloud([esito.invoice_id]),
        rataRiaperta: !!riga.installment_id };
    },
    onSuccess: ({ tolti, fic, rataRiaperta }) => {
      toast.success("Registrazione eliminata", tolti > 0
        ? { description: `La fattura torna da incassare.${fic ? " Viene da Fatture in Cloud: togli l'incasso anche lì." : ""}` }
        : rataRiaperta ? { description: "La rata della commessa torna da incassare." } : undefined);
      invalidaIncassi();
    },
    onError: (e) => toast.error("Registrazione non eliminata", { description: e instanceof Error ? e.message : String(e) }),
  });

  const deleteManyMutation = useMutation({
    mutationFn: async (righe: PrimaNotaEntry[]) => {
      const eliminate = new Set<string>();
      const selezionate = new Set(righe.map(r => r.id));
      // Lo storno è spesso la prima riga visibile: se c'è anche l'originale,
      // lascia che la RPC li elimini insieme senza ripristinare il pagamento.
      const priorita = (r: PrimaNotaEntry) => Number(!!r.reversal_of && selezionate.has(r.reversal_of));
      const ordinate = [...righe].sort((a, b) => priorita(a) - priorita(b));
      const esito = await eseguiPerRiga(ordinate, async (riga) => {
        if (eliminate.has(riga.id)) return;
        const motivo = perchePrimaNotaNonEliminabile(riga);
        if (motivo) throw new Error(motivo);
        const { data, error } = await rpc.rpc("prima_nota_elimina_registrazione", { p_id: riga.id, p_versione: riga.updated_at ?? null });
        if (error) throw error;
        for (const id of Array.isArray(data?.eliminati_ids) ? data.eliminati_ids : [riga.id]) if (typeof id === "string") eliminate.add(id);
      });
      return { ...esito, fic: await tocca_fattureincloud(esito.completate.map((r) => r.invoice_id)) };
    },
    onSuccess: ({ completate, errori, fic }) => {
      invalidaIncassi();
      const descrizione = [errori.length ? `${errori.length} non eliminate: trovi il motivo nell'elenco.` : "", fic ? "Aggiorna gli incassi collegati anche su Fatture in Cloud." : ""].filter(Boolean).join(" ");
      if (completate.length) toast.success(`${completate.length} registrazioni eliminate`, { description: descrizione || undefined });
      else toast.error("Nessuna registrazione eliminata", { description: descrizione });
    },
  });

  const totalCount = entriesQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    updateNotes: (id: string, notes: string | null) =>
      updateNotesMutation.mutateAsync({ id, notes }),
    entries: entriesQuery.data?.data || [],
    isLoading: entriesQuery.isLoading,
    erroreElenco: entriesQuery.isError,
    ricaricaElenco: entriesQuery.refetch,
    totalCount,
    totalPages,
    saldo: saldoQuery.data,
    isSaldoLoading: saldoQuery.isLoading,
    saldoError: saldoQuery.error,
    ricaricaSaldo: saldoQuery.refetch,
    monthlyChart: monthlyChartQuery.data,
    create: createMutation,
    remove: deleteMutation,
    removeMany: deleteManyMutation,
    update: updateMutation,
    fetchAllForExport,
  };
}
