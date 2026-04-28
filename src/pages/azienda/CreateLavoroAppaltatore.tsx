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
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, HardHat, Loader2, MapPin, FileText, Package,
  CalendarDays, Wallet, Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useAppaltatoreModuleEnabled } from "@/hooks/useAppaltatoreModule";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  QuotePageHeader, QuoteCard, QuotePrimaryButton,
} from "@/components/marketing/preventivi/ui/builderUI";

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

  const canSubmit =
    !!companyId &&
    !!customerId &&
    description.trim().length > 0 &&
    !dateError;

  // ── Mutation: insert orders + redirect a /azienda/ordini/:id ───
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile.");
      if (!customerId) throw new Error("Seleziona un appaltatore.");

      const totalVal = totalAmount ? Number(totalAmount.replace(",", ".")) : 0;
      if (Number.isNaN(totalVal) || totalVal < 0) {
        throw new Error("Importo non valido.");
      }

      const payload = {
        company_id: companyId,
        customer_id: customerId,
        order_code: orderCode.trim() || null,
        description: description.trim(),
        total_amount: totalVal,
        balance_amount: totalVal,
        deposit_amount: 0,
        deposit_2_amount: 0,
        vat_rate: 22,
        payment_type: "balance",
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
      return data as { id: string };
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

  // ── Guard: feature disattivata → redirect alla lista ordini ────
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
          Torna agli ordini
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
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
        className="space-y-6"
      >
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

        {/* ── Riepilogo finanziario (semplice) ────────────────────── */}
        <QuoteCard title="Compenso pattuito" icon={<Wallet className="h-4 w-4" />}>
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
              <p className="text-xs text-muted-foreground">
                Compenso pattuito per la sola manodopera. Acconti, fatture e
                pagamenti si gestiscono dal dettaglio dopo la creazione.
              </p>
            </div>
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

        {/* ── Action bar ──────────────────────────────────────────── */}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/azienda/ordini")}
            disabled={createMutation.isPending}
          >
            Annulla
          </Button>
          <QuotePrimaryButton
            type="submit"
            disabled={!canSubmit || createMutation.isPending}
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
        </div>
      </form>
    </div>
  );
}
