/**
 * CreateLavoroAppaltatore — flusso "Nuovo lavoro per appaltatore"
 * ─────────────────────────────────────────────────────────────────
 * Pagina sbloccata dal Modulo Appaltatori (feature flag
 * `appaltatore_module`). Usa lo stesso store `orders` con
 * `order_type='appaltatore_lavoro'` e i campi dedicati `work_*`.
 *
 * Skeleton (Phase 5): solo i campi minimi indispensabili. Le
 * integrazioni (assegnazione operai, calendario lavori, riepilogo
 * finanziario completo) verranno collegate nelle fasi successive,
 * sfruttando le tabelle già esistenti (order_employees,
 * appointments, payments) — niente nuovi store da introdurre.
 */
import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, HardHat, Loader2, MapPin, FileText, Package,
  CalendarDays, Wallet, Save, CheckCircle2, Circle, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
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

interface AppaltatoreOption {
  id: string;
  business_name: string | null;
  fiscal_code: string | null;
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
  const [customerId, setCustomerId] = useState<string>("");
  const [orderCode, setOrderCode] = useState("");
  const [description, setDescription] = useState("");
  const [workAddress, setWorkAddress] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [materialsLocation, setMaterialsLocation] = useState("");
  const [workStartDate, setWorkStartDate] = useState("");
  const [workEndDate, setWorkEndDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  // ── Pagamenti: rate / unica / acconto+saldo ─────────────────────
  const [paymentMode, setPaymentMode] = useState<LavoroPaymentMode>("single");
  const [numInstallments, setNumInstallments] = useState<number>(2); // 2=acconto+saldo, 3=acconto1+acconto2+saldo
  const [installments, setInstallments] = useState<Installment[]>(
    createDefaultInstallments("standard", 1) // default: solo saldo
  );

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
  }, [paymentMode, numInstallments]);

  // Helper update rata
  const updateInstallment = (position: number, patch: Partial<Installment>) => {
    setInstallments((prev) =>
      prev.map((i) => (i.position === position ? { ...i, ...patch } : i))
    );
  };

  // ── Lista appaltatori già censiti per la company corrente ─────
  const { data: appaltatori = [], isLoading: loadingAppaltatori } = useQuery({
    queryKey: ["appaltatori-list", companyId],
    queryFn: async (): Promise<AppaltatoreOption[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, business_name, fiscal_code")
        // @ts-expect-error customer_type type non ancora rigenerato dopo migration
        .eq("customer_type", "appaltatore")
        .eq("company_id", companyId)
        .order("business_name", { ascending: true });
      if (error) throw error;
      return (data || []) as AppaltatoreOption[];
    },
    enabled: !!companyId && featureEnabled,
  });

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

  const canSubmit =
    !!companyId &&
    !!customerId &&
    description.trim().length > 0 &&
    !dateError &&
    !paymentError;

  // ── Mutation: insert orders + installments + redirect ──────────
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile.");
      if (!customerId) throw new Error("Seleziona un appaltatore.");

      const totalVal = totalAmount ? parseDecimalIT(totalAmount) : 0;
      if (Number.isNaN(totalVal) || totalVal < 0) {
        throw new Error("Importo non valido.");
      }

      // Calcolo rate finali: saldo = totale - somma acconti
      const installmentsForSave: Installment[] = installments.map((i) =>
        i.type === "balance" ? { ...i, amount: balanceComputed } : i
      );
      const legacy = installmentsToLegacyColumns(installmentsForSave);

      const payload = {
        company_id: companyId,
        customer_id: customerId,
        order_code: orderCode.trim() || null,
        description: description.trim(),
        total_amount: totalVal,
        ...legacy,
        vat_rate: 22,
        payment_type: paymentMode === "single" ? "balance" : "standard",
        // Campi specifici Modulo Appaltatori
        order_type: "appaltatore_lavoro",
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
    ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(totalForSummary)
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
        title="Nuovo lavoro per appaltatore"
        subtitle="Sola manodopera commissionata da un'impresa committente."
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
          title="Appaltatore committente"
          icon={<HardHat className="h-4 w-4" />}
          subtitle="Impresa che ti commissiona il lavoro di manodopera."
        >
          <div className="space-y-3">
            <Label htmlFor="customer">Appaltatore *</Label>
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
            {appaltatori.length === 0 && !loadingAppaltatori && (
              <Alert>
                <AlertDescription className="text-xs">
                  Per creare un lavoro hai bisogno di almeno un cliente di tipo
                  <strong> Appaltatore </strong>in anagrafica. Vai su
                  <Button
                    variant="link"
                    className="px-1 h-auto"
                    onClick={() => navigate("/azienda/clienti/nuovo")}
                  >
                    Nuovo cliente
                  </Button>
                  e seleziona la categoria <em>Cliente appaltatore</em>.
                </AlertDescription>
              </Alert>
            )}
          </div>
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
        <QuoteCard title="Compenso e pagamenti" icon={<Wallet className="h-4 w-4" />}>
          <div className="space-y-5">
            {/* Importo totale */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="totalAmount">Importo totale (€) — netto</Label>
                <Input
                  id="totalAmount"
                  type="text"
                  inputMode="decimal"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0,00"
                />
                <p className="text-[11px] text-muted-foreground">
                  Compenso pattuito per la sola manodopera (IVA esclusa).
                </p>
              </div>
            </div>

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
                          value={isBalance ? (displayAmount > 0 ? displayAmount.toFixed(2) : "") : (inst.amount > 0 ? String(inst.amount) : "")}
                          onChange={(e) => {
                            if (isBalance) return; // saldo è calcolato
                            const v = parseDecimalIT(e.target.value);
                            updateInstallment(inst.position, { amount: v });
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
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(totalNum)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Acconti</div>
                  <div className="font-semibold text-slate-800">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(depositsSum)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Saldo residuo</div>
                  <div className="font-semibold text-orange-600">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(balanceComputed)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Già incassato</div>
                  <div className="font-semibold text-emerald-600">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
                      installments
                        .map((i) => (i.type === "balance" ? { ...i, amount: balanceComputed } : i))
                        .filter((i) => i.is_paid)
                        .reduce((s, i) => s + i.amount, 0)
                    )}
                  </div>
                </div>
              </div>
            )}
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
                <dt className="text-slate-500 shrink-0">Appaltatore</dt>
                <dd className="font-medium text-right text-slate-800 truncate max-w-[60%]">
                  {selectedAppaltatore?.business_name || <em className="text-muted-foreground font-normal">Da selezionare</em>}
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
                  <dt className="text-slate-500 shrink-0">Compenso</dt>
                  <dd className="font-bold text-right text-orange-600">{formattedTotal}</dd>
                </div>
              )}
              {totalNum > 0 && (
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
            {totalNum > 0 && installments.length > 0 && (
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
                        {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amt)}
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
                    Crea lavoro
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
                    ? "Seleziona un appaltatore per continuare."
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
