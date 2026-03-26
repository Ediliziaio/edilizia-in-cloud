import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { Loader2, BrainCircuit, TrendingUp, TrendingDown, Target, FileText } from "lucide-react";
import { Navigate } from "react-router-dom";

export default function AnalisiPreventivi() {
  const [periodoMesi, setPeriodoMesi] = useState("12");
  const [domanda, setDomanda] = useState("");
  const [analisi, setAnalisi] = useState<string | null>(null);
  const [dati, setDati] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingKpi, setLoadingKpi] = useState(false);
  const [kpi, setKpi] = useState<{ totalPreventivi: number; ricavoTotale: number; margineMediano: number; valoreMediano: number } | null>(null);

  const { effectiveCompany, role, isLoading: authLoading } = useAuth() as any;
  const companyId = effectiveCompany?.id;
  const isAdmin = role === "company_admin" || role === "super_admin";

  // Wait for auth to finish loading before redirecting
  if (!authLoading && !isAdmin) return <Navigate to="/azienda/marketing" replace />;

  useEffect(() => {
    if (!companyId) return;
    setLoadingKpi(true);
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

  async function handleAnalizza(domandaOverride?: string) {
    if (!companyId) {
      toast.error("Azienda non caricata, riprova");
      return;
    }
    setLoading(true);
    const domandaEffettiva = domandaOverride !== undefined ? domandaOverride : domanda.trim() || undefined;
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
      }
    } catch (err) {
      toast.error("Errore imprevisto durante l'analisi");
    } finally {
      setLoading(false);
    }
  }

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
            <div className="text-2xl font-bold">{dati?.totalPreventivi ?? "—"}</div>
            <p className="text-xs text-muted-foreground">Preventivi accettati</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {dati?.ricavoTotale != null ? formatCurrency(dati.ricavoTotale) : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Ricavo totale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {dati?.margineMediano != null ? `${dati.margineMediano.toFixed(1)}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Margine medio</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {dati?.valoreMediano != null ? formatCurrency(dati.valoreMediano) : "—"}
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
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Textarea
              placeholder='Fai una domanda... Es: "Dovrei alzare i prezzi dei serramenti?" / "Perché i preventivi bagno hanno margini bassi?"'
              value={domanda}
              onChange={(e) => setDomanda(e.target.value)}
              rows={2}
              className="flex-1"
            />
            <div className="flex flex-col gap-2">
              <Button onClick={handleAnalizza} disabled={loading} className="whitespace-nowrap">
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
              >
                Analisi completa
              </Button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
              L'AI sta analizzando {dati?.totalPreventivi ?? ""} preventivi...
            </div>
          )}

          {analisi && !loading && (
            <div className="bg-muted/30 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed border-l-2 border-violet-400">
              {analisi}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bar Chart section */}
      {dati?.preventivi && dati.preventivi.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Margine per tipo di lavoro</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={Object.entries(
                  dati.preventivi.reduce((acc: any, p: any) => {
                    const key = p.tipo_lavoro || "Non specificato";
                    if (!acc[key]) acc[key] = { tipo: key, count: 0, margine_sum: 0 };
                    acc[key].count++;
                    acc[key].margine_sum += p.margine_pct || 0;
                    return acc;
                  }, {}),
                ).map(([_, v]: any) => ({
                  tipo: v.tipo,
                  margine: v.count > 0 ? v.margine_sum / v.count : 0,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Margine medio"]} />
                <ReferenceLine
                  y={25}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  label={{ value: "Target 25%", position: "right", fontSize: 10 }}
                />
                <Bar
                  dataKey="margine"
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                  label={{ position: "top", formatter: (v: any) => `${Number(v).toFixed(0)}%`, fontSize: 10 }}
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
            <CardTitle>Preventivi analizzati</CardTitle>
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
                {dati.preventivi.slice(0, 10).map((p: any) => (
                  <TableRow key={p.quote_id}>
                    <TableCell className="font-mono text-xs">{p.quote_number}</TableCell>
                    <TableCell>{p.tipo_lavoro || "—"}</TableCell>
                    <TableCell>{p.ricavo_totale != null ? formatCurrency(p.ricavo_totale) : "—"}</TableCell>
                    <TableCell>{p.costo_totale != null ? formatCurrency(p.costo_totale) : "—"}</TableCell>
                    <TableCell>
                      {p.margine_pct != null ? (
                        <span
                          className={`font-medium ${
                            p.margine_pct >= 25
                              ? "text-green-600"
                              : p.margine_pct >= 15
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
          </CardContent>
        </Card>
      )}

      {!dati && !loading && (
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
    </div>
  );
}
