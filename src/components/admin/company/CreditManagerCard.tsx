import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CreditCard, Plus, Minus, Loader2, Mail, Bot, MessageSquare, Palette,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useAuth } from "@/contexts/AuthContext";

/**
 * CreditManagerCard — gestione crediti per singola azienda nel tab Abbonamento
 * del SuperAdmin.
 *
 * Mostra il saldo corrente dei 4 wallet (ai_agents, email, whatsapp, render)
 * con bottoni Aggiungi/Deduci per ogni wallet. La mutazione delega all'edge
 * function `admin-adjust-credits` (già esistente) che gestisce il logging in
 * admin_credit_adjustments + il movimento atomico sulla tabella del wallet.
 *
 * Backing store:
 *   - ai_agents / email / whatsapp → balance_eur su ai_credits/email_credits/whatsapp_credits
 *   - render                        → integer balance su render_credits
 *
 * Perché esiste in più del CompanyBillingTab: la tab Abbonamento richiede
 * una gestione crediti inline (masterprompt requirement). Usiamo le stesse
 * RPC dell'altra tab per evitare divergenze.
 */

type WalletKey = "email" | "ai_agents" | "whatsapp" | "render";

interface WalletDef {
  key: WalletKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Wallet in EUR (balance_eur) o integer (balance)? */
  kind: "eur" | "integer";
  queryKey: readonly unknown[];
  table: string;
}

interface Props {
  companyId: string;
}

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

function isRenderRpcMissing(message: string): boolean {
  return /adjust_render_credits_atomic|schema cache|PGRST202|Could not find the function/i.test(message);
}

async function fallbackAdjustRenderCredits(params: {
  companyId: string;
  delta: number;
  reason: string;
  userId?: string;
}) {
  const { companyId, delta, reason, userId } = params;
  const { data: row, error: readError } = await supabase
    .from("render_credits")
    .select("balance,total_purchased,total_used")
    .eq("company_id", companyId)
    .maybeSingle();

  if (readError) throw readError;

  const balanceBefore = Number((row as { balance?: number } | null)?.balance ?? 0);
  const balanceAfter = Math.max(0, balanceBefore + delta);
  const deltaApplied = balanceAfter - balanceBefore;
  const totalPurchased = Number((row as { total_purchased?: number } | null)?.total_purchased ?? 0) + Math.max(deltaApplied, 0);
  const totalUsed = Number((row as { total_used?: number } | null)?.total_used ?? 0);
  const payload = {
    balance: balanceAfter,
    total_purchased: totalPurchased,
    total_used: totalUsed,
    updated_at: new Date().toISOString(),
  };

  if (row) {
    const { error } = await supabase
      .from("render_credits")
      .update(payload)
      .eq("company_id", companyId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("render_credits")
      .insert({ company_id: companyId, ...payload });
    if (error) throw error;
  }

  const { error: ledgerError } = await supabase
    .from("render_credit_ledger" as never)
    .insert({
      company_id: companyId,
      delta: deltaApplied,
      balance_after: balanceAfter,
      reason: "adjust_admin",
      user_id: userId ?? null,
      metadata: {
        reason_text: reason,
        delta_requested: delta,
        fallback: "client-render-credit-adjust",
      },
    } as never);
  if (ledgerError) console.warn("[CreditManagerCard] Render ledger fallback insert failed:", ledgerError.message);

  const { error: auditError } = await supabase
    .from("admin_credit_adjustments" as never)
    .insert({
      company_id: companyId,
      service: "render",
      amount_eur: deltaApplied,
      reason,
      created_by: userId ?? null,
    } as never);
  if (auditError) console.warn("[CreditManagerCard] Render audit fallback insert failed:", auditError.message);

  return {
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    delta_applied: deltaApplied,
    wallet: "render" as const,
  };
}

export function CreditManagerCard({ companyId }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [adjustDialog, setAdjustDialog] = useState<{
    open: boolean;
    wallet: WalletKey | "";
    direction: "add" | "deduct";
  }>({ open: false, wallet: "", direction: "add" });
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const wallets: WalletDef[] = [
    {
      key: "email",
      label: "Email",
      icon: Mail,
      kind: "eur",
      queryKey: queryKeys.admin.emailCredits(companyId),
      table: "email_credits",
    },
    {
      key: "ai_agents",
      label: "Agenti AI",
      icon: Bot,
      kind: "eur",
      queryKey: queryKeys.admin.aiCreditsAdmin(companyId),
      table: "ai_credits",
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: MessageSquare,
      kind: "eur",
      queryKey: queryKeys.admin.waCredits(companyId),
      table: "whatsapp_credits",
    },
    {
      key: "render",
      label: "Render AI",
      icon: Palette,
      kind: "integer",
      queryKey: ["admin-render-credits", companyId] as const,
      table: "render_credits",
    },
  ];

  // Una query per wallet (staleTime breve — saldi devono aggiornarsi dopo adjust)
  const email = useQuery({
    queryKey: wallets[0].queryKey,
    queryFn: async () => {
      const { data } = await supabase
        .from("email_credits").select("balance_eur")
        .eq("company_id", companyId).maybeSingle();
      return (data as { balance_eur: number } | null)?.balance_eur ?? 0;
    },
    staleTime: 30 * 1000,
  });

  const ai = useQuery({
    queryKey: wallets[1].queryKey,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_credits").select("balance_eur")
        .eq("company_id", companyId).maybeSingle();
      return (data as { balance_eur: number } | null)?.balance_eur ?? 0;
    },
    staleTime: 30 * 1000,
  });

  const wa = useQuery({
    queryKey: wallets[2].queryKey,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_credits").select("balance_eur")
        .eq("company_id", companyId).maybeSingle();
      return (data as { balance_eur: number } | null)?.balance_eur ?? 0;
    },
    staleTime: 30 * 1000,
  });

  const render = useQuery({
    queryKey: wallets[3].queryKey,
    queryFn: async () => {
      const { data } = await supabase
        .from("render_credits").select("balance")
        .eq("company_id", companyId).maybeSingle();
      return (data as { balance: number } | null)?.balance ?? 0;
    },
    staleTime: 30 * 1000,
  });

  const balanceByKey: Record<WalletKey, number> = {
    email: email.data ?? 0,
    ai_agents: ai.data ?? 0,
    whatsapp: wa.data ?? 0,
    render: render.data ?? 0,
  };

  // Mutazione adjust: usa admin-adjust-credits per TUTTI i wallet.
  // - EUR (email/ai_agents/whatsapp) → registra in admin_credit_adjustments
  // - render                          → RPC adjust_render_credits_atomic (FOR UPDATE + ledger audit)
  // FIX P2.1 + P2.2 + P3.3: rimosso il pattern client-side read-modify-write
  // per render (non atomico, nessun audit ledger).
  const adjust = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(adjustAmount);
      if (!amount || amount <= 0) throw new Error("Importo non valido");
      if (!adjustReason.trim()) throw new Error("Motivazione obbligatoria");
      const wallet = adjustDialog.wallet as WalletKey;
      const signedAmount = adjustDialog.direction === "deduct" ? -amount : amount;

      if (wallet === "render") {
        // Render è intero: l'edge fn richiede un delta integer (param `amount`)
        if (!Number.isInteger(amount)) {
          throw new Error("Per render i crediti devono essere interi");
        }
        const { data, error } = await supabase.rpc("adjust_render_credits_atomic" as never, {
          p_company_id: companyId,
          p_delta: signedAmount,
          p_reason: adjustReason.trim(),
          p_adjusted_by: user?.id ?? null,
        } as never);

        if (error || (data as { error?: string } | null)?.error) {
          const message = error?.message || (data as { error?: string } | null)?.error || "RPC render non disponibile";
          if (!isRenderRpcMissing(message)) {
            console.warn("[CreditManagerCard] Render RPC failed, using direct fallback:", message);
          }
          return fallbackAdjustRenderCredits({
            companyId,
            delta: signedAmount,
            reason: adjustReason.trim(),
            userId: user?.id,
          });
        }

        const payload = data as {
          error?: string;
          balance_before?: number;
          balance_after?: number;
          delta_applied?: number;
          ledger_id?: string | null;
        };
        if (payload?.error) throw new Error(payload.error);
        return {
          balance_before: payload?.balance_before ?? 0,
          balance_after:  payload?.balance_after  ?? 0,
          wallet: "render" as const,
        };
      }

      // Wallet EUR → edge function (legacy param `amount_eur`)
      const { data, error } = await supabase.functions.invoke("admin-adjust-credits", {
        body: {
          company_id: companyId,
          service: wallet,
          amount_eur: signedAmount,
          reason: adjustReason.trim(),
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error!);
      return { ...(data as { balance_before: number; balance_after: number }), wallet };
    },
    onSuccess: (result) => {
      const wallet = result.wallet as WalletKey;
      const w = wallets.find(x => x.key === wallet)!;
      const fmt = (v: number) => w.kind === "integer" ? String(v) : formatCurrency(v);
      toast.success(`Crediti ${w.label} aggiornati: ${fmt(result.balance_before)} → ${fmt(result.balance_after)}`);
      setAdjustDialog({ open: false, wallet: "", direction: "add" });
      setAdjustAmount("");
      setAdjustReason("");
      // Invalida tutte le query dei wallet
      wallets.forEach(x => queryClient.invalidateQueries({ queryKey: x.queryKey }));
      // Invalida anche lo storico transazioni (se la view viene letta in parallelo)
      queryClient.invalidateQueries({ queryKey: ["admin-credit-transactions-unified", companyId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.creditAdjustments(companyId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentWallet = wallets.find(w => w.key === adjustDialog.wallet);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Gestione Crediti
        </CardTitle>
        <CardDescription>
          Saldo corrente per wallet. Usa <strong>Aggiungi</strong> per ricaricare un bonus,
          <strong> Deduci</strong> per stornare: ogni movimento è atomico (FOR UPDATE) e loggato in
          <code className="text-[0.7rem] mx-1">admin_credit_adjustments</code> (EUR) o
          <code className="text-[0.7rem] mx-1">render_credit_ledger</code> (render).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {wallets.map(({ key, label, icon: Icon, kind }) => {
            const balance = balanceByKey[key];
            const balanceLabel = kind === "integer"
              ? `${balance} crediti`
              : formatCurrency(balance);
            return (
              <div key={key} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                </div>
                <p className="text-2xl font-bold">{balanceLabel}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline" className="flex-1"
                    onClick={() => {
                      setAdjustDialog({ open: true, wallet: key, direction: "add" });
                      setAdjustAmount("");
                      setAdjustReason("");
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Aggiungi
                  </Button>
                  <Button
                    size="sm" variant="outline" className="flex-1"
                    onClick={() => {
                      setAdjustDialog({ open: true, wallet: key, direction: "deduct" });
                      setAdjustAmount("");
                      setAdjustReason("");
                    }}
                  >
                    <Minus className="h-3 w-3 mr-1" /> Deduci
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* Dialog Adjust — FIX P2.4: blocca chiusura durante mutazione in corso */}
      <Dialog
        open={adjustDialog.open}
        onOpenChange={(open) => {
          if (open) return;
          if (adjust.isPending) return; // evita chiusura accidentale durante l'adjust
          setAdjustDialog({ open: false, wallet: "", direction: "add" });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustDialog.direction === "add" ? "Aggiungi" : "Deduci"} crediti — {currentWallet?.label ?? adjustDialog.wallet}
            </DialogTitle>
            <DialogDescription>
              {currentWallet?.kind === "integer"
                ? "Inserisci il numero di crediti (intero) e una motivazione."
                : "Inserisci l'importo in EUR e una motivazione. Il movimento sarà loggato."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                {currentWallet?.kind === "integer" ? "Crediti" : "Importo (€)"}
              </Label>
              <Input
                type="number"
                min={currentWallet?.kind === "integer" ? "1" : "0.01"}
                step={currentWallet?.kind === "integer" ? "1" : "0.01"}
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder={currentWallet?.kind === "integer" ? "10" : "25,00"}
              />
            </div>
            <div className="space-y-2">
              <Label>Motivazione (obbligatoria)</Label>
              <Input
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Es: bonus lancio Q2, accordo commerciale, correzione errore"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdjustDialog({ open: false, wallet: "", direction: "add" })}
              disabled={adjust.isPending}
            >
              Annulla
            </Button>
            <Button
              onClick={() => adjust.mutate()}
              disabled={adjust.isPending || !adjustAmount || !adjustReason.trim()}
            >
              {adjust.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
