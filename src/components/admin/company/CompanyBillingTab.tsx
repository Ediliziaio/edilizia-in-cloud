import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { escapeCsvCell } from "@/lib/csvExport";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Mail, Bot, MessageSquare, Phone, CreditCard, Plus, Minus, Loader2,
  Settings2, ShieldAlert, Download, AlertTriangle, Wallet, RotateCcw,
  Search, Filter, Info, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { cn } from "@/lib/utils";

const SERVICES = [
  { key: "email", label: "Email Marketing", icon: Mail },
  { key: "ai_agents", label: "Agenti AI", icon: Bot },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "phone_numbers", label: "Numeri di Telefono", icon: Phone },
] as const;

const CREDIT_SERVICES = ["email", "ai_agents", "whatsapp", "sms"] as const;
type CreditService = (typeof CREDIT_SERVICES)[number];

interface BillingOverride {
  id: string;
  company_id: string;
  service: string;
  is_enabled: boolean;
  is_free: boolean;
  price_per_unit_eur: number | null;
  markup_multiplier: number | null;
  monthly_fee_eur: number | null;
  custom_notes: string | null;
  custom_max_orders: number | null;
  updated_at: string;
}

interface AdjustDialog {
  open: boolean;
  service: CreditService | "";
  direction: "add" | "deduct";
}

const PAGE_SIZE = 50;

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : "Errore durante l'aggiornamento crediti";
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: string; message?: string };
      return payload.error || payload.message || fallback;
    } catch {
      try {
        const text = await context.clone().text();
        return text || fallback;
      } catch {
        return fallback;
      }
    }
  }
  return fallback;
}

/**
 * Form locale per un singolo Service Control.
 *
 * FIX critici applicati:
 * - INPUT CONTROLLATI: prima usava `defaultValue` (uncontrolled) → quando
 *   l'override cambiava per refetch, l'input non si aggiornava (mostrava
 *   sempre il valore al primo mount). Ora `value` con sync via useEffect.
 * - DEBOUNCE: prima ogni onBlur scatenava upsert separato, e cambiare
 *   4 campi in sequenza generava 4 mutation in race. Ora 1 useState locale
 *   con bottone "Salva" + indicatore "modificato" — esplicito, niente race.
 * - DEFAULT VISIBILE: prima placeholder "Default" non diceva quale.
 *   Ora se override null, l'input mostra il default come hint inline.
 * - RESET: bottone per cancellare l'override per quel servizio (DELETE row).
 */
function ServiceControlRow({
  service, label, icon: Icon,
  override, planDefaults,
  onSave, onReset,
  isSaving, isResetting,
}: {
  service: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  override: BillingOverride | null;
  planDefaults: { price_per_unit_eur: number | null; markup_multiplier: number | null; monthly_fee_eur: number | null };
  onSave: (payload: Partial<BillingOverride> & { service: string }) => void;
  onReset: () => void;
  isSaving: boolean;
  isResetting: boolean;
}) {
  const [isEnabled, setIsEnabled] = useState(override?.is_enabled ?? true);
  const [isFree, setIsFree] = useState(override?.is_free ?? false);
  const [price, setPrice] = useState(override?.price_per_unit_eur?.toString() ?? "");
  const [markup, setMarkup] = useState(override?.markup_multiplier?.toString() ?? "");
  const [fee, setFee] = useState(override?.monthly_fee_eur?.toString() ?? "");
  const [notes, setNotes] = useState(override?.custom_notes ?? "");

  // Sync con override quando cambia (es. dopo refetch successivo a save)
  // FIX: prima `defaultValue` era one-shot al mount → input restava stale.
  useEffect(() => {
    setIsEnabled(override?.is_enabled ?? true);
    setIsFree(override?.is_free ?? false);
    setPrice(override?.price_per_unit_eur?.toString() ?? "");
    setMarkup(override?.markup_multiplier?.toString() ?? "");
    setFee(override?.monthly_fee_eur?.toString() ?? "");
    setNotes(override?.custom_notes ?? "");
  }, [override]);

  // Detect "dirty" (l'utente ha modificato qualcosa)
  const isDirty =
    isEnabled !== (override?.is_enabled ?? true) ||
    isFree !== (override?.is_free ?? false) ||
    price !== (override?.price_per_unit_eur?.toString() ?? "") ||
    markup !== (override?.markup_multiplier?.toString() ?? "") ||
    fee !== (override?.monthly_fee_eur?.toString() ?? "") ||
    notes !== (override?.custom_notes ?? "");

  const parseNumber = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };

  const handleSave = () => {
    onSave({
      service,
      is_enabled: isEnabled,
      is_free: isFree,
      price_per_unit_eur: parseNumber(price),
      markup_multiplier: parseNumber(markup),
      monthly_fee_eur: parseNumber(fee),
      custom_notes: notes.trim() || null,
    });
  };

  // Toggle rapido: applica immediatamente solo per is_enabled / is_free
  // (operazioni "binary" senza ambiguità — meritano scrittura immediata)
  const toggleEnabled = (checked: boolean) => {
    setIsEnabled(checked);
    onSave({ service, is_enabled: checked });
  };
  const toggleFree = (checked: boolean) => {
    setIsFree(checked);
    onSave({ service, is_free: checked });
  };

  return (
    <div
      className={cn(
        "border rounded-lg p-4 space-y-3 transition-colors",
        isDirty && "border-primary/40 bg-primary/5",
        !isEnabled && "border-rose-300 bg-rose-50/30 dark:bg-rose-950/10",
      )}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{label}</span>
          {!isEnabled && (
            <Badge variant="destructive" className="text-xs">
              Disabilitato
            </Badge>
          )}
          {isFree && (
            <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Gratuito
            </Badge>
          )}
          {override && (
            <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 text-amber-700">
              <ShieldAlert className="h-2.5 w-2.5" />
              Override attivo
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Abilitato</Label>
            <Switch
              checked={isEnabled}
              onCheckedChange={toggleEnabled}
              disabled={isSaving}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Gratuito</Label>
            <Switch
              checked={isFree}
              onCheckedChange={toggleFree}
              disabled={isSaving}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Prezzo unitario (€)</Label>
          <Input
            type="number"
            step="0.0001"
            min="0"
            placeholder={
              planDefaults.price_per_unit_eur != null
                ? `Default ${planDefaults.price_per_unit_eur}`
                : "Default"
            }
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Markup (×)</Label>
          <Input
            type="number"
            step="0.1"
            min="1"
            placeholder={
              planDefaults.markup_multiplier != null
                ? `Default ${planDefaults.markup_multiplier}`
                : "Default"
            }
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Fee mensile (€)</Label>
          <Input
            type="number"
            step="1"
            min="0"
            placeholder={
              planDefaults.monthly_fee_eur != null
                ? `Default ${planDefaults.monthly_fee_eur}`
                : "Default"
            }
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Note interne</Label>
          <Input
            placeholder="—"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Action bar: visibile solo se ci sono modifiche oppure se override esiste */}
      {(isDirty || override) && (
        <div className="flex items-center gap-2 pt-2 border-t">
          {isDirty && (
            <>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="h-8 text-xs"
              >
                {isSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Salva modifiche
              </Button>
              <span className="text-xs text-muted-foreground">
                Modifiche non salvate
              </span>
            </>
          )}
          {override && !isDirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onReset}
              disabled={isResetting}
              className="h-8 text-xs text-destructive hover:text-destructive"
            >
              {isResetting ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3 mr-1" />
              )}
              Rimuovi override
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function CompanyBillingTab({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { permissions } = useSuperAdminPermissions();
  const [adjustDialog, setAdjustDialog] = useState<AdjustDialog>({ open: false, service: "", direction: "add" });
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustmentsPage, setAdjustmentsPage] = useState(0);
  const [customMaxOrders, setCustomMaxOrders] = useState<string>("");

  // Filtri storico aggiustamenti (nuovi)
  const [adjustmentsServiceFilter, setAdjustmentsServiceFilter] = useState<string>("all");
  const [adjustmentsSearch, setAdjustmentsSearch] = useState("");

  // Plan pricing override
  const { data: planOverride, refetch: refetchOverride } = useQuery({
    queryKey: ['company-plan-override', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_billing_overrides' as never)
        .select('*')
        .eq('company_id' as never, companyId as never)
        .eq('service' as never, 'plan' as never)
        .maybeSingle();
      if (error) throw new Error(await getFunctionErrorMessage(error));
      return data as {
        custom_plan_price_eur: number | null;
        override_notes: string | null;
        override_expires_at: string | null;
      } | null;
    },
    enabled: !!companyId && permissions.pricing_override,
  });

  const [overridePrice, setOverridePrice] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [overrideExpiry, setOverrideExpiry] = useState('');

  // Sync planOverride → form locale (FIX: prima il form era sempre vuoto al primo render)
  const planOverrideSyncRef = useRef(false);
  useEffect(() => {
    if (planOverrideSyncRef.current) return;
    if (planOverride !== undefined) {
      setOverridePrice(planOverride?.custom_plan_price_eur?.toString() ?? "");
      setOverrideNotes(planOverride?.override_notes ?? "");
      // FIX TIMEZONE: il DB ha timestamptz, ma <input type="date"> vuole YYYY-MM-DD.
      // Estrai solo la parte data senza conversione timezone (assumiamo data salvata
      // come UTC midnight e mostrata come tale).
      setOverrideExpiry(
        planOverride?.override_expires_at
          ? planOverride.override_expires_at.slice(0, 10)
          : "",
      );
      planOverrideSyncRef.current = true;
    }
  }, [planOverride]);

  const saveOverrideMutation = useMutation({
    mutationFn: async () => {
      // FIX TIMEZONE: se la data è "YYYY-MM-DD" senza ora, la trasformiamo in
      // ISO timestamp esplicito a midnight UTC per evitare ambiguità.
      const expiryIso = overrideExpiry
        ? new Date(`${overrideExpiry}T23:59:59.999Z`).toISOString()
        : null;
      const priceNum = overridePrice ? Number(overridePrice) : null;
      if (priceNum != null && (!Number.isFinite(priceNum) || priceNum < 0)) {
        throw new Error("Prezzo non valido");
      }
      const { error } = await supabase
        .from('company_billing_overrides' as never)
        .upsert({
          company_id: companyId,
          service: 'plan',
          custom_plan_price_eur: priceNum,
          override_notes: overrideNotes || null,
          override_expires_at: expiryIso,
          is_enabled: true,
          updated_at: new Date().toISOString(),
        } as never, { onConflict: 'company_id,service' } as never);
      if (error) throw new Error(await getFunctionErrorMessage(error));
    },
    onSuccess: () => {
      toast.success('Override prezzo salvato');
      // FIX: invalidation completa (prima solo refetchOverride)
      void refetchOverride();
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.detail(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull });
      planOverrideSyncRef.current = false; // permette re-sync con nuovi dati
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mutation per RIMUOVERE l'override prezzo piano (delete row 'plan')
  const removeOverrideMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('company_billing_overrides' as never)
        .delete()
        .eq('company_id', companyId)
        .eq('service' as never, 'plan' as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Override prezzo rimosso");
      setOverridePrice("");
      setOverrideNotes("");
      setOverrideExpiry("");
      void refetchOverride();
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.detail(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull });
      planOverrideSyncRef.current = false;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Fetch overrides
  const { data: overrides, isLoading: overridesLoading } = useQuery({
    queryKey: queryKeys.billingOverrides.byCompany(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_billing_overrides" as never)
        .select("*")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as unknown as BillingOverride[];
    },
  });

  // Fetch global limits override row (service = '_limits')
  const { data: limitsOverride } = useQuery({
    queryKey: [...queryKeys.billingOverrides.byCompany(companyId), "_limits"],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_billing_overrides" as never)
        .select("custom_max_orders")
        .eq("company_id", companyId)
        .eq("service" as never, "_limits")
        .maybeSingle();
      return data as { custom_max_orders: number | null } | null;
    },
  });

  // Sync solo al PRIMO load effettivo, non ad ogni refetch
  const limitsSyncedRef = useRef(false);
  useEffect(() => {
    if (limitsSyncedRef.current) return;
    if (limitsOverride?.custom_max_orders != null) {
      setCustomMaxOrders(String(limitsOverride.custom_max_orders));
      limitsSyncedRef.current = true;
    } else if (limitsOverride === null) {
      limitsSyncedRef.current = true;
    }
  }, [limitsOverride]);

  // Save custom_max_orders limit override
  // FIX: validazione parseInt — accetta anche "-1" (illimitato) ma non NaN
  const saveLimitsOverride = useMutation({
    mutationFn: async (maxOrders: number | null) => {
      if (maxOrders !== null && (!Number.isFinite(maxOrders) || !Number.isInteger(maxOrders))) {
        throw new Error("Limite ordini deve essere intero (-1 = illimitato)");
      }
      if (maxOrders !== null && maxOrders < -1) {
        throw new Error("Limite ordini non può essere < -1");
      }
      const { error } = await supabase
        .from("company_billing_overrides" as never)
        .upsert(
          { company_id: companyId, service: "_limits", custom_max_orders: maxOrders, updated_at: new Date().toISOString(), updated_by: user?.id } as never,
          { onConflict: "company_id,service" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.billingOverrides.byCompany(companyId), "_limits"] });
      toast.success("Limite ordini personalizzato salvato");
    },
    onError: (e: Error) => toast.error("Errore: " + e.message),
  });

  // Reset override per servizio (DELETE riga billing_overrides)
  const removeServiceOverrideMutation = useMutation({
    mutationFn: async (service: string) => {
      const { error } = await supabase
        .from("company_billing_overrides" as never)
        .delete()
        .eq("company_id", companyId)
        .eq("service" as never, service as never);
      if (error) throw error;
    },
    onSuccess: (_data, service) => {
      toast.success(`Override ${service} rimosso`);
      queryClient.invalidateQueries({ queryKey: queryKeys.billingOverrides.byCompany(companyId) });
    },
    onError: (e: Error) => toast.error("Errore reset: " + e.message),
  });

  // Fetch credit balances
  const { data: emailCredits } = useQuery({
    queryKey: queryKeys.admin.emailCredits(companyId),
    queryFn: async () => {
      const { data } = await supabase.from("email_credits").select("balance_eur").eq("company_id", companyId).maybeSingle();
      return data;
    },
  });

  const { data: aiCredits } = useQuery({
    queryKey: queryKeys.admin.aiCreditsAdmin(companyId),
    queryFn: async () => {
      const { data } = await supabase.from("ai_credits" as never).select("balance_eur").eq("company_id", companyId).maybeSingle();
      return data as { balance_eur: number } | null;
    },
  });

  const { data: waCredits } = useQuery({
    queryKey: queryKeys.admin.waCredits(companyId),
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_credits" as never).select("balance_eur").eq("company_id", companyId).maybeSingle();
      return data as { balance_eur: number } | null;
    },
  });

  // SMS usa un wallet separato (sms_wallet.crediti = saldo EUR). Il saldo
  // disponibile è crediti − crediti_riservati (riservati = invii in corso).
  const { data: smsWallet } = useQuery({
    queryKey: queryKeys.admin.smsWallet(companyId),
    queryFn: async () => {
      const { data } = await supabase.from("sms_wallet" as never).select("crediti, crediti_riservati").eq("company_id", companyId).maybeSingle();
      return data as { crediti: number; crediti_riservati: number } | null;
    },
  });

  // Fetch adjustments history with pagination
  const { data: adjustments, isLoading: adjustmentsLoading } = useQuery({
    queryKey: [...queryKeys.admin.creditAdjustments(companyId), adjustmentsPage, adjustmentsServiceFilter],
    queryFn: async () => {
      // count SEMPRE "exact": con "planned" sulle pagine >0 Supabase ritorna
      // count=null → total=0 → adjustmentsTotalPages=1 → l'intero controllo di
      // paginazione spariva (impossibile tornare indietro o avanzare). La
      // tabella per-azienda è piccola, il costo del count esatto è trascurabile.
      let q = supabase
        .from("admin_credit_adjustments" as never)
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(adjustmentsPage * PAGE_SIZE, (adjustmentsPage + 1) * PAGE_SIZE - 1);
      if (adjustmentsServiceFilter !== "all") {
        q = q.eq("service" as never, adjustmentsServiceFilter as never);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return {
        rows: (data ?? []) as unknown as Array<{
          id: string; service: string; amount_eur: number; reason: string; created_by: string; created_at: string;
        }>,
        total: count ?? 0,
      };
    },
  });

  // FIX: search client-side dentro la pagina corrente
  const filteredAdjustments = useMemo(() => {
    const q = adjustmentsSearch.trim().toLowerCase();
    if (!q) return adjustments?.rows ?? [];
    return (adjustments?.rows ?? []).filter(
      (a) =>
        (a.reason ?? "").toLowerCase().includes(q) ||
        (a.service ?? "").toLowerCase().includes(q),
    );
  }, [adjustments?.rows, adjustmentsSearch]);

  // FIX: pagination corretta usando count (non length === PAGE_SIZE che dà falso positivo)
  const adjustmentsTotal = adjustments?.total ?? 0;
  const adjustmentsTotalPages = Math.max(1, Math.ceil(adjustmentsTotal / PAGE_SIZE));

  // Upsert override
  const upsertOverride = useMutation({
    mutationFn: async (payload: Partial<BillingOverride> & { service: string }) => {
      const { error } = await supabase
        .from("company_billing_overrides" as never)
        .upsert(
          { company_id: companyId, ...payload, updated_at: new Date().toISOString(), updated_by: user?.id } as never,
          { onConflict: "company_id,service" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billingOverrides.byCompany(companyId) });
      toast.success("Override salvato");
    },
    onError: (e: Error) => toast.error("Errore: " + e.message),
  });

  // Adjust credits via edge function
  const adjustCredits = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(adjustAmount);
      if (!amount || amount <= 0) throw new Error("Importo non valido");
      if (!adjustReason.trim()) throw new Error("Motivazione obbligatoria");
      if (!adjustDialog.service) throw new Error("Servizio non selezionato");

      const finalAmount = adjustDialog.direction === "deduct" ? -amount : amount;

      const { data, error } = await supabase.functions.invoke("admin-adjust-credits", {
        body: {
          company_id: companyId,
          service: adjustDialog.service,
          amount_eur: finalAmount,
          reason: adjustReason.trim(),
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Crediti aggiornati: ${formatCurrency(data.balance_before)} → ${formatCurrency(data.balance_after)}`);
      setAdjustDialog({ open: false, service: "", direction: "add" });
      setAdjustAmount("");
      setAdjustReason("");
      // FIX: reset alla prima pagina per vedere il nuovo record + invalidate complete
      setAdjustmentsPage(0);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.emailCredits(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.aiCreditsAdmin(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.waCredits(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.smsWallet(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.creditAdjustments(companyId) });
      // Anche storico transazioni unificato (se montato)
      queryClient.invalidateQueries({ queryKey: ["admin-credit-transactions-unified", companyId] });
      queryClient.invalidateQueries({ queryKey: ["admin-credit-transactions-kpi", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // FIX: getOverride memoizzato (Map by service) per evitare Array.find ad ogni render
  const overrideByService = useMemo(() => {
    const map = new Map<string, BillingOverride>();
    (overrides ?? []).forEach((o) => map.set(o.service, o));
    return map;
  }, [overrides]);

  // Saldo SMS disponibile = crediti − riservati
  const smsBalance = (smsWallet?.crediti ?? 0) - (smsWallet?.crediti_riservati ?? 0);

  const getBalance = (service: string) => {
    if (service === "email") return emailCredits?.balance_eur ?? 0;
    if (service === "ai_agents") return aiCredits?.balance_eur ?? 0;
    if (service === "whatsapp") return waCredits?.balance_eur ?? 0;
    if (service === "sms") return smsBalance;
    return 0;
  };

  // Saldo totale crediti (email + ai + whatsapp + sms)
  const totalCreditsBalance =
    (emailCredits?.balance_eur ?? 0) +
    (aiCredits?.balance_eur ?? 0) +
    (waCredits?.balance_eur ?? 0) +
    smsBalance;

  // Allarme: saldo negativo su qualsiasi servizio
  const hasNegativeBalance = CREDIT_SERVICES.some((s) => getBalance(s) < 0);

  // Export CSV degli aggiustamenti correnti (filtrati)
  const handleExportAdjustmentsCsv = () => {
    if (filteredAdjustments.length === 0) return;
    const escape = (v: string | number | null | undefined) => escapeCsvCell(v, ",");
    const headers = ["Data", "Servizio", "Importo (EUR)", "Motivazione", "Creato da"];
    const rows = filteredAdjustments.map((a) =>
      [
        escape(format(new Date(a.created_at), "yyyy-MM-dd HH:mm")),
        escape(a.service),
        escape(a.amount_eur.toFixed(4)),
        escape(a.reason),
        escape(a.created_by),
      ].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credit-adjustments-${companyId.slice(0, 8)}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Esportati ${filteredAdjustments.length} aggiustamenti`);
  };

  if (overridesLoading) {
    return <Skeleton className="h-[400px]" />;
  }

  return (
    <div className="space-y-6">
      {/* Banner saldo totale + warning */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Saldo totale crediti
                </p>
                <p
                  className={`text-2xl font-bold ${
                    hasNegativeBalance ? "text-destructive" : ""
                  }`}
                >
                  {formatCurrency(totalCreditsBalance)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {CREDIT_SERVICES.map((svc) => {
                const balance = getBalance(svc);
                const labels: Record<string, string> = {
                  email: "Email",
                  ai_agents: "AI",
                  whatsapp: "WA",
                  sms: "SMS",
                };
                return (
                  <Badge
                    key={svc}
                    variant="outline"
                    className={
                      balance < 0
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-300"
                        : ""
                    }
                  >
                    {labels[svc]}: {formatCurrency(balance)}
                  </Badge>
                );
              })}
            </div>
          </div>
          {hasNegativeBalance && (
            <div className="flex items-center gap-2 mt-3 p-2 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">
                <strong>Saldo negativo</strong> su uno o più servizi. L'azienda potrebbe
                non poter più usarli finché non si aggiusta il saldo.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Service Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Controllo Servizi
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Per ogni servizio puoi: abilitare/disabilitare (lock immediato),
                  marcare come gratuito (no fatturazione), customizzare prezzo
                  unitario, markup e fee mensile. Le modifiche numeriche richiedono
                  click "Salva" per evitare race condition.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {SERVICES.map(({ key, label, icon }) => {
            const override = overrideByService.get(key) ?? null;
            return (
              <ServiceControlRow
                key={key}
                service={key}
                label={label}
                icon={icon}
                override={override}
                planDefaults={{
                  price_per_unit_eur: null, // TODO: caricare default dal piano se serve
                  markup_multiplier: null,
                  monthly_fee_eur: null,
                }}
                onSave={(payload) => upsertOverride.mutate(payload)}
                onReset={() => removeServiceOverrideMutation.mutate(key)}
                isSaving={upsertOverride.isPending}
                isResetting={
                  removeServiceOverrideMutation.isPending &&
                  removeServiceOverrideMutation.variables === key
                }
              />
            );
          })}
        </CardContent>
      </Card>

      {/* Plan Limits Override */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Override Limiti di Piano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 max-w-sm flex-wrap">
            <div className="flex-1 space-y-1.5 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">
                Limite ordini personalizzato
                <span className="ml-1 text-xs text-muted-foreground/60">(vuoto = piano)</span>
              </Label>
              <Input
                type="number"
                min="-1"
                step="1"
                placeholder="Es: 500 (-1 = ∞)"
                value={customMaxOrders}
                onChange={(e) => setCustomMaxOrders(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <Button
              size="sm"
              disabled={saveLimitsOverride.isPending}
              onClick={() => {
                // FIX: parseInt safe — rifiuta valori non numerici e NaN
                const trimmed = customMaxOrders.trim();
                if (!trimmed) {
                  saveLimitsOverride.mutate(null);
                  return;
                }
                const val = parseInt(trimmed, 10);
                if (!Number.isFinite(val) || isNaN(val)) {
                  toast.error("Inserisci un numero intero valido");
                  return;
                }
                saveLimitsOverride.mutate(val);
              }}
              className="h-9"
            >
              {saveLimitsOverride.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              Salva
            </Button>
            {customMaxOrders && (
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                disabled={saveLimitsOverride.isPending}
                onClick={() => {
                  setCustomMaxOrders("");
                  saveLimitsOverride.mutate(null);
                }}
              >
                <X className="h-3 w-3 mr-1" />
                Rimuovi
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Sovrascrive il limite ordini del piano. Imposta a <code>-1</code> per illimitato.
          </p>
        </CardContent>
      </Card>

      {/* Plan Pricing Override */}
      {permissions.pricing_override && (
        <Card className="border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                Override Prezzo Piano
              </CardTitle>
              {planOverride?.custom_plan_price_eur != null && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  disabled={removeOverrideMutation.isPending}
                  onClick={() => removeOverrideMutation.mutate()}
                >
                  {removeOverrideMutation.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <X className="h-3 w-3 mr-1" />
                  )}
                  Rimuovi override
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {planOverride?.custom_plan_price_eur != null && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-amber-700 border-amber-400">
                  Override attivo: {formatCurrency(planOverride.custom_plan_price_eur)}/mese
                </Badge>
                {planOverride.override_expires_at && (
                  <span className="text-xs text-muted-foreground">
                    Scade: {format(new Date(planOverride.override_expires_at), 'dd/MM/yyyy', { locale: it })}
                  </span>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Prezzo mensile personalizzato (€)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={overridePrice}
                  onChange={(e) => setOverridePrice(e.target.value)}
                  placeholder={planOverride?.custom_plan_price_eur?.toString() ?? "Es. 49.00"}
                />
              </div>
              <div>
                <Label className="text-xs">Scadenza override</Label>
                <Input
                  type="date"
                  value={overrideExpiry}
                  onChange={(e) => setOverrideExpiry(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note interne</Label>
              <Textarea
                value={overrideNotes}
                onChange={(e) => setOverrideNotes(e.target.value)}
                placeholder="Es: Deal commerciale Q1 2025 — accordo con CEO"
                rows={2}
              />
            </div>
            <Button
              size="sm"
              onClick={() => saveOverrideMutation.mutate()}
              disabled={saveOverrideMutation.isPending || !overridePrice.trim()}
            >
              {saveOverrideMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              )}
              Salva Override
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Credit Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Gestione Crediti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CREDIT_SERVICES.map((svc) => {
              const labels: Record<string, string> = { email: "Email", ai_agents: "AI", whatsapp: "WhatsApp", sms: "SMS" };
              const balance = getBalance(svc);
              const isNegative = balance < 0;
              return (
                <div
                  key={svc}
                  className={cn(
                    "border rounded-lg p-4 space-y-3",
                    isNegative && "border-destructive bg-destructive/5",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{labels[svc]}</span>
                    <span
                      className={cn(
                        "text-lg font-bold",
                        isNegative && "text-destructive",
                      )}
                    >
                      {formatCurrency(balance)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        setAdjustDialog({ open: true, service: svc, direction: "add" })
                      }
                    >
                      <Plus className="h-3 w-3 mr-1" /> Aggiungi
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={balance <= 0}
                      title={balance <= 0 ? "Saldo a zero, nulla da dedurre" : undefined}
                      onClick={() =>
                        setAdjustDialog({ open: true, service: svc, direction: "deduct" })
                      }
                    >
                      <Minus className="h-3 w-3 mr-1" /> Deduci
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Adjustments History — search + filter + export */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Storico Aggiustamenti</CardTitle>
            <div className="flex items-center gap-2">
              {filteredAdjustments.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportAdjustmentsCsv}
                  className="h-8 text-xs"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  CSV
                </Button>
              )}
            </div>
          </div>
          {/* Toolbar filtri */}
          <div className="flex items-center gap-2 flex-wrap pt-2">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca motivo o servizio..."
                value={adjustmentsSearch}
                onChange={(e) => setAdjustmentsSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Select
              value={adjustmentsServiceFilter}
              onValueChange={(v) => {
                setAdjustmentsServiceFilter(v);
                setAdjustmentsPage(0);
              }}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i servizi</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="ai_agents">AI Agents</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="render">Render</SelectItem>
              </SelectContent>
            </Select>
            {(adjustmentsSearch || adjustmentsServiceFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setAdjustmentsSearch("");
                  setAdjustmentsServiceFilter("all");
                  setAdjustmentsPage(0);
                }}
              >
                <Filter className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {adjustmentsLoading ? (
            <Skeleton className="h-32" />
          ) : !adjustments || adjustmentsTotal === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessun aggiustamento registrato.
            </p>
          ) : filteredAdjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessun aggiustamento corrisponde a "{adjustmentsSearch}".
            </p>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Servizio</TableHead>
                      <TableHead>Importo</TableHead>
                      <TableHead>Motivazione</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAdjustments.map((adj) => (
                      <TableRow key={adj.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {format(new Date(adj.created_at), "dd/MM/yy HH:mm", { locale: it })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{adj.service}</Badge>
                        </TableCell>
                        <TableCell
                          className={`font-mono font-semibold ${
                            adj.amount_eur >= 0 ? "text-emerald-600" : "text-destructive"
                          }`}
                        >
                          {adj.amount_eur >= 0 ? "+" : ""}
                          {formatCurrency(adj.amount_eur)}
                        </TableCell>
                        <TableCell
                          className="text-xs max-w-[260px] truncate"
                          title={adj.reason}
                        >
                          {adj.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* FIX: pagination basata su `total` (non length === PAGE_SIZE che dà falso positivo) */}
              {adjustmentsTotalPages > 1 && (
                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <span>
                    {adjustmentsSearch
                      ? `${filteredAdjustments.length} di ${adjustments.rows.length} (filtrate)`
                      : `${adjustmentsTotal} aggiustamenti`}{" "}
                    · Pagina {adjustmentsPage + 1} di {adjustmentsTotalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={adjustmentsPage === 0}
                      onClick={() => setAdjustmentsPage((p) => Math.max(0, p - 1))}
                    >
                      Precedente
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={adjustmentsPage >= adjustmentsTotalPages - 1}
                      onClick={() => setAdjustmentsPage((p) => p + 1)}
                    >
                      Successiva
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Adjust Dialog */}
      <Dialog
        open={adjustDialog.open}
        onOpenChange={(open) => {
          if (!open && adjustCredits.isPending) return; // blocca chiusura durante mutation
          if (!open) setAdjustDialog({ open: false, service: "", direction: "add" });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustDialog.direction === "add" ? "Aggiungi" : "Deduci"} Crediti — {adjustDialog.service}
            </DialogTitle>
            <DialogDescription>
              Inserisci l'importo e una motivazione obbligatoria.
              {adjustDialog.direction === "deduct" && (
                <span className="block mt-1 text-xs text-amber-600">
                  ⚠️ Il saldo non potrà scendere sotto 0 €.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Importo (€)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="0.00"
              />
              <div className="flex gap-1.5 flex-wrap">
                {[10, 25, 50, 100, 500].map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => setAdjustAmount(String(preset))}
                  >
                    €{preset}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Motivazione *</Label>
              <Textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Es: Bonus onboarding, Rimborso per disservizio..."
                rows={3}
              />
              <div className="flex gap-1.5 flex-wrap">
                {[
                  "Bonus onboarding",
                  "Rimborso disservizio",
                  "Promo commerciale",
                  "Compensazione errore fatturazione",
                ].map((reason) => (
                  <Button
                    key={reason}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setAdjustReason(reason)}
                  >
                    {reason}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={adjustCredits.isPending}
              onClick={() => setAdjustDialog({ open: false, service: "", direction: "add" })}
            >
              Annulla
            </Button>
            <Button
              onClick={() => adjustCredits.mutate()}
              disabled={adjustCredits.isPending || !adjustAmount || !adjustReason.trim()}
            >
              {adjustCredits.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
