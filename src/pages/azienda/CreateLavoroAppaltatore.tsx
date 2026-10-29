/**
 * CreateLavoroAppaltatore — "Nuovo lavoro in appalto"
 * ─────────────────────────────────────────────────────────────────
 * Pagina sbloccata dal Modulo Appaltatori (`appaltatore_module`). Usa lo stesso
 * store `orders` con `order_type='appaltatore_lavoro'`, cosi' la commessa
 * d'appalto eredita fasi, operai, calendario, materiali, allegati e permessi
 * della commessa normale.
 *
 * Fase 2 (28/10/2026) — la pagina non chiede piu' un importo dato per certo.
 * Prima si scelgono committente e contratto, poi il modo di valorizzazione, che
 * decide tutto quello che viene dopo:
 *
 *   A CORPO    importo concordato prima → rate, come una commessa privata.
 *   A MISURA   importo noto alla fine   → una stima e un tetto; le rate
 *              nasceranno dal rendiconto, non da qui.
 *
 * Il contratto e' obbligatorio solo per le commesse a misura: senza il listino
 * del committente non c'e' modo di trasformare giornate e viaggi in un importo.
 *
 * Vedi docs/piano-commessa-appalto.md.
 */
import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, HardHat, Loader2, MapPin, FileText, Package,
  CalendarDays, Wallet, Save, CheckCircle2, Circle, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { parseDecimalIT, formatDecimalIT } from "@/lib/parseDecimalIT";
import { contrattoDiOggi } from "@/lib/appalto/contratti";
import { geocodeBestEffort } from "@/lib/geo/geocodeBestEffort";
import { useToast } from "@/hooks/use-toast";
import { useAppaltatoreModuleEnabled } from "@/hooks/useAppaltatoreModule";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  QuotePageHeader, QuoteCard, QuotePrimaryButton,
} from "@/components/marketing/preventivi/ui/builderUI";
import {
  type Installment,
  createDefaultInstallments,
  installmentsToLegacyColumns,
} from "@/lib/orderUtils";

type LavoroPaymentMode = "single" | "installments";
type Valorizzazione = "a_corpo" | "a_misura";

/** Le date si scrivono come le legge chi le legge: 01/10/2026, non 2026-10-01. */
const giornoIT = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
};

interface AppaltatoreOption {
  id: string;
  business_name: string | null;
  fiscal_code: string | null;
}

interface ContrattoOption {
  id: string;
  nome: string;
  valido_dal: string;
  valido_al: string | null;
  attivo: boolean;
  giorni_pagamento: number;
  modo_fatturazione: "per_commessa" | "mensile_cumulativa";
  include_fornitura: boolean;
  riferimento_committente: string | null;
}



const toIsoDate = (d: string) => (d ? d : null);

export default function CreateLavoroAppaltatore() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const featureEnabled = useAppaltatoreModuleEnabled();

  const companyId = effectiveCompany?.id ?? null;

  // ── Form state (skeleton — niente RHF per la prima iterazione) ──
  /* `?committente=…`: ci si arriva dall'avviso di «Nuova Commessa», quando il
     cliente scelto li' e' un committente. Arrivare con la scelta gia' fatta
     evita di ricercarlo in un menu di centocinquanta nomi. */
  const [parametri] = useSearchParams();
  const [customerId, setCustomerId] = useState<string>(parametri.get("committente") ?? "");
  const [orderCode, setOrderCode] = useState("");
  const [description, setDescription] = useState("");
  const [workAddress, setWorkAddress] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [materialsLocation, setMaterialsLocation] = useState("");
  const [workStartDate, setWorkStartDate] = useState("");
  const [workEndDate, setWorkEndDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  // ── Il contratto del committente e il modo di valorizzazione ────
  /**
   * Quello che l'utente ha scelto a mano. Il contratto EFFETTIVO si deriva
   * (vedi `contrattoId` sotto): cambiato committente, una scelta che non
   * appartiene al nuovo elenco smette da sola di valere. Prima era un effetto
   * che riscriveva lo stato, cioè un render in più e un errore eslint.
   */
  const [contrattoManuale, setContrattoManuale] = useState<string>("");
  const [valorizzazione, setValorizzazione] = useState<Valorizzazione>("a_corpo");
  const [tetto, setTetto] = useState("");
  const [rifCommittente, setRifCommittente] = useState("");

  // ── Pagamenti: rate / unica / acconto+saldo ─────────────────────
  const [paymentMode, setPaymentMode] = useState<LavoroPaymentMode>("single");
  const [numInstallments, setNumInstallments] = useState<number>(2); // 2=acconto+saldo, 3=acconto1+acconto2+saldo
  const [installments, setInstallments] = useState<Installment[]>(
    createDefaultInstallments("standard", 1) // default: solo saldo
  );

  /**
   * Testo grezzo dei campi importo rata (2026-07-25).
   *
   * Prima il campo mostrava `String(inst.amount)` e parsava a ogni tasto:
   * il numero riscritto nel campo cancellava il separatore appena digitato,
   * quindi "1,5" diventava prima "1" e poi 15. Ora si digita libero e il
   * parse avviene all'uscita dal campo, che restituisce a video il valore
   * interpretato in formato italiano.
   */
  const [rawInstallmentAmounts, setRawInstallmentAmounts] = useState<Record<number, string>>({});

  // Sincronizza la struttura delle rate quando cambia mode/numero rate
  useEffect(() => {
    const target = paymentMode === "single" ? 1 : numInstallments;
    setInstallments((prev) => {
      const next = createDefaultInstallments("standard", target);
      // Riusa importi/date esistenti dove possibile
      const existingDeposits = prev.filter((i) => i.type === "deposit");
      const existingBalance = prev.find((i) => i.type === "balance");
      return next.map((inst) => {
        if (inst.type === "deposit") {
          const match = existingDeposits[inst.position];
          if (match) {
            return {
              ...inst,
              amount: match.amount,
              expected_date: match.expected_date,
              is_paid: match.is_paid,
              paid_date: match.paid_date,
            };
          }
        }
        if (inst.type === "balance" && existingBalance) {
          return {
            ...inst,
            expected_date: existingBalance.expected_date,
            is_paid: existingBalance.is_paid,
            paid_date: existingBalance.paid_date,
          };
        }
        return inst;
      });
    });
    // Il testo grezzo è indicizzato per posizione: se la struttura cambia
    // resterebbe appiccicato a una rata diversa (o a una azzerata). Si
    // svuota e i campi tornano a leggere l'importo effettivo della rata.
    setRawInstallmentAmounts({});
  }, [paymentMode, numInstallments]);

  // Helper update rata
  const updateInstallment = (position: number, patch: Partial<Installment>) => {
    setInstallments((prev) =>
      prev.map((i) => (i.position === position ? { ...i, ...patch } : i))
    );
  };

  const handleInstallmentAmountBlur = (position: number) => {
    const v = parseDecimalIT(rawInstallmentAmounts[position] ?? "");
    updateInstallment(position, { amount: v });
    setRawInstallmentAmounts((prev) => ({
      ...prev,
      [position]: v > 0 ? formatDecimalIT(v) : "",
    }));
  };

  /**
   * Il codice del lavoro: il riepilogo diceva «Auto» e poi non lo generava
   * nessuno, cosi' il lavoro nasceva senza codice e in elenco, sul rendiconto e
   * sulla scheda del committente si leggeva «—». Stessa RPC della commessa
   * normale (`prossimo_numero_commessa`), stesso patto: il campo resta
   * modificabile e quello scritto a mano vince.
   */
  const codiceSuggerito = useQuery({
    queryKey: ["prossimo-numero-commessa", companyId],
    enabled: !!companyId,
    staleTime: 0,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await (supabase as any).rpc("prossimo_numero_commessa", { p_company_id: companyId });
      if (error) return null;
      return (data as string | null) ?? null;
    },
  });
  const codicePrecompilato = useRef(false);
  useEffect(() => {
    // Solo una stringa: un suggerimento storto non deve poter mandare in
    // errore il campo (`orderCode.trim()` sta anche nel riepilogo).
    const suggerito = typeof codiceSuggerito.data === "string" ? codiceSuggerito.data.trim() : "";
    if (codicePrecompilato.current || !suggerito) return;
    codicePrecompilato.current = true;
    setOrderCode((attuale) => (attuale.trim() ? attuale : suggerito));
  }, [codiceSuggerito.data]);

  // ── Lista appaltatori già censiti per la company corrente ─────
  const { data: appaltatori = [], isLoading: loadingAppaltatori } = useQuery({
    queryKey: ["appaltatori-list", companyId],
    queryFn: async (): Promise<AppaltatoreOption[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, business_name, fiscal_code")
        .eq("customer_type", "appaltatore")
        .eq("company_id", companyId)
        .order("business_name", { ascending: true });
      if (error) throw error;
      return (data || []) as AppaltatoreOption[];
    },
    enabled: !!companyId && featureEnabled,
  });

  // ── Contratti del committente scelto ───────────────────────────
  const { data: contratti = [], isLoading: loadingContratti } = useQuery({
    queryKey: ["appalto-contratti-committente", companyId, customerId],
    queryFn: async (): Promise<ContrattoOption[]> => {
      if (!companyId || !customerId) return [];
      const { data, error } = await (supabase as any)
        .from("appalto_contratti")
        .select("id, nome, valido_dal, valido_al, attivo, giorni_pagamento, modo_fatturazione, include_fornitura, riferimento_committente")
        .eq("company_id", companyId)
        .eq("committente_id", customerId)
        .order("valido_dal", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContrattoOption[];
    },
    enabled: !!companyId && !!customerId && featureEnabled,
  });

  /**
   * Il contratto su cui la commessa nasce: quello scelto a mano se appartiene
   * ancora a questo committente, altrimenti quello valido oggi.
   */
  const contrattoId = useMemo(() => {
    if (contrattoManuale && contratti.some((c) => c.id === contrattoManuale)) return contrattoManuale;
    return contrattoDiOggi(contratti)?.id ?? "";
  }, [contrattoManuale, contratti]);

  const contrattoScelto = useMemo(
    () => contratti.find((c) => c.id === contrattoId) ?? null,
    [contratti, contrattoId],
  );

  // ── Validazione date (soft) ────────────────────────────────────
  const dateError = useMemo(() => {
    if (workStartDate && workEndDate && workEndDate < workStartDate) {
      return "La data di fine lavori non può precedere quella di inizio.";
    }
    return null;
  }, [workStartDate, workEndDate]);

  // ── Importi pagamento (saldo = totale - somma acconti) ──────────
  const totalNum = useMemo(() => {
    const v = totalAmount ? parseDecimalIT(totalAmount) : 0;
    return Number.isNaN(v) ? 0 : v;
  }, [totalAmount]);

  const depositsSum = useMemo(
    () =>
      installments
        .filter((i) => i.type === "deposit")
        .reduce((acc, i) => acc + (Number.isFinite(i.amount) ? i.amount : 0), 0),
    [installments]
  );

  const balanceComputed = Math.max(0, totalNum - depositsSum);

  const paymentError = useMemo(() => {
    if (totalNum > 0 && depositsSum > totalNum + 0.005) {
      return "La somma degli acconti supera l'importo totale.";
    }
    return null;
  }, [totalNum, depositsSum]);

  const aMisura = valorizzazione === "a_misura";

  /**
   * A misura il contratto serve davvero: l'importo nasce dalle tariffe del
   * committente, e senza listino non c'e' niente da cui farlo nascere. A corpo
   * no: un importo concordato a voce resta una commessa valida.
   */
  const contrattoMancante = aMisura && !contrattoId;

  const canSubmit =
    !!companyId &&
    !!customerId &&
    description.trim().length > 0 &&
    !dateError &&
    !contrattoMancante &&
    (aMisura || !paymentError);

  // ── Mutation: insert orders + installments + redirect ──────────
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile.");
      if (!customerId) throw new Error("Seleziona un appaltatore.");

      const totalVal = totalAmount ? parseDecimalIT(totalAmount) : 0;
      if (Number.isNaN(totalVal) || totalVal < 0) {
        throw new Error("Importo non valido.");
      }

      /**
       * A misura non si scrivono rate: l'importo non c'e' ancora, e una rata
       * sull'importo stimato diventerebbe una scadenza finta nel previsionale
       * di cassa. La scadenza vera nasce sulla FATTURA del rendiconto, dai
       * giorni di pagamento del contratto: metterla anche qui farebbe contare
       * lo stesso incasso due volte.
       */
      const installmentsForSave: Installment[] = aMisura
        ? []
        : installments.map((i) => (i.type === "balance" ? { ...i, amount: balanceComputed } : i));
      const legacy = aMisura ? {} : installmentsToLegacyColumns(installmentsForSave);

      const payload = {
        company_id: companyId,
        customer_id: customerId,
        order_code: orderCode.trim() || null,
        description: description.trim(),
        total_amount: totalVal,
        ...legacy,
        vat_rate: 22,
        payment_type: aMisura ? "balance" : paymentMode === "single" ? "balance" : "standard",
        // Campi specifici Modulo Appaltatori
        order_type: "appaltatore_lavoro",
        valorizzazione,
        appalto_contratto_id: contrattoId || null,
        tetto_importo: tetto ? parseDecimalIT(tetto) : null,
        riferimento_committente: rifCommittente.trim() || null,
        work_address: workAddress.trim() || null,
        work_description: workDescription.trim() || null,
        materials_location: materialsLocation.trim() || null,
        work_start_date: toIsoDate(workStartDate),
        work_end_date: toIsoDate(workEndDate),
        internal_notes: internalNotes.trim() || null,
      };

      const { data, error } = await supabase
        .from("orders")
        // Cast a `never` — i nuovi campi non sono ancora nei tipi
        // generati (la migration verrà applicata a parte).
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      const orderId = (data as { id: string }).id;

      // Geocoding automatico cantiere (best-effort, in background):
      // popola work_lat/lng senza bloccare la creazione del lavoro.
      if (workAddress.trim()) {
        void geocodeBestEffort([workAddress]).then((coords) => {
          if (!coords) return;
          return supabase
            .from("orders")
            .update({ work_lat: coords.lat, work_lng: coords.lng } as never)
            .eq("id", orderId);
        }).catch(() => { /* geocoding best-effort: non bloccante */ });
      }

      // Persisti anche le rate nella tabella order_installments per
      // coerenza con il resto dell'app (FinancialSummary, dashboard,
      // cashflow, customer portal). Allineato a EditOrder.
      if (installmentsForSave.length > 0) {
        const rows = installmentsForSave.map((i) => ({
          order_id: orderId,
          position: i.position,
          label: i.label,
          type: i.type,
          amount: i.amount,
          is_paid: i.is_paid,
          paid_date: i.paid_date || null,
          expected_date: i.expected_date || null,
        }));
        const { error: instErr } = await supabase
          .from("order_installments")
          .insert(rows as never);
        if (instErr) {
          logger.error("Insert installments error:", instErr);
          // Non blocchiamo la creazione: i campi legacy sono già
          // persistiti su orders e la UI legge da entrambe.
        }
      }

      return { id: orderId } as { id: string };
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "Lavoro creato",
        description: "Il lavoro per appaltatore è stato registrato.",
      });
      navigate(`/azienda/ordini/${order.id}`);
    },
    onError: (err) => {
      logger.error("Create lavoro appaltatore error:", err);
      toast({
        title: "Errore",
        description: err instanceof Error ? err.message : "Errore durante la creazione.",
        variant: "destructive",
      });
    },
  });

  // ── Riepilogo live (DEVE stare prima di ogni early return per
  //     rispettare le rules-of-hooks di React) ────────────────────
  const selectedAppaltatore = appaltatori.find((a) => a.id === customerId);
  const totalForSummary = totalAmount
    ? parseDecimalIT(totalAmount)
    : 0;
  const formattedTotal = !Number.isNaN(totalForSummary) && totalForSummary > 0
    ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(totalForSummary)
    : null;
  const durationDays = useMemo(() => {
    if (!workStartDate || !workEndDate || dateError) return null;
    const start = new Date(workStartDate);
    const end = new Date(workEndDate);
    const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    return diff > 0 ? diff : null;
  }, [workStartDate, workEndDate, dateError]);

  // ── Guard: feature disattivata → redirect alla lista commesse ────
  if (!featureEnabled) {
    return (
      <div className="space-y-4 max-w-xl">
        <Alert variant="destructive">
          <AlertDescription>
            Il Modulo Appaltatori non è attivo per questa azienda. Chiedi al
            superadmin di abilitarlo dal pannello feature flag.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => navigate("/azienda/ordini")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna alle commesse
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <QuotePageHeader
        icon={<HardHat className="h-5 w-5" />}
        title="Nuovo lavoro in appalto"
        subtitle="Il lavoro che un'impresa committente ti passa."
        chips={
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
            <HardHat className="h-3 w-3" />
            Modulo Appaltatori
          </span>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Annulla
          </Button>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit || createMutation.isPending) return;
          createMutation.mutate();
        }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        <div className="lg:col-span-8 space-y-6">
        {/* ── Cliente appaltatore ────────────────────────────────── */}
        <QuoteCard
          title="Committente"
          icon={<HardHat className="h-4 w-4" />}
          subtitle="L'impresa che ti passa il lavoro, e il contratto da cui scendono listino e condizioni."
        >
          <div className="space-y-3">
            <Label htmlFor="customer">Committente *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger id="customer" disabled={loadingAppaltatori}>
                <SelectValue placeholder={
                  loadingAppaltatori
                    ? "Caricamento..."
                    : appaltatori.length === 0
                      ? "Nessun appaltatore in anagrafica"
                      : "Seleziona un appaltatore"
                } />
              </SelectTrigger>
              <SelectContent>
                {appaltatori.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.business_name || "(senza ragione sociale)"}
                    {a.fiscal_code ? ` · ${a.fiscal_code}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Il contratto: da qui la commessa prende il listino concordato.
                Si presenta quello valido oggi, non si impone. */}
            {customerId && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="contratto">
                  Contratto {aMisura ? "*" : <span className="text-muted-foreground font-normal">(consigliato)</span>}
                </Label>
                {loadingContratti ? (
                  <p className="text-xs text-muted-foreground">Caricamento contratti…</p>
                ) : contratti.length === 0 ? (
                  <Alert>
                    <AlertDescription className="text-xs">
                      Questo committente non ha ancora un contratto con il suo listino.
                      <Button variant="link" className="px-1 h-auto"
                        onClick={() => navigate(`/azienda/committenti/${customerId}`)}>
                        Aprine uno dalla sua scheda
                      </Button>
                      — a misura serve, perché l'importo nasce dalle tariffe.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Select value={contrattoId} onValueChange={setContrattoManuale}>
                      <SelectTrigger id="contratto">
                        <SelectValue placeholder="Seleziona il contratto" />
                      </SelectTrigger>
                      <SelectContent>
                        {contratti.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.nome} · dal {giornoIT(k.valido_dal)}{k.attivo ? "" : " (non attivo)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {contrattoScelto && (
                      <p className="text-[11px] text-muted-foreground">
                        Pagamento a {contrattoScelto.giorni_pagamento} giorni ·{" "}
                        {contrattoScelto.modo_fatturazione === "mensile_cumulativa"
                          ? "fattura mensile con le altre commesse"
                          : "fattura per commessa"}{" "}
                        · {contrattoScelto.include_fornitura ? "fornitura compresa" : "sola manodopera"}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {appaltatori.length === 0 && !loadingAppaltatori && (
              <Alert>
                <AlertDescription className="text-xs">
                  Per creare un lavoro in appalto serve almeno un
                  <strong> committente </strong>in anagrafica. Vai su
                  <Button
                    variant="link"
                    className="px-1 h-auto"
                    onClick={() => navigate("/azienda/clienti/nuovo?tipo=committente")}
                  >
                    Nuovo committente
                  </Button>
                  .
                </AlertDescription>
              </Alert>
            )}
          </div>
        </QuoteCard>

        {/* ── Come si valorizza: la scelta che decide tutto il resto ── */}
        <QuoteCard
          title="Come viene pagato questo lavoro"
          icon={<Wallet className="h-4 w-4" />}
          subtitle="Da qui cambia il resto della pagina: non si può dedurre dopo."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              {
                v: "a_corpo" as const,
                titolo: "A corpo",
                riga: "L'importo è concordato: 1.450 € e basta.",
                sotto: "Importo certo e rate. Il lavoro in più si rendiconta a parte.",
              },
              {
                v: "a_misura" as const,
                titolo: "A misura",
                riga: "A giornata, al km, al metro quadro: si sa alla fine.",
                sotto: "Una stima, un tetto, e l'importo dal rendiconto.",
              },
            ]).map((opz) => (
              <button
                key={opz.v}
                type="button"
                aria-pressed={valorizzazione === opz.v}
                onClick={() => setValorizzazione(opz.v)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  valorizzazione === opz.v
                    ? "border-orange-400 bg-orange-50/60 ring-1 ring-orange-200"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  {valorizzazione === opz.v
                    ? <CheckCircle2 className="h-4 w-4 text-orange-500" />
                    : <Circle className="h-4 w-4 text-slate-300" />}
                  {opz.titolo}
                </span>
                <span className="mt-1 block text-xs text-slate-600">{opz.riga}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{opz.sotto}</span>
              </button>
            ))}
          </div>
          {aMisura ? (
            <p className="mt-3 text-xs text-muted-foreground">
              L'importo che inserisci sotto resta una <strong>stima</strong>: serve a te per
              sapere se il lavoro conviene, non è quello che fatturerai. Quello che fatturi
              esce dal rendiconto: le giornate, i viaggi, i chilometri, i metri quadri che
              hai segnato, ai prezzi del listino concordato.
            </p>
          ) : (
            /* Il caso misto non e' una terza scelta: e' questa, piu' le righe
               fuori contratto. Senza dirlo, chi prende un lavoro a corpo con
               degli extra non sa dove metterli e li perde. */
            <p className="mt-3 text-xs text-muted-foreground">
              L'importo concordato resta quello. Il lavoro <strong>in più</strong> — la
              giornata non prevista, il viaggio in più, l'imprevisto sotto il massetto — si
              aggiunge nel rendiconto segnato <strong>fuori contratto</strong>: è quello che
              si discute a fine lavori, e così resta scritto con la sua data.
            </p>
          )}
        </QuoteCard>

        {/* ── Identificazione lavoro ─────────────────────────────── */}
        <QuoteCard title="Identificazione" icon={<FileText className="h-4 w-4" />}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orderCode">Codice lavoro</Label>
              <Input
                id="orderCode"
                value={orderCode}
                onChange={(e) => setOrderCode(e.target.value)}
                placeholder="LAV-2026-001"
                maxLength={50}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Descrizione breve *</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Es. Posa serramenti palazzo via Roma — lotto 3"
                maxLength={200}
                required
              />
            </div>
          </div>
        </QuoteCard>

        {/* ── Dettagli operativi del cantiere ─────────────────────── */}
        <QuoteCard title="Cantiere e materiali" icon={<MapPin className="h-4 w-4" />}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workAddress" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Indirizzo del cantiere
              </Label>
              <Input
                id="workAddress"
                value={workAddress}
                onChange={(e) => setWorkAddress(e.target.value)}
                placeholder="Via del cantiere, 5 — 20100 Milano"
                maxLength={250}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workDescription" className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Cosa va fatto (briefing operativo)
              </Label>
              <Textarea
                id="workDescription"
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                placeholder="Smontaggio infissi vecchi, posa nuovi serramenti PVC, sigillature, ripristino imbotti..."
                rows={4}
                maxLength={2000}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="materialsLocation" className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Posizione materiali
              </Label>
              <Input
                id="materialsLocation"
                value={materialsLocation}
                onChange={(e) => setMaterialsLocation(e.target.value)}
                placeholder="Magazzino appaltatore in via X / cantiere stesso / deposito Y"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                Da dove prelevare la merce: deposito dell'appaltatore, cantiere
                stesso, magazzino esterno.
              </p>
            </div>
          </div>
        </QuoteCard>

        {/* ── Tempistiche ─────────────────────────────────────────── */}
        <QuoteCard title="Tempistiche" icon={<CalendarDays className="h-4 w-4" />}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workStartDate">Data inizio lavori</Label>
              <Input
                id="workStartDate"
                type="date"
                value={workStartDate}
                onChange={(e) => setWorkStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workEndDate">Data fine lavori</Label>
              <Input
                id="workEndDate"
                type="date"
                value={workEndDate}
                onChange={(e) => setWorkEndDate(e.target.value)}
                aria-invalid={!!dateError}
              />
              {dateError && (
                <p className="text-xs text-destructive">{dateError}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Le date alimentano il calendario lavori e l'assegnazione operai
            (gestibili dal dettaglio del lavoro dopo la creazione).
          </p>
        </QuoteCard>

        {/* ── Compenso pattuito + piano pagamenti ─────────────────── */}
        <QuoteCard
          title={aMisura ? "Stima e tetto" : "Compenso e pagamenti"}
          icon={<Wallet className="h-4 w-4" />}
        >
          <div className="space-y-5">
            {/* Importo totale */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="totalAmount">
                  {aMisura ? "Importo stimato (€)" : "Importo totale (€) — netto"}
                </Label>
                <Input
                  id="totalAmount"
                  type="text"
                  inputMode="decimal"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  // Eco al blur: chi scrive "1.500" deve vedere "1.500,00"
                  // (millecinquecento) prima che l'importo entri nel lavoro.
                  onBlur={() => {
                    const v = parseDecimalIT(totalAmount);
                    setTotalAmount(v > 0 ? formatDecimalIT(v) : "");
                  }}
                  placeholder="0,00"
                />
                <p className="text-[11px] text-muted-foreground">
                  {aMisura
                    ? "Quanto pensi di fare. Non è quello che fatturerai: quello esce dal rendiconto."
                    : "Compenso pattuito con il committente (IVA esclusa)."}
                </p>
              </div>

              {/* Il tetto: la cifra oltre la quale il rendicontato deve
                  avvisare. Senza, si lavora oltre l'accordo in silenzio. */}
              {aMisura && (
                <div className="space-y-2">
                  <Label htmlFor="tetto">Tetto concordato (€)</Label>
                  <Input
                    id="tetto"
                    type="text"
                    inputMode="decimal"
                    value={tetto}
                    onChange={(e) => setTetto(e.target.value)}
                    onBlur={() => {
                      const v = parseDecimalIT(tetto);
                      setTetto(v > 0 ? formatDecimalIT(v) : "");
                    }}
                    placeholder="0,00"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Oltre questa cifra la commessa avvisa. Lascialo vuoto se non c'è un limite.
                  </p>
                </div>
              )}

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="rifCommittente">Loro numero d'ordine</Label>
                <Input
                  id="rifCommittente"
                  value={rifCommittente}
                  onChange={(e) => setRifCommittente(e.target.value)}
                  placeholder="ORD/2026/4471"
                  maxLength={100}
                />
                <p className="text-[11px] text-muted-foreground">
                  Va in testa alla fattura. Molti committenti senza il loro riferimento non pagano.
                  {contrattoScelto?.riferimento_committente && (
                    <> Sul contratto c'è <strong>{contrattoScelto.riferimento_committente}</strong>:
                    se questo cantiere ha un ordine suo, scrivi quello.</>
                  )}
                </p>
              </div>
            </div>

            {aMisura ? (
              <Alert>
                <AlertDescription className="text-xs">
                  Niente rate adesso: su una commessa a misura una scadenza
                  sull'importo stimato diventerebbe una previsione di incasso
                  falsa. La scadenza arriva con la fattura del rendiconto, calcolata
                  sui giorni di pagamento del contratto.
                </AlertDescription>
              </Alert>
            ) : (<>
            {/* Modalità pagamento */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Modalità di pagamento
              </Label>
              <Tabs
                value={paymentMode}
                onValueChange={(v) => setPaymentMode(v as LavoroPaymentMode)}
              >
                <TabsList className="grid grid-cols-2 w-full sm:max-w-md">
                  <TabsTrigger value="single">
                    <Wallet className="h-3.5 w-3.5 mr-1.5" />
                    Unica rata (saldo)
                  </TabsTrigger>
                  <TabsTrigger value="installments">
                    <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                    Rateale
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {paymentMode === "installments" && (
                <div className="flex items-center gap-3 pt-2">
                  <Label htmlFor="numInstallments" className="text-xs text-muted-foreground shrink-0">
                    Numero rate
                  </Label>
                  <Select
                    value={String(numInstallments)}
                    onValueChange={(v) => setNumInstallments(parseInt(v, 10))}
                  >
                    <SelectTrigger id="numInstallments" className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 (acconto + saldo)</SelectItem>
                      <SelectItem value="3">3 (2 acconti + saldo)</SelectItem>
                      <SelectItem value="4">4 (3 acconti + saldo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Lista rate */}
            <div className="space-y-2">
              {installments.map((inst) => {
                const isBalance = inst.type === "balance";
                const displayAmount = isBalance ? balanceComputed : inst.amount;
                return (
                  <div
                    key={inst.position}
                    className={`rounded-lg border p-3 sm:p-4 transition-colors ${
                      inst.is_paid
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="mt-0.5 shrink-0">
                        {inst.is_paid ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-800">
                            {inst.label}
                            {isBalance && (
                              <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                Calcolato
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Pagato</span>
                            <Switch
                              checked={inst.is_paid}
                              onCheckedChange={(v) =>
                                updateInstallment(inst.position, {
                                  is_paid: v,
                                  paid_date: v ? (inst.paid_date || new Date().toISOString().slice(0, 10)) : null,
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 ml-7">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          Importo (€)
                        </Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={
                            isBalance
                              ? (displayAmount > 0 ? formatDecimalIT(displayAmount) : "")
                              : (rawInstallmentAmounts[inst.position] ??
                                 (inst.amount > 0 ? formatDecimalIT(inst.amount) : ""))
                          }
                          onChange={(e) => {
                            if (isBalance) return; // saldo è calcolato
                            setRawInstallmentAmounts((prev) => ({
                              ...prev,
                              [inst.position]: e.target.value,
                            }));
                          }}
                          onBlur={() => {
                            if (isBalance) return;
                            handleInstallmentAmountBlur(inst.position);
                          }}
                          placeholder="0,00"
                          disabled={isBalance}
                          className={isBalance ? "bg-slate-50 text-slate-700 font-semibold" : ""}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          Data prevista
                        </Label>
                        <Input
                          type="date"
                          value={inst.expected_date || ""}
                          onChange={(e) =>
                            updateInstallment(inst.position, {
                              expected_date: e.target.value || null,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          {inst.is_paid ? "Data pagamento" : "Data pagamento (se pagato)"}
                        </Label>
                        <Input
                          type="date"
                          value={inst.paid_date || ""}
                          onChange={(e) =>
                            updateInstallment(inst.position, {
                              paid_date: e.target.value || null,
                              is_paid: !!e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Validation banner */}
            {paymentError && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">{paymentError}</AlertDescription>
              </Alert>
            )}

            {/* Sintesi rapida */}
            {totalNum > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <div className="text-slate-500">Totale</div>
                  <div className="font-semibold text-slate-800">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(totalNum)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Acconti</div>
                  <div className="font-semibold text-slate-800">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(depositsSum)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Saldo residuo</div>
                  <div className="font-semibold text-orange-600">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(balanceComputed)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Già incassato</div>
                  <div className="font-semibold text-emerald-600">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(
                      installments
                        .map((i) => (i.type === "balance" ? { ...i, amount: balanceComputed } : i))
                        .filter((i) => i.is_paid)
                        .reduce((s, i) => s + i.amount, 0)
                    )}
                  </div>
                </div>
              </div>
            )}
            </>)}
          </div>
        </QuoteCard>

        {/* ── Note interne ────────────────────────────────────────── */}
        <QuoteCard title="Note interne" icon={<FileText className="h-4 w-4" />}>
          <Textarea
            id="internalNotes"
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="Riferimenti, contatti del responsabile cantiere, vincoli operativi..."
            rows={3}
            maxLength={1000}
          />
        </QuoteCard>
        </div>

        {/* ── Sidebar: riepilogo + actions (sticky su desktop) ─────── */}
        <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-6 lg:self-start">
          <QuoteCard title="Riepilogo lavoro" icon={<HardHat className="h-4 w-4" />} compact>
            <dl className="space-y-2.5 text-xs">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500 shrink-0">Committente</dt>
                <dd className="font-medium text-right text-slate-800 truncate max-w-[60%]">
                  {selectedAppaltatore?.business_name || <em className="text-muted-foreground font-normal">Da selezionare</em>}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500 shrink-0">Contratto</dt>
                <dd className="font-medium text-right text-slate-800 truncate max-w-[60%]">
                  {contrattoScelto?.nome || <em className="text-muted-foreground font-normal">Nessuno</em>}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500 shrink-0">Pagato</dt>
                <dd className="font-medium text-right text-slate-800">
                  {aMisura ? "A misura" : "A corpo"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500 shrink-0">Codice</dt>
                <dd className="font-medium text-right text-slate-800 truncate font-mono text-[11px]">
                  {orderCode.trim() || <em className="text-muted-foreground font-normal font-sans">Auto</em>}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500 shrink-0">Descrizione</dt>
                <dd className="font-medium text-right text-slate-800 truncate max-w-[60%]">
                  {description.trim() || <em className="text-slate-400 font-normal">—</em>}
                </dd>
              </div>
              {workAddress.trim() && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500 shrink-0">Cantiere</dt>
                  <dd className="font-medium text-right text-slate-800 truncate max-w-[60%]">
                    {workAddress.trim()}
                  </dd>
                </div>
              )}
              {durationDays !== null && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500 shrink-0">Durata</dt>
                  <dd className="font-medium text-right text-slate-800">
                    {durationDays} {durationDays === 1 ? "giorno" : "giorni"}
                  </dd>
                </div>
              )}
              {formattedTotal && (
                <div className="flex items-start justify-between gap-3 pt-2 border-t border-slate-100">
                  <dt className="text-slate-500 shrink-0">{aMisura ? "Stima" : "Compenso"}</dt>
                  <dd className="font-bold text-right text-orange-600">
                    {formattedTotal}
                    {aMisura && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        stimato
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {!aMisura && totalNum > 0 && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500 shrink-0">Pagamento</dt>
                  <dd className="font-medium text-right text-slate-800">
                    {paymentMode === "single"
                      ? "Unica rata"
                      : `${numInstallments} rate`}
                  </dd>
                </div>
              )}
            </dl>

            {/* Mini-plan rate */}
            {!aMisura && totalNum > 0 && installments.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                {installments.map((inst) => {
                  const amt = inst.type === "balance" ? balanceComputed : inst.amount;
                  if (amt <= 0 && inst.type !== "balance") return null;
                  return (
                    <div key={inst.position} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="flex items-center gap-1.5 text-slate-600 truncate">
                        {inst.is_paid ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                        ) : (
                          <Circle className="h-3 w-3 text-slate-300 shrink-0" />
                        )}
                        <span className="truncate">{inst.label}</span>
                        {inst.expected_date && (
                          <span className="text-slate-400 hidden sm:inline">
                            · {new Date(inst.expected_date).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                          </span>
                        )}
                      </span>
                      <span className="font-medium text-slate-800 shrink-0">
                        {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(amt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </QuoteCard>

          <QuoteCard noHeader compact className="bg-slate-50/60">
            <div className="space-y-2">
              <QuotePrimaryButton
                type="submit"
                disabled={!canSubmit || createMutation.isPending}
                className="w-full justify-center"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creazione...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Crea il lavoro
                  </>
                )}
              </QuotePrimaryButton>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/azienda/ordini")}
                disabled={createMutation.isPending}
                className="w-full"
              >
                Annulla
              </Button>
              {!canSubmit && !createMutation.isPending && (
                <p className="text-[11px] text-slate-500 text-center pt-1">
                  {!customerId
                    ? "Scegli il committente per continuare."
                    : contrattoMancante
                      ? "A misura serve il contratto: l'importo nasce dalle sue tariffe."
                      : !description.trim()
                        ? "Inserisci una descrizione breve."
                        : dateError
                          ? "Correggi le date dei lavori."
                          : paymentError
                            ? "Acconti superiori al totale."
                            : "Compila i campi obbligatori."}
                </p>
              )}
            </div>
          </QuoteCard>
        </aside>
      </form>
    </div>
  );
}
