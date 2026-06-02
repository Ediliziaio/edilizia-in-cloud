// FE Operations — Dashboard super_admin per la Fatturazione Elettronica.
// Risponde a: CHI usa la FE, QUANTO invia/riceve, QUANTO costa, QUANTO ricaricare.
// Modello intermediario: 1 account openapi piattaforma → N cedenti (aziende).
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Loader2, RefreshCw, Wallet, Receipt, Inbox, Send, TrendingUp, AlertTriangle,
  CheckCircle, Settings2, Euro, Building2,
} from "lucide-react";
import { toast } from "sonner";

interface FeCompany {
  company_id: string;
  name: string;
  fiscal_id: string | null;
  provider: string | null;
  stato: string;
  delega_stato: string;
  last_error: string | null;
  registered_at: string | null;
  sent_total: number;
  sent_month: number;
  oa_sent_total: number;
  oa_sent_month: number;
  rec_total: number;
  rec_month: number;
  last_activity: string | null;
  cost_total: number;
  cost_month: number;
}
interface FeOverview {
  env: string;
  generated_at: string;
  pricing: { cost_per_invoice: number; cost_per_receipt: number };
  companies: FeCompany[];
  totals: Record<string, number>;
  wallet: {
    balance: number | null;
    source: "live" | "manuale" | null;
    threshold: number;
    months_buffer: number;
    projected_monthly: number;
    recommended_topup: number;
    low: boolean;
    endpoint_configured: boolean;
    updated_at: string | null;
    error: string | null;
  };
}

const eur = (n: number | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n ?? 0));
const dateIt = (s: string | null) => (s ? new Date(s).toLocaleDateString("it-IT") : "—");

function StatoBadge({ stato }: { stato: string }) {
  if (stato === "attivo") return <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"><CheckCircle className="h-3 w-3" />Attivo</Badge>;
  if (stato === "registrato") return <Badge className="gap-1 bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300"><CheckCircle className="h-3 w-3" />Registrato</Badge>;
  if (stato === "errore") return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Errore</Badge>;
  if (stato === "pending") return <Badge variant="outline" className="gap-1 text-amber-600">In corso</Badge>;
  if (stato === "disattivato") return <Badge variant="outline" className="gap-1 text-muted-foreground">Disattivato</Badge>;
  return <Badge variant="outline" className="gap-1 text-muted-foreground">Non attivo</Badge>;
}
function DelegaBadge({ delega }: { delega: string }) {
  if (delega === "attiva") return <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">Delega ✓</Badge>;
  if (delega === "richiesta") return <Badge variant="outline" className="text-amber-600">Delega richiesta</Badge>;
  if (delega === "revocata") return <Badge variant="destructive">Delega revocata</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">No delega</Badge>;
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1.5">{icon}{label}</div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function AdminFatturazioneElettronica() {
  const queryClient = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useQuery<FeOverview>({
    queryKey: ["fe-operations", "overview"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fe-operations", { body: { action: "overview" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as FeOverview;
    },
    staleTime: 60_000,
  });

  const totals = data?.totals ?? {};
  const wallet = data?.wallet;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Receipt className="h-6 w-6" />Fatturazione Elettronica</h1>
          <p className="text-muted-foreground text-sm">Chi usa la FE, volumi inviati/ricevuti, costi stimati e stato del wallet openapi.</p>
        </div>
        <div className="flex items-center gap-2">
          {data?.env && <Badge variant={data.env === "sandbox" || data.env === "test" ? "outline" : "default"} className="gap-1">{data.env === "sandbox" || data.env === "test" ? "Sandbox" : "Produzione"}</Badge>}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Aggiorna
          </Button>
          <ConfigDialog open={configOpen} onOpenChange={setConfigOpen} data={data} onSaved={() => { setConfigOpen(false); queryClient.invalidateQueries({ queryKey: ["fe-operations", "overview"] }); }} />
        </div>
      </div>

      {error && (
        <Card className="border-red-300"><CardContent className="pt-5 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{(error as Error).message}</CardContent></Card>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <KpiCard icon={<Building2 className="h-3.5 w-3.5" />} label="Aziende FE" value={String(totals.companies ?? 0)} sub={`${totals.companies_attive ?? 0} attive (delega ok)`} />
            <KpiCard icon={<Send className="h-3.5 w-3.5" />} label="Fatture inviate" value={String(totals.sent_month ?? 0)} sub={`${totals.sent_total ?? 0} totali · ${totals.oa_sent_total ?? 0} via openapi`} />
            <KpiCard icon={<Inbox className="h-3.5 w-3.5" />} label="Fatture ricevute" value={String(totals.rec_month ?? 0)} sub={`${totals.rec_total ?? 0} totali`} />
            <KpiCard icon={<Euro className="h-3.5 w-3.5" />} label="Costo stimato (mese)" value={eur(totals.cost_month)} sub={`${eur(totals.cost_total)} storico`} />
          </>
        )}
      </div>

      {/* WALLET */}
      <Card className={wallet?.low ? "border-amber-400" : undefined}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" />Wallet openapi</CardTitle>
          <CardDescription>Il credito da cui si pagano gli invii/ricezioni SDI di tutte le aziende.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-20" /> : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Saldo</div>
                <div className="text-xl font-bold">{wallet?.balance != null ? eur(wallet.balance) : "—"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {wallet?.source === "live" ? "live" : wallet?.source === "manuale" ? `manuale · ${dateIt(wallet?.updated_at ?? null)}` : "non impostato"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Burn rate (mese)</div>
                <div className="text-xl font-bold flex items-center gap-1"><TrendingUp className="h-4 w-4 text-muted-foreground" />{eur(wallet?.projected_monthly)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Soglia allerta</div>
                <div className="text-xl font-bold">{eur(wallet?.threshold)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Ricarica consigliata</div>
                <div className={`text-xl font-bold ${wallet?.recommended_topup ? "text-amber-600" : "text-emerald-600"}`}>
                  {wallet?.recommended_topup ? eur(wallet.recommended_topup) : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">copre ~{wallet?.months_buffer ?? 2} mesi</div>
              </div>
            </div>
          )}
          {wallet?.low && (
            <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              Saldo sotto soglia: ricarica almeno {eur(wallet.recommended_topup)} per non bloccare gli invii.
            </div>
          )}
          {wallet?.error && <p className="mt-2 text-xs text-muted-foreground">Wallet live: {wallet.error}</p>}
          {wallet?.balance == null && !wallet?.endpoint_configured && (
            <p className="mt-2 text-xs text-muted-foreground">Imposta il saldo manuale (o un endpoint wallet) da <b>Configura</b> per vedere la ricarica consigliata.</p>
          )}
        </CardContent>
      </Card>

      {/* TABELLA AZIENDE */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aziende</CardTitle>
          <CardDescription>Prezzi: {eur(data?.pricing.cost_per_invoice)}/invio · {eur(data?.pricing.cost_per_receipt)}/ricezione (configurabili).</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {isLoading ? (
            <div className="space-y-2 px-4 sm:px-0">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : !data?.companies.length ? (
            <p className="text-sm text-muted-foreground px-4 sm:px-0">Nessuna azienda ha ancora usato la Fatturazione Elettronica.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Azienda</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Inviate (mese/tot)</TableHead>
                    <TableHead className="text-right">Ricevute (mese/tot)</TableHead>
                    <TableHead className="text-right">Costo (mese/tot)</TableHead>
                    <TableHead className="text-right">Ultima attività</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.companies.map((c) => (
                    <TableRow key={c.company_id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{c.fiscal_id || "—"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <StatoBadge stato={c.stato} />
                          <DelegaBadge delega={c.delega_stato} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="font-medium">{c.sent_month}</span>
                        <span className="text-muted-foreground"> / {c.sent_total}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="font-medium">{c.rec_month}</span>
                        <span className="text-muted-foreground"> / {c.rec_total}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="font-medium">{eur(c.cost_month)}</span>
                        <span className="text-muted-foreground"> / {eur(c.cost_total)}</span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{dateIt(c.last_activity)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {data?.generated_at && <p className="text-xs text-muted-foreground text-right">Aggiornato {new Date(data.generated_at).toLocaleString("it-IT")}</p>}
    </div>
  );
}

// ─── Dialog configurazione prezzi/wallet ──────────────────────────────────
function ConfigDialog({ open, onOpenChange, data, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; data?: FeOverview; onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open && data) {
      setForm({
        openapi_cost_per_invoice: String(data.pricing.cost_per_invoice ?? ""),
        openapi_cost_per_receipt: String(data.pricing.cost_per_receipt ?? ""),
        openapi_wallet_balance: data.wallet.balance != null ? String(data.wallet.balance) : "",
        openapi_wallet_threshold: String(data.wallet.threshold ?? ""),
        openapi_wallet_months_buffer: String(data.wallet.months_buffer ?? ""),
      });
    }
  }, [open, data]);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { action: "set_config" };
      for (const [k, v] of Object.entries(form)) if (v !== "") body[k] = v;
      const { data, error } = await supabase.functions.invoke("fe-operations", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { toast.success("Configurazione salvata"); onSaved(); },
    onError: (e: any) => toast.error(e?.message || "Errore salvataggio"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Settings2 className="h-4 w-4" />Configura</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prezzi & Wallet</DialogTitle>
          <DialogDescription>Costi unitari openapi e saldo del wallet (per stimare la ricarica).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Costo per invio (€)</Label>
            <Input type="number" step="0.01" min="0" value={form.openapi_cost_per_invoice ?? ""} onChange={(e) => set("openapi_cost_per_invoice", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Costo per ricezione (€)</Label>
            <Input type="number" step="0.01" min="0" value={form.openapi_cost_per_receipt ?? ""} onChange={(e) => set("openapi_cost_per_receipt", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Saldo wallet attuale (€)</Label>
            <Input type="number" step="0.01" min="0" value={form.openapi_wallet_balance ?? ""} onChange={(e) => set("openapi_wallet_balance", e.target.value)} placeholder="da pannello openapi" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Soglia allerta (€)</Label>
            <Input type="number" step="1" min="0" value={form.openapi_wallet_threshold ?? ""} onChange={(e) => set("openapi_wallet_threshold", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mesi di buffer ricarica</Label>
            <Input type="number" step="1" min="1" value={form.openapi_wallet_months_buffer ?? ""} onChange={(e) => set("openapi_wallet_months_buffer", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1.5">
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
