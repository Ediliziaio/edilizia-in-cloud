import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { ACCONTI_SU_FATTURE_IN_CLOUD } from "@/lib/fatturazione/incassi";


/**
 * L'incasso di una fattura che viene da Fatture in Cloud va registrato anche lì,
 * come fa la scheda della fattura (GestionaleEsterno): altrimenti alla prossima
 * sincronizzazione la fattura torna «da incassare». Best effort: l'incasso qui
 * resta comunque, e chi lo registra sa se deve ripeterlo sul gestionale.
 */
async function allineaFattureInCloud(invoiceId: string, importo: number, data: string): Promise<"ok" | "non_allineata" | "solo_qui" | null> {
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
  order_id: string | null;
  supplier_id: string | null;
  cost_id: string | null;
  scadenza_id: string | null;
  documento_fiscale_id?: string | null;
  bank_transaction_id?: string | null;
  order_item_id: string | null;
  account_label: string | null;
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
  if (e.is_auto) return "È una registrazione automatica: si cambia dal documento che l'ha creata.";
  if (e.documento_fiscale_id) return "È l'incasso di una fattura emessa dal programma: si annulla dalla fattura.";
  if (e.bank_transaction_id) return "Viene dalla riconciliazione bancaria: si cambia da Tesoreria.";
  if (e.cost_id) return "È il pagamento di un costo: si cambia dal costo.";
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
}

export function usePrimaNota(filters: PrimaNotaFilters = {}, page: number = 1, pageSize: number = 50) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  // Un unico posto per i filtri → lista, saldo ed export restano allineati.
  // (Prima il saldo ignorava direzione/categoria/ricerca e l'export prendeva
  //  solo la pagina corrente: due incoerenze sui numeri, ora rimosse.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any) => {
    if (filters.fromDate) q = q.gte("entry_date", filters.fromDate);
    if (filters.toDate) q = q.lte("entry_date", filters.toDate);
    if (filters.direction) q = q.eq("direction", filters.direction);
    if (filters.category) q = q.eq("category", filters.category);
    if (filters.isAuto === true) q = q.eq("is_auto", true);
    if (filters.isAuto === false) q = q.eq("is_auto", false);
    if (filters.autoSource) q = q.eq("auto_source", filters.autoSource);
    if (filters.search?.trim()) q = q.ilike("description", `%${filters.search.trim()}%`);
    return q;
  };

  const entriesQuery = useQuery({
    queryKey: [...queryKeys.primaNota.list(companyId, filters), page, pageSize],
    queryFn: async () => {
      let query = applyFilters(
        supabase
          .from("prima_nota_entries")
          .select(`*, suppliers(name), invoices(invoice_number), orders(order_code), documenti_fiscali(id, numero, tipo)`, { count: "exact" })
          .eq("company_id", companyId!)
      );

      query = query
        .range((page - 1) * pageSize, page * pageSize - 1)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data as unknown as PrimaNotaEntry[], totalCount: count ?? 0 };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Il saldo deve rispecchiare la lista filtrata. Con soli filtri di data usiamo
  // la RPC server-side (SUM completa, nessun cap). Con filtri extra (direzione/
  // categoria/ricerca/auto) aggreghiamo lato client sulle righe filtrate, così i
  // KPI combaciano con ciò che l'utente vede (prima mostravano l'intero periodo).
  const hasNonDateFilter = !!(
    filters.direction || filters.category || filters.search?.trim() ||
    filters.isAuto != null || filters.autoSource
  );

  const saldoQuery = useQuery({
    queryKey: [
      ...queryKeys.primaNota.saldo(companyId, filters.fromDate, filters.toDate),
      filters.direction ?? "", filters.category ?? "", filters.search?.trim() ?? "",
      filters.isAuto ?? "", filters.autoSource ?? "",
    ],
    queryFn: async () => {
      if (!hasNonDateFilter) {
        const { data, error } = await supabase.rpc("get_prima_nota_saldo", {
          p_company_id: companyId!,
          p_from_date: filters.fromDate || undefined,
          p_to_date: filters.toDate || undefined,
        });
        if (error) throw error;
        return data as unknown as PrimaNotaSaldo;
      }
      const { data, error } = await applyFilters(
        supabase.from("prima_nota_entries").select("amount, direction").eq("company_id", companyId!)
      ).limit(50000);
      if (error) throw error;
      let entrate = 0, uscite = 0;
      for (const r of ((data as { amount: number | null; direction: string }[]) ?? [])) {
        const amt = Number(r.amount) || 0;
        if (r.direction === "entrata") entrate += amt; else uscite += amt;
      }
      const round2 = (n: number) => Math.round(n * 100) / 100;
      return { entrate: round2(entrate), uscite: round2(uscite), saldo: round2(entrate - uscite), entry_count: data?.length ?? 0 };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Grafico "ultimi 6 mesi": aggregazione mensile su TUTTE le registrazioni degli
  // ultimi 6 mesi, indipendente da paginazione e dai filtri di lista. Prima il
  // grafico leggeva la lista paginata/filtrata (default = solo mese corrente, 50
  // righe) → mostrava un solo mese.
  const monthlyChartQuery = useQuery({
    queryKey: ["primaNota", "chart6m", companyId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(1);
      since.setMonth(since.getMonth() - 5);
      const sinceStr = since.toLocaleDateString("en-CA"); // yyyy-MM-dd, locale
      const { data, error } = await supabase
        .from("prima_nota_entries")
        .select("amount, direction, entry_date")
        .eq("company_id", companyId!)
        .gte("entry_date", sinceStr)
        .limit(50000);
      if (error) throw error;
      const buckets: Record<string, { entrate: number; uscite: number }> = {};
      for (const r of ((data as { amount: number | null; direction: string; entry_date: string }[]) ?? [])) {
        const key = r.entry_date.slice(0, 7); // "yyyy-MM"
        const b = (buckets[key] ??= { entrate: 0, uscite: 0 });
        const amt = Number(r.amount) || 0;
        if (r.direction === "entrata") b.entrate += amt; else b.uscite += amt;
      }
      return buckets;
    },
    enabled: !!companyId,
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
        attachment_url: params.attachment_url || null,
        attachment_name: params.attachment_name || null,
        notes: params.notes || null,
        is_auto: false,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      }).select("id").single();
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
    mutationFn: async ({ id, dati, prima }: { id: string; dati: DatiRegistrazione; prima?: Pick<PrimaNotaEntry, "amount" | "entry_date" | "invoice_id"> }) => {
      const { data, error } = await rpc.rpc("prima_nota_modifica", { p_id: id, p_dati: dati });
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
      const { data, error } = await rpc.rpc("prima_nota_elimina", { p_id: id });
      if (error) throw new Error(error.message);
      const esito = (data ?? {}) as { incassi_tolti?: number; invoice_id?: string | null };
      return { tolti: Number(esito.incassi_tolti ?? 0), fic: (esito.incassi_tolti ?? 0) > 0 && await tocca_fattureincloud([esito.invoice_id]) };
    },
    onSuccess: ({ tolti, fic }) => {
      toast.success("Registrazione eliminata", tolti > 0
        ? { description: `La fattura torna da incassare.${fic ? " Viene da Fatture in Cloud: togli l'incasso anche lì." : ""}` }
        : undefined);
      invalidaIncassi();
    },
    onError: (e) => toast.error("Registrazione non eliminata", { description: e instanceof Error ? e.message : String(e) }),
  });

  const totalCount = entriesQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    updateNotes: (id: string, notes: string | null) =>
      updateNotesMutation.mutateAsync({ id, notes }),
    entries: entriesQuery.data?.data || [],
    isLoading: entriesQuery.isLoading,
    totalCount,
    totalPages,
    saldo: saldoQuery.data,
    isSaldoLoading: saldoQuery.isLoading,
    saldoError: saldoQuery.error,
    monthlyChart: monthlyChartQuery.data,
    create: createMutation,
    remove: deleteMutation,
    update: updateMutation,
    fetchAllForExport,
  };
}
