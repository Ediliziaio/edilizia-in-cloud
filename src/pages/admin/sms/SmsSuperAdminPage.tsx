/**
 * Dashboard SuperAdmin per il modulo SMS Marketing.
 * P&L globale, tabella tenant, editor prezzi e pacchetti.
 */
import { useState } from "react";
import { BarChart3, Users, Euro, TrendingUp, Loader2, Settings2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useSmsSuperAdmin } from "@/hooks/useSmsSuperAdmin";
import { useTelnyxSetup } from "@/hooks/useTelnyxSetup";
import type { SmsPricingConfig } from "@/types/sms-superadmin";
import type { SmsPacchettoCrediti } from "@/types/sms-marketing";

// ─── KPI Card ─────────────────────────────────────────────

function KpiCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Pricing Editor ───────────────────────────────────────

function SmsPricingEditor() {
  const { pricingConfig, isLoadingPricing, savePricing, isSavingPricing } = useSmsSuperAdmin();
  const [form, setForm] = useState<Partial<SmsPricingConfig>>({});

  const current = { ...pricingConfig, ...form };

  const handleSave = async () => {
    if (Object.keys(form).length === 0) { toast.info("Nessuna modifica da salvare"); return; }
    await savePricing(form);
    setForm({});
  };

  if (isLoadingPricing) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configurazione prezzi</CardTitle>
        <CardDescription>Prezzi applicati a tutte le aziende (modifica con attenzione)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Prezzo numero mensile (€)</Label>
            <Input
              type="number" step="0.01"
              value={current?.prezzo_numero_mensile ?? 30}
              onChange={(e) => setForm((f) => ({ ...f, prezzo_numero_mensile: parseFloat(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prezzo per SMS (€)</Label>
            <Input
              type="number" step="0.000001"
              value={current?.prezzo_per_sms ?? 0.06}
              onChange={(e) => setForm((f) => ({ ...f, prezzo_per_sms: parseFloat(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Costo wholesale Telnyx (€)</Label>
            <Input
              type="number" step="0.000001"
              value={current?.costo_wholesale_sms ?? 0.008}
              onChange={(e) => setForm((f) => ({ ...f, costo_wholesale_sms: parseFloat(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">Non visibile alle aziende</p>
          </div>
          <div className="space-y-1.5">
            <Label>Soglia minima crediti (€)</Label>
            <Input
              type="number" step="1"
              value={current?.soglia_crediti_minima ?? 50}
              onChange={(e) => setForm((f) => ({ ...f, soglia_crediti_minima: parseInt(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bonus primo acquisto (€)</Label>
            <Input
              type="number" step="1"
              value={current?.crediti_bonus_primo_acquisto ?? 20}
              onChange={(e) => setForm((f) => ({ ...f, crediti_bonus_primo_acquisto: parseInt(e.target.value) }))}
            />
          </div>
        </div>
        {current && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
            <p className="font-medium text-emerald-800">Margine stimato per SMS</p>
            <p className="text-emerald-700">
              €{((current.prezzo_per_sms ?? 0.06) - (current.costo_wholesale_sms ?? 0.008)).toFixed(6)} per SMS
              · {(((current.prezzo_per_sms ?? 0.06) - (current.costo_wholesale_sms ?? 0.008)) / (current.prezzo_per_sms ?? 0.06) * 100).toFixed(1)}% margine
            </p>
          </div>
        )}
        <Button onClick={handleSave} disabled={isSavingPricing || Object.keys(form).length === 0}>
          {isSavingPricing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Salva configurazione
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Pacchetti Editor ─────────────────────────────────────

function SmsPacchettiEditor() {
  const { pacchetti, isLoadingPacchetti, savePacchetto, isSavingPacchetto } = useSmsSuperAdmin();
  const [editing, setEditing] = useState<Partial<SmsPacchettoCrediti> | null>(null);

  const handleSave = async () => {
    if (!editing) return;
    await savePacchetto(editing as Omit<SmsPacchettoCrediti, "id"> & { id?: string });
    setEditing(null);
  };

  if (isLoadingPacchetti) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Pacchetti crediti</CardTitle>
            <CardDescription>Pacchetti disponibili all'acquisto dalle aziende</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing({ nome: "", importo_eur: 0, crediti_eur: 0, bonus_percentuale: 0, evidenziato: false, attivo: true, ordine: pacchetti.length + 1 })}>
            + Nuovo pacchetto
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {pacchetti.map((p) => (
          <div key={p.id} className={`flex items-center justify-between border rounded-lg p-3 ${!p.attivo ? "opacity-50" : ""}`}>
            <div>
              <span className="font-medium">{p.nome}</span>
              {p.evidenziato && <Badge className="ml-2 text-[10px]">Consigliato</Badge>}
              <p className="text-xs text-muted-foreground">
                €{p.importo_eur} · {p.crediti_eur} crediti
                {p.bonus_percentuale > 0 && ` · +${p.bonus_percentuale}% bonus`}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditing({ ...p })}>Modifica</Button>
          </div>
        ))}

        {editing !== null && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30 mt-4">
            <p className="text-sm font-medium">{editing.id ? "Modifica pacchetto" : "Nuovo pacchetto"}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome</Label>
                <Input value={editing.nome ?? ""} onChange={(e) => setEditing((f) => ({ ...f, nome: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Importo € (prezzo pagato)</Label>
                <Input type="number" step="0.01" value={editing.importo_eur ?? 0} onChange={(e) => setEditing((f) => ({ ...f, importo_eur: parseFloat(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Crediti € accreditati</Label>
                <Input type="number" step="0.01" value={editing.crediti_eur ?? 0} onChange={(e) => setEditing((f) => ({ ...f, crediti_eur: parseFloat(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bonus %</Label>
                <Input type="number" step="1" value={editing.bonus_percentuale ?? 0} onChange={(e) => setEditing((f) => ({ ...f, bonus_percentuale: parseInt(e.target.value) }))} />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.evidenziato ?? false} onCheckedChange={(v) => setEditing((f) => ({ ...f, evidenziato: v }))} />
                Consigliato
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.attivo ?? true} onCheckedChange={(v) => setEditing((f) => ({ ...f, attivo: v }))} />
                Attivo
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Annulla</Button>
              <Button size="sm" onClick={handleSave} disabled={isSavingPacchetto}>
                {isSavingPacchetto ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Salva
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tenant Table ─────────────────────────────────────────

function SmsTenantTable() {
  const { tenants, isLoadingTenants } = useSmsSuperAdmin();
  const { attivaAzienda, isAttivando } = useTelnyxSetup();
  const [attivandoId, setAttivandoId] = useState<string | null>(null);

  if (isLoadingTenants) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tenant SMS attivi</CardTitle>
        <CardDescription>{tenants.length} aziende con modulo SMS</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Azienda</TableHead>
              <TableHead>Numero</TableHead>
              <TableHead className="text-right">Crediti €</TableHead>
              <TableHead className="text-right">SMS mese</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nessuna azienda con SMS attivo</TableCell></TableRow>
            ) : (
              tenants.map((t) => (
                <TableRow key={t.company_id}>
                  <TableCell className="font-medium">{t.company_name}</TableCell>
                  <TableCell className="font-mono text-sm">{t.numero_e164 ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(t.crediti_wallet)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.sms_mese.toLocaleString("it-IT")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── P&L Chart ────────────────────────────────────────────

function SmsPLChart() {
  const { plStats, isLoadingPL } = useSmsSuperAdmin();

  if (isLoadingPL) return <Skeleton className="h-64 w-full" />;
  if (!plStats) return null;

  const chartData = plStats.trend.map((p) => ({
    ...p,
    mese: p.mese.slice(5), // "2025-04" → "04"
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Andamento ricavi SMS (ultimi 6 mesi)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mese" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={50}
              tickFormatter={(v: number) => `€${v.toFixed(0)}`} />
            <Tooltip formatter={(v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="fatturato" name="Fatturato" stroke="#8b5cf6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────

export default function SmsSuperAdminPage() {
  const { plStats, isLoadingPL } = useSmsSuperAdmin();

  const kpis = [
    {
      title: "Tenant SMS attivi",
      value: isLoadingPL ? "—" : String(plStats?.tenant_attivi ?? 0),
      sub: "Con numero +39 attivo",
      icon: Users,
      color: "text-blue-600",
    },
    {
      title: "SMS inviati (mese)",
      value: isLoadingPL ? "—" : (plStats?.sms_totali ?? 0).toLocaleString("it-IT"),
      sub: "Mese corrente",
      icon: BarChart3,
      color: "text-violet-600",
    },
    {
      title: "Fatturato SMS (mese)",
      value: isLoadingPL ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(plStats?.fatturato_totale ?? 0),
      sub: "Ricariche crediti",
      icon: Euro,
      color: "text-emerald-600",
    },
    {
      title: "Margine (mese)",
      value: isLoadingPL ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(plStats?.margine_totale ?? 0),
      sub: plStats ? `${plStats.margine_percentuale.toFixed(1)}% del fatturato` : undefined,
      icon: TrendingUp,
      color: "text-orange-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SMS Marketing — SuperAdmin</h1>
        <p className="text-muted-foreground">Gestione P&L, prezzi e tenant</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.title} {...k} />
        ))}
      </div>

      <Tabs defaultValue="tenant">
        <TabsList>
          <TabsTrigger value="tenant">Tenant</TabsTrigger>
          <TabsTrigger value="pl">P&L</TabsTrigger>
          <TabsTrigger value="prezzi">Prezzi</TabsTrigger>
          <TabsTrigger value="pacchetti">Pacchetti</TabsTrigger>
        </TabsList>

        <TabsContent value="tenant" className="mt-4">
          <SmsTenantTable />
        </TabsContent>
        <TabsContent value="pl" className="mt-4">
          <SmsPLChart />
        </TabsContent>
        <TabsContent value="prezzi" className="mt-4">
          <SmsPricingEditor />
        </TabsContent>
        <TabsContent value="pacchetti" className="mt-4">
          <SmsPacchettiEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
