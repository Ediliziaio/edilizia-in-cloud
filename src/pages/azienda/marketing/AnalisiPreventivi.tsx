import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import {
  Loader2, BrainCircuit, Copy, Check, ChevronDown, ChevronUp,
} from "lucide-react";
import { Navigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreventivoDato {
  quote_id: string;
  quote_number: string;
  tipo_lavoro: string | null;
  ricavo_totale: number | null;
  costo_totale: number | null;
  margine_pct: number | null;
}

interface AnalisiDati {
  totalPreventivi: number;
  ricavoTotale: number;
  margineMediano: number;
  valoreMediano: number;
  preventivi: PreventivoDato[];
}

// ─── Quick questions ──────────────────────────────────────────────────────────

const DOMANDE_RAPIDE = [
  "Quali tipi di lavoro rendono di più?",
  "Ho prezzi competitivi?",
  "Dove perdo più margine?",
  "Cosa mi conviene spingere di più?",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnalisiPreventivi() {
  const [periodoMesi, setPeriodoMesi] = useState("12");
  const [domanda, setDomanda] = useState("");
  const [analisi, setAnalisi] = useState<string | null>(null);
  const [analisiTimestamp, setAnalisiTimestamp] = useState<Date | null>(null);
  const [dati, setDati] = useState<AnalisiDati | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingKpi, setLoadingKpi] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);

  const { effectiveCompany, role, isLoading: authLoading } = useAuth() as any;
  const companyId = effectiveCompany?.id as string | undefined;
  const isAdmin = role === "company_admin" || role === "super_admin";

  // ─── Legge il target margine dalle impostazioni aziendali ──────────────────
  const { data: impostazioni } = useQuery({
    queryKey: ["preventivo-impostazioni", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase.from("preventivo_impostazioni") as any)
        .select("margine_minimo_percentuale, margine_target_percentuale")
        .eq("company_id", companyId)
        .maybeSingle();
      return data as { margine_minimo_percentuale: number | null; margine_target_percentuale: number | null } | null;
    },
  });

  const margineTarget = impostazioni?.margine_target_percentuale ?? 25;
  const margineMin = impostazioni?.margine_minimo_percentuale ?? 15;

  // ─── Carica KPI / dati strutturati al cambio periodo ──────────────────────
  useEffect(() => {
    if (!companyId) return;
    setLoadingKpi(true);
    setAnalisi(null);         // B2: reset analisi stale al cambio periodo
    setAnalisiTimestamp(null);
    setShowAllRows(false);
    const mesiKpi = parseInt(periodoMesi, 10) || 12;
    supabase.functions
      .invoke("ai-analisi-preventivi", {
        body: { company_id: companyId, periodo_mesi: mesiKpi },
      })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Errore nel caricamento dei dati");
        } else if (data) {
          setDati(data.dati ?? data);
        }
      })
      .finally(() => setLoadingKpi(false));
  }, [companyId, periodoMesi]);

  // ─── Analisi AI ───────────────────────────────────────────────────────────
  const handleAnalizza = useCallback(async (domandaOverride?: string) => {
    if (!companyId) {
      toast.error("Azienda non caricata, riprova");
      return;
    }
    setLoading(true);
    const domandaEffettiva =
      domandaOverride !== undefined ? domandaOverride : domanda.trim() || undefined;
    try {
      const { data, error } = await supabase.functions.invoke("ai-analisi-preventivi", {
        body: {
          company_id: companyId,
          periodo_mesi: parseInt(periodoMesi, 10) || 12,
          domanda: domandaEffettiva,
        },
      });
      if (error) {
        toast.error("Errore durante l'analisi AI");
      } else if (data) {
        setAnalisi(data.analisi ?? null);
        setDati(data.dati ?? data);
        if (data.analisi) setAnalisiTimestamp(new Date());
      }
    } catch {
      toast.error("Errore imprevisto durante l'analisi");
    } finally {
      setLoading(false);
    }
  }, [companyId, periodoMesi, domanda]);

  // ─── Copy analisi ─────────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (!analisi) return;
    navigator.clipboard.writeText(analisi).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [analisi]);

  // ─── Guard admin — DOPO tutti i hook ──────────────────────────────────────
  if (!authLoading && !isAdmin) return <Navigate to="/azienda/marketing" replace />;

  // ─── Chart data ───────────────────────────────────────────────────────────
  const chartData = dati?.preventivi
    ? Object.values(
        dati.preventivi.reduce<Record<string, { tipo: string; count: number; margine_sum: number }>>(
          (acc, p) => {
            const key = p.tipo_lavoro || "Non specificato";
            if (!acc[key]) acc[key] = { tipo: key, count: 0, margine_sum: 0 };
            acc[key].count++;
            acc[key].margine_sum += p.margine_pct || 0;
            return acc;
          },
          {},
        ),
      ).map((v) => ({
        tipo: v.tipo,
        margine: v.count > 0 ? Math.round((v.margine_sum / v.count) * 10) / 10 : 0,
      }))
    : [];

  const righeVisibili = showAllRows
    ? (dati?.preventivi ?? [])
    : (dati?.preventivi ?? []).slice(0, 10);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-violet-600" /> Analisi Preventivi AI
          </h1>
          <p className="text-muted-foreground text-sm">Insights intelligenti sui tuoi preventivi storici</p>
        </div>
        <Select value={periodoMesi} onValueChange={setPeriodoMesi}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Ultimi 3 mesi</SelectItem>
            <SelectItem value="6">Ultimi 6 mesi</SelectItem>
            <SelectItem value="12">Ultimo anno</SelectItem>
            <SelectItem value="24">Ultimi 2 anni</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {loadingKpi ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (dati?.totalPreventivi ?? "—")}
            </div>
            <p className="text-xs text-muted-foreground">Preventivi analizzati</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {loadingKpi ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (dati?.ricavoTotale != null ? formatCurrency(dati.ricavoTotale) : "—")}
            </div>
            <p className="text-xs text-muted-foreground">Ricavo totale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {loadingKpi ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (dati?.margineMediano != null ? `${dati.margineMediano.toFixed(1)}%` : "—")}
            </div>
            <p className="text-xs text-muted-foreground">Margine medio</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {loadingKpi ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (dati?.valoreMediano != null ? formatCurrency(dati.valoreMediano) : "—")}
            </div>
            <p className="text-xs text-muted-foreground">Valore medio preventivo</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Analysis Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-violet-600" />
            Cosa mi dice l'AI
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Domande rapide */}
          <div className="flex flex-wrap gap-2">
            {DOMANDE_RAPIDE.map((q) => (
              <Badge
                key={q}
                variant="outline"
                className="cursor-pointer hover:bg-violet-50 hover:border-violet-400 transition-colors text-xs"
                onClick={() => setDomanda(q)}
              >
                {q}
              </Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Textarea
              placeholder='Fai una domanda o scegli un suggerimento sopra…'
              value={domanda}
              onChange={(e) => setDomanda(e.target.value)}
              rows={2}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAnalizza();
              }}
            />
            <div className="flex flex-col gap-2">
              <Button onClick={() => handleAnalizza()} disabled={loading} className="whitespace-nowrap">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analizza"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDomanda("");
                  handleAnalizza("");
                }}
                disabled={loading}
                className="whitespace-nowrap text-xs"
                title="Genera un'analisi completa senza domanda specifica"
              >
                Analisi generale
              </Button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
              L'AI sta analizzando {dati?.totalPreventivi ?? ""} preventivi…
            </div>
          )}

          {analisi && !loading && (
            <div className="relative">
              <div className="bg-muted/30 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed border-l-2 border-violet-400 pr-10">
                {analisi}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleCopy}
                title="Copia analisi"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
              {analisiTimestamp && (
                <p className="text-xs text-muted-foreground mt-1 text-right">
                  Generata il {format(analisiTimestamp, "d MMM yyyy 'alle' HH:mm", { locale: it })}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empty state — nessun dato */}
      {!dati && !loadingKpi && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BrainCircuit className="h-12 w-12 mx-auto mb-4 text-violet-300" />
            <p className="font-medium">Nessun dato disponibile</p>
            <p className="text-sm mt-1">Accetta alcuni preventivi per iniziare l'analisi</p>
            <Button className="mt-4" onClick={() => handleAnalizza()}>
              Prova l'analisi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state — dati presenti ma nessun preventivo */}
      {dati && (!dati.preventivi || dati.preventivi.length === 0) && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium">Nessun preventivo accettato nel periodo selezionato</p>
            <p className="text-sm mt-1">Prova ad allargare il range temporale</p>
          </CardContent>
        </Card>
      )}

      {/* Bar Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Margine per tipo di lavoro</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${Number(v).toFixed(1)}%`, "Margine medio"]} />
                {/* Linea target reale dalle impostazioni aziendali */}
                <ReferenceLine
                  y={margineTarget}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${margineTarget}%`, position: "right", fontSize: 10 }}
                />
                {/* Linea soglia minima */}
                {margineMin !== margineTarget && (
                  <ReferenceLine
                    y={margineMin}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{ value: `Min ${margineMin}%`, position: "right", fontSize: 10 }}
                  />
                )}
                <Bar
                  dataKey="margine"
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                  label={{ position: "top", formatter: (v: number) => `${Number(v).toFixed(0)}%`, fontSize: 10 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Preventivi table */}
      {dati?.preventivi && dati.preventivi.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Preventivi analizzati</CardTitle>
              <span className="text-sm text-muted-foreground">
                {showAllRows
                  ? `${dati.preventivi.length} preventivi`
                  : `Mostrando 10 di ${dati.preventivi.length}`}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Tipo lavoro</TableHead>
                  <TableHead>Ricavo</TableHead>
                  <TableHead>Costo</TableHead>
                  <TableHead>Margine %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {righeVisibili.map((p) => (
                  <TableRow key={p.quote_id}>
                    <TableCell className="font-mono text-xs">{p.quote_number}</TableCell>
                    <TableCell>{p.tipo_lavoro || "—"}</TableCell>
                    <TableCell>{p.ricavo_totale != null ? formatCurrency(p.ricavo_totale) : "—"}</TableCell>
                    <TableCell>{p.costo_totale != null ? formatCurrency(p.costo_totale) : "—"}</TableCell>
                    <TableCell>
                      {p.margine_pct != null ? (
                        <span
                          className={`font-medium ${
                            p.margine_pct >= margineTarget
                              ? "text-green-600"
                              : p.margine_pct >= margineMin
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {Number(p.margine_pct).toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {dati.preventivi.length > 10 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-muted-foreground"
                onClick={() => setShowAllRows((v) => !v)}
              >
                {showAllRows ? (
                  <><ChevronUp className="h-4 w-4 mr-1" /> Mostra meno</>
                ) : (
                  <><ChevronDown className="h-4 w-4 mr-1" /> Mostra tutti ({dati.preventivi.length})</>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
