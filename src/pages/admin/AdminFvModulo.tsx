/**
 * Pagina SuperAdmin AEDIX per gestione del modulo Fotovoltaico:
 *   - Tab Catalogo Incentivi: CRUD su fv_incentivi_catalogo (aliquote, plafond,
 *     cumulabilità, validità) — aggiornabile senza redeploy quando cambia la
 *     normativa (Legge di Bilancio annuale).
 *   - Tab Parametri Calcolo: CRUD su fv_parametri_calcolo (degradazione,
 *     PR, perdite, tassi finanziari, fattore CO2).
 *   - Tab API & Secrets: status di GOOGLE_SOLAR_API_KEY, MAPBOX_TOKEN, ecc.
 *     (lettura: i secret reali si configurano dal dashboard Supabase).
 *   - Tab Statistiche: utilizzo Solar API (call/mese, cost/cache hit rate).
 *
 * Accesso: solo super_admin (gating via AdminLayout).
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sun,
  Sparkles,
  Settings,
  Key,
  BarChart3,
  Pencil,
  Plus,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface IncentivoRow {
  id: string;
  codice: string;
  nome: string;
  descrizione_breve: string | null;
  tipo: string;
  aliquota: number | null;
  plafond_max_eur: number | null;
  durata_anni: number | null;
  cumulabile_con: string[] | null;
  non_cumulabile_con: string[] | null;
  attivo: boolean;
  data_inizio_validita: string | null;
  data_fine_validita: string | null;
  fonte_normativa: string | null;
  link_normativa: string | null;
  ordinamento: number;
}

interface ParametroRow {
  chiave: string;
  valore: number;
  unita: string | null;
  descrizione: string | null;
  categoria: string | null;
  ultima_modifica: string;
}

export default function AdminFvModulo() {
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Sun className="h-8 w-8 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold">Modulo Fotovoltaico — SuperAdmin</h1>
          <p className="text-sm text-muted-foreground">
            Gestione catalogo incentivi, parametri di calcolo e configurazione API.
          </p>
        </div>
      </div>

      <Tabs defaultValue="incentivi">
        <TabsList>
          <TabsTrigger value="incentivi">
            <Sparkles className="h-4 w-4 mr-1" />
            Catalogo incentivi
          </TabsTrigger>
          <TabsTrigger value="parametri">
            <Settings className="h-4 w-4 mr-1" />
            Parametri calcolo
          </TabsTrigger>
          <TabsTrigger value="api">
            <Key className="h-4 w-4 mr-1" />
            API & Secrets
          </TabsTrigger>
          <TabsTrigger value="stats">
            <BarChart3 className="h-4 w-4 mr-1" />
            Utilizzo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incentivi" className="mt-3">
          <TabIncentivi />
        </TabsContent>
        <TabsContent value="parametri" className="mt-3">
          <TabParametri />
        </TabsContent>
        <TabsContent value="api" className="mt-3">
          <TabApiSecrets />
        </TabsContent>
        <TabsContent value="stats" className="mt-3">
          <TabStatistiche />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── TAB Incentivi ──────────────────────────────────────────────────────────
function TabIncentivi() {
  const qc = useQueryClient();
  const { data: incentivi = [], isLoading } = useQuery({
    queryKey: ["admin-fv-incentivi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fv_incentivi_catalogo" as never)
        .select("*")
        .order("ordinamento");
      if (error) throw error;
      return (data as IncentivoRow[]) ?? [];
    },
  });

  const [editing, setEditing] = useState<IncentivoRow | null>(null);

  const upsert = useMutation({
    mutationFn: async (row: Partial<IncentivoRow>) => {
      const { error } = await supabase
        .from("fv_incentivi_catalogo" as never)
        .upsert({ ...row, ultima_modifica: new Date().toISOString() } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-fv-incentivi"] });
      toast.success("Incentivo aggiornato");
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold">Catalogo incentivi 2026</h3>
            <p className="text-xs text-muted-foreground">
              Aggiorna senza redeploy quando cambia la normativa fiscale italiana.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing({} as IncentivoRow)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo incentivo
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codice</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Aliquota</TableHead>
                <TableHead className="text-right">Plafond</TableHead>
                <TableHead>Durata</TableHead>
                <TableHead>Validità</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-4 text-muted-foreground">
                    Caricamento…
                  </TableCell>
                </TableRow>
              )}
              {incentivi.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.codice}</TableCell>
                  <TableCell className="font-medium">{i.nome}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline">{i.tipo}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {i.aliquota != null ? `${(i.aliquota * 100).toFixed(0)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {i.plafond_max_eur != null
                      ? `€ ${i.plafond_max_eur.toLocaleString("it-IT")}`
                      : "—"}
                  </TableCell>
                  <TableCell>{i.durata_anni ? `${i.durata_anni} anni` : "—"}</TableCell>
                  <TableCell className="text-xs">
                    {i.data_fine_validita ? `fino ${i.data_fine_validita}` : "no scadenza"}
                  </TableCell>
                  <TableCell>
                    {i.attivo ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        Attivo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted">
                        Inattivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(i)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {editing && (
        <DialogIncentivo
          row={editing}
          onClose={() => setEditing(null)}
          onSave={(r) => upsert.mutate(r)}
          saving={upsert.isPending}
        />
      )}
    </Card>
  );
}

function DialogIncentivo({
  row,
  onClose,
  onSave,
  saving,
}: {
  row: IncentivoRow;
  onClose: () => void;
  onSave: (r: Partial<IncentivoRow>) => void;
  saving: boolean;
}) {
  const [data, setData] = useState<Partial<IncentivoRow>>(row);
  const update = <K extends keyof IncentivoRow>(k: K, v: IncentivoRow[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data.id ? "Modifica incentivo" : "Nuovo incentivo"}</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Codice *</Label>
            <Input
              value={data.codice ?? ""}
              onChange={(e) => update("codice", e.target.value.toUpperCase())}
              placeholder="DETR_50_PRIMA"
            />
          </div>
          <div>
            <Label>Nome *</Label>
            <Input value={data.nome ?? ""} onChange={(e) => update("nome", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Descrizione breve (max 140 char)</Label>
            <Textarea
              value={data.descrizione_breve ?? ""}
              onChange={(e) => update("descrizione_breve", e.target.value)}
              maxLength={140}
              rows={2}
            />
          </div>
          <div>
            <Label>Tipo *</Label>
            <select
              className="w-full border rounded-md p-2 text-sm"
              value={data.tipo ?? ""}
              onChange={(e) => update("tipo", e.target.value)}
            >
              <option value="">Seleziona…</option>
              <option value="detrazione_irpef">Detrazione IRPEF</option>
              <option value="fondo_perduto">Fondo perduto</option>
              <option value="tariffa_incentivante">Tariffa incentivante</option>
              <option value="sconto_iva">Sconto IVA</option>
              <option value="deducibilita_fiscale">Deducibilità fiscale</option>
              <option value="informativa">Informativa</option>
            </select>
          </div>
          <div>
            <Label>Aliquota (decimale, es. 0.5 = 50%)</Label>
            <Input
              type="number"
              step="0.001"
              value={data.aliquota ?? ""}
              onChange={(e) => update("aliquota", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <Label>Plafond max €</Label>
            <Input
              type="number"
              value={data.plafond_max_eur ?? ""}
              onChange={(e) => update("plafond_max_eur", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <Label>Durata anni</Label>
            <Input
              type="number"
              value={data.durata_anni ?? ""}
              onChange={(e) => update("durata_anni", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <Label>Inizio validità</Label>
            <Input
              type="date"
              value={data.data_inizio_validita ?? ""}
              onChange={(e) => update("data_inizio_validita", e.target.value || null)}
            />
          </div>
          <div>
            <Label>Fine validità</Label>
            <Input
              type="date"
              value={data.data_fine_validita ?? ""}
              onChange={(e) => update("data_fine_validita", e.target.value || null)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Fonte normativa</Label>
            <Input
              value={data.fonte_normativa ?? ""}
              onChange={(e) => update("fonte_normativa", e.target.value)}
              placeholder="Legge 190/2025 art. 1 c. 55"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Link normativa (URL Gazzetta)</Label>
            <Input
              value={data.link_normativa ?? ""}
              onChange={(e) => update("link_normativa", e.target.value)}
              placeholder="https://www.gazzettaufficiale.it/..."
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="attivo"
              checked={data.attivo ?? true}
              onChange={(e) => update("attivo", e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="attivo">Incentivo attivo (selezionabile dal motore)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={() => onSave(data)} disabled={saving || !data.codice || !data.nome}>
            {saving ? "Salvataggio…" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── TAB Parametri Calcolo ──────────────────────────────────────────────────
function TabParametri() {
  const qc = useQueryClient();
  const { data: parametri = [] } = useQuery({
    queryKey: ["admin-fv-parametri"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fv_parametri_calcolo" as never)
        .select("*")
        .order("categoria")
        .order("chiave");
      if (error) throw error;
      return (data as ParametroRow[]) ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async (row: { chiave: string; valore: number }) => {
      const { error } = await supabase
        .from("fv_parametri_calcolo" as never)
        .update({ valore: row.valore, ultima_modifica: new Date().toISOString() } as never)
        .eq("chiave", row.chiave);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-fv-parametri"] });
      toast.success("Parametro aggiornato");
    },
  });

  const grouped = useMemo(() => {
    const map: Record<string, ParametroRow[]> = {};
    for (const p of parametri) {
      const cat = p.categoria ?? "altro";
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    }
    return map;
  }, [parametri]);

  return (
    <div className="space-y-4">
      <Alert>
        <Settings className="h-4 w-4" />
        <AlertTitle>Parametri di calcolo motore FV</AlertTitle>
        <AlertDescription>
          Modifica i valori usati dalle edge functions <code>fv-calcolo-finanziario</code>,{" "}
          <code>fv-solar-api-fetch</code>. Le modifiche hanno effetto immediato sui nuovi calcoli (i
          progetti già emessi mantengono i valori storici).
        </AlertDescription>
      </Alert>

      {Object.entries(grouped).map(([cat, rows]) => (
        <Card key={cat}>
          <CardContent className="py-4">
            <h4 className="font-semibold mb-3 capitalize">{cat}</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chiave</TableHead>
                  <TableHead>Descrizione</TableHead>
                  <TableHead className="text-right">Valore</TableHead>
                  <TableHead>Unità</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.chiave}>
                    <TableCell className="font-mono text-xs">{p.chiave}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.descrizione}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.0001"
                        defaultValue={p.valore}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v) || v === p.valore) return;
                          upsert.mutate({ chiave: p.chiave, valore: v });
                        }}
                        className="w-32 text-right tabular-nums inline-block"
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.unita}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── TAB API & Secrets ──────────────────────────────────────────────────────
function TabApiSecrets() {
  return (
    <div className="space-y-4">
      <Alert>
        <Key className="h-4 w-4" />
        <AlertTitle>Configurazione secret API</AlertTitle>
        <AlertDescription>
          I secret vengono configurati direttamente nel dashboard Supabase (Project Settings → Edge
          Functions → Secrets). Le edge functions del modulo FV li leggono via <code>Deno.env.get()</code>.
          Se un secret manca, le edge function attivano automaticamente il <strong>mock dev</strong> per
          consentire test E2E senza chiavi reali.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="py-4 space-y-3">
          <h4 className="font-semibold">Secret necessari per il modulo FV</h4>
          <div className="space-y-3">
            <SecretRow
              key_name="GOOGLE_SOLAR_API_KEY"
              uso="Analisi tetto satellitare (10.000 chiamate/mese gratis, poi $5/1000)"
              stato="da configurare"
              link="https://console.cloud.google.com/apis/library/solar.googleapis.com"
            />
            <SecretRow
              key_name="GOOGLE_STATIC_MAPS_API_KEY"
              uso="Immagini satellitari per PDF Vendita (28.000 chiamate/mese gratis)"
              stato="da configurare"
              link="https://developers.google.com/maps/documentation/maps-static"
            />
            <SecretRow
              key_name="MAPBOX_TOKEN"
              uso="Mappa interattiva nel wizard Step 4 (alternativa a Google Maps JS)"
              stato="da configurare"
              link="https://account.mapbox.com/access-tokens/"
            />
            <SecretRow
              key_name="OPENAI_API_KEY"
              uso="AI Assistant (Wave 2 — upsell automatici, sentiment email)"
              stato="non necessario W1"
              link={null}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4 space-y-3">
          <h4 className="font-semibold">Edge functions deployate</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <code>fv-onboarding-cliente</code> — validazione + pre-qualifica incentivi
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <code>fv-solar-api-fetch</code> — chiama Solar API con cache 180gg + quota guard + mock dev
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <code>fv-pvgis-fetch</code> — fallback gratuito PVGIS (cache 365gg)
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <code>fv-calcolo-finanziario</code> — motore completo (NPV, IRR, sensitivity, what-if)
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <code>fv-genera-pdf</code> — Vendita 12pp + Tecnico 6pp + Mobile 3pp
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SecretRow({
  key_name,
  uso,
  stato,
  link,
}: {
  key_name: string;
  uso: string;
  stato: string;
  link: string | null;
}) {
  return (
    <div className="border rounded-md p-3 flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="font-mono text-sm font-medium">{key_name}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{uso}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={
            stato === "configurato"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : stato === "non necessario W1"
              ? "bg-muted"
              : "bg-amber-50 text-amber-700 border-amber-200"
          }
        >
          {stato === "configurato" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
          {stato}
        </Badge>
        {link && (
          <Button asChild variant="ghost" size="sm">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── TAB Statistiche ────────────────────────────────────────────────────────
function TabStatistiche() {
  const { data: usage = [] } = useQuery({
    queryKey: ["admin-fv-solar-usage"],
    queryFn: async () => {
      const meseCorrente = new Date().toISOString().slice(0, 7);
      const { data, error } = await supabase
        .from("fv_solar_api_usage" as never)
        .select("*")
        .eq("mese_anno", meseCorrente);
      if (error) throw error;
      return (data as Array<{ source: string; call_count: number; cost_estimate_eur: number }>) ?? [];
    },
  });

  const stats = useMemo(() => {
    let api = 0, cache = 0, errors = 0, cost = 0;
    for (const r of usage) {
      if (r.source === "api") api += r.call_count;
      else if (r.source === "cache") cache += r.call_count;
      else if (r.source === "error") errors += r.call_count;
      cost += (r.cost_estimate_eur ?? 0) * r.call_count;
    }
    const total = api + cache + errors;
    return { api, cache, errors, total, cost, hitRate: total > 0 ? cache / total : 0 };
  }, [usage]);

  return (
    <div className="space-y-4">
      <h4 className="font-semibold">Solar API — utilizzo mese corrente</h4>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Chiamate totali</p>
            <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Da API</p>
            <p className="text-2xl font-bold tabular-nums text-amber-600">{stats.api}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Da cache</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-600">{stats.cache}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Cache hit rate</p>
            <p className="text-2xl font-bold tabular-nums">{(stats.hitRate * 100).toFixed(0)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Costo stimato</p>
            <p className="text-2xl font-bold tabular-nums">€ {stats.cost.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {stats.api > 8000 && (
        <Alert variant="destructive">
          <AlertTitle>⚠ Soft limit superato</AlertTitle>
          <AlertDescription>
            Hai superato 8.000 chiamate Solar API questo mese (free tier 10.000). Le nuove chiamate
            potrebbero generare costi.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
