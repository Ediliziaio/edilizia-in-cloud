/**
 * Dettaglio progetto FV — vista post-wizard.
 * Tabs: Riepilogo / Componenti / Calcolo / Allegati / Audit.
 */

import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft,
  Sun,
  FileText,
  Pencil,
  Download,
  Loader2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  useProgetto,
  useComponentiProgetto,
  useManodoperaProgetto,
  useServiziProgetto,
  useEliminaProgetto,
} from "@/lib/fotovoltaico/queries";
import { toast } from "sonner";

const STATI_LABEL = {
  bozza: { label: "Bozza", className: "bg-muted" },
  configurato: { label: "Configurato", className: "bg-blue-50 text-blue-700 border-blue-200" },
  emesso: { label: "Emesso", className: "bg-amber-50 text-amber-700 border-amber-200" },
  firmato: { label: "Firmato", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  annullato: { label: "Annullato", className: "bg-red-50 text-red-700 border-red-200" },
} as const;

export default function FotovoltaicoDettaglio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";

  const { data: progetto, isLoading } = useProgetto(id);
  const { data: componenti = [] } = useComponentiProgetto(id);
  const { data: manodopera = [] } = useManodoperaProgetto(id);
  const { data: servizi = [] } = useServiziProgetto(id);
  const elimina = useEliminaProgetto();

  const [scaricando, setScaricando] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Caricamento progetto…
      </div>
    );
  }

  if (!progetto) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardContent className="py-10 text-center space-y-3">
          <Sun className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="font-medium">Progetto non trovato</p>
          <Button asChild variant="outline">
            <Link to="/azienda/marketing/fotovoltaico">Torna alla lista</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stato = STATI_LABEL[progetto.stato as keyof typeof STATI_LABEL] ?? STATI_LABEL.bozza;
  const formatEur = (n: number | null | undefined, frac = 0) =>
    n == null ? "—" : `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: frac, maximumFractionDigits: frac })}`;
  const formatPct = (n: number | null | undefined, frac = 1) =>
    n == null ? "—" : `${(Number(n) * 100).toFixed(frac)}%`;

  const handleScarica = async (path: string | null, tipo: string) => {
    if (!path) {
      toast.error("PDF non ancora generato");
      return;
    }
    setScaricando(tipo);
    try {
      const { data, error } = await supabase.storage
        .from("fv-progetti")
        .createSignedUrl(path, 60);
      if (error) throw error;
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.target = "_blank";
      a.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setScaricando(null);
    }
  };

  const handleElimina = async () => {
    if (!confirm("Annullare questo progetto?")) return;
    try {
      await elimina.mutateAsync(progetto.id);
      navigate("/azienda/marketing/fotovoltaico");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      {/* Header */}
      <Button asChild variant="ghost" size="sm">
        <Link to="/azienda/marketing/fotovoltaico">
          <ArrowLeft className="h-4 w-4 mr-1" /> Lista
        </Link>
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <Sun className="h-8 w-8 text-amber-500 mt-1" />
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {progetto.titolo}
              <Badge variant="outline" className={stato.className}>{stato.label}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              <strong>{progetto.numero}</strong> · {progetto.indirizzo}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {progetto.stato !== "firmato" && progetto.stato !== "annullato" && (
            <Button asChild variant="outline">
              <Link to={`/azienda/marketing/fotovoltaico/${progetto.id}/modifica`}>
                <Pencil className="h-4 w-4 mr-2" /> Modifica
              </Link>
            </Button>
          )}
          {isAdmin && progetto.stato !== "firmato" && (
            <Button variant="outline" onClick={handleElimina}>
              <Trash2 className="h-4 w-4 mr-2 text-destructive" />
              Annulla
            </Button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Potenza" value={progetto.potenza_kwp != null ? `${Number(progetto.potenza_kwp).toFixed(2)} kWp` : "—"} />
        <Kpi label="Investimento" value={formatEur(progetto.prezzo_vendita_iva_inclusa)} accent />
        <Kpi label="Payback" value={progetto.payback_anni != null ? `${progetto.payback_anni} anni` : "—"} />
        <Kpi label="Risparmio anno 1" value={formatEur(progetto.risparmio_anno1)} />
      </div>

      {/* Capienza warning */}
      {progetto.capienza_irpef_warning && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Capienza IRPEF da verificare</AlertTitle>
          <AlertDescription>{progetto.capienza_irpef_warning}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="riepilogo">
        <TabsList>
          <TabsTrigger value="riepilogo">Riepilogo</TabsTrigger>
          <TabsTrigger value="componenti">Componenti ({componenti.length})</TabsTrigger>
          <TabsTrigger value="calcolo">Calcolo finanziario</TabsTrigger>
          <TabsTrigger value="allegati">PDF</TabsTrigger>
        </TabsList>

        {/* TAB Riepilogo */}
        <TabsContent value="riepilogo" className="mt-3">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="py-4 space-y-2">
                <h4 className="font-semibold">Cliente e immobile</h4>
                <Row label="Archetipo" value={progetto.archetipo} />
                <Row label="Indirizzo" value={progetto.indirizzo} />
                <Row label="Comune" value={`${progetto.comune ?? "—"} (${progetto.provincia ?? "—"})`} />
                <Row label="Tipologia" value={progetto.tipologia_immobile ?? "—"} />
                <Row label="Prima casa" value={progetto.prima_casa ? "Sì" : "No"} />
                <Row label="Superficie" value={progetto.superficie_immobile_mq != null ? `${progetto.superficie_immobile_mq} m²` : "—"} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 space-y-2">
                <h4 className="font-semibold">Consumi</h4>
                <Row label="Consumo annuo" value={progetto.consumo_annuo_kwh != null ? `${progetto.consumo_annuo_kwh.toLocaleString("it-IT")} kWh` : "—"} />
                <Row label="Costo €/kWh" value={`€ ${progetto.costo_kwh_attuale.toFixed(3)}`} />
                <Row label="Tariffa" value={progetto.tariffa_tipo} />
                <Row label="Profilo" value={progetto.profilo_consumo ?? "—"} />
                <Row label="ISEE" value={progetto.isee != null ? formatEur(progetto.isee) : "—"} />
                <Row label="Reddito dichiarato" value={progetto.reddito_annuo_dichiarato != null ? formatEur(progetto.reddito_annuo_dichiarato) : "—"} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 space-y-2">
                <h4 className="font-semibold">Tetto e impianto</h4>
                <Row label="Fonte dati tetto" value={progetto.fonte_dati_tetto ?? "—"} />
                <Row label="Qualità dati" value={progetto.qualita_dati_tetto ?? "—"} />
                <Row label="Imagery date" value={progetto.imagery_date ?? "—"} />
                <Row label="Ore sole annue" value={progetto.ore_sole_annue != null ? `${progetto.ore_sole_annue} h` : "—"} />
                <Row label="Pannelli installati" value={progetto.numero_pannelli_scelti != null ? `${progetto.numero_pannelli_scelti}` : "—"} />
                <Row label="Accumulo" value={progetto.con_accumulo ? `${progetto.capacita_accumulo_kwh} kWh` : "No"} />
                <Row label="Wallbox" value={progetto.con_wallbox ? "Sì" : "No"} />
                <Row label="Ottimizzatori" value={progetto.con_ottimizzatori ? "Sì" : "No"} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 space-y-2">
                <h4 className="font-semibold">Risultati finanziari</h4>
                <Row label="Produzione anno 1" value={progetto.produzione_annua_kwh != null ? `${Number(progetto.produzione_annua_kwh).toLocaleString("it-IT")} kWh` : "—"} />
                <Row label="Autoconsumo" value={formatPct(progetto.autoconsumo_pct)} />
                <Row label="NPV 25 anni" value={formatEur(progetto.npv_25_anni)} />
                <Row label="IRR" value={formatPct(progetto.irr_pct, 2)} />
                <Row label="CO2 evitata" value={progetto.co2_evitata_25_anni_kg != null ? `${progetto.co2_evitata_25_anni_kg.toLocaleString("it-IT")} kg` : "—"} />
                {isAdmin && (
                  <>
                    <Row label="Costo netto" value={formatEur(progetto.costo_totale_netto)} muted />
                    <Row label="Margine €" value={formatEur(progetto.margine_eur)} muted />
                    <Row label="Margine %" value={formatPct(progetto.margine_pct)} muted />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB Componenti */}
        <TabsContent value="componenti" className="mt-3">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Descrizione</TableHead>
                    <TableHead>Marca/Modello</TableHead>
                    <TableHead className="text-right">Qta</TableHead>
                    {isAdmin && <TableHead className="text-right">Netto</TableHead>}
                    <TableHead className="text-right">Vendita</TableHead>
                    <TableHead className="text-right">Tot. vendita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {componenti.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-6 text-muted-foreground">
                        Nessun componente.
                      </TableCell>
                    </TableRow>
                  )}
                  {componenti.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell><Badge variant="outline">{c.categoria}</Badge></TableCell>
                      <TableCell>{c.descrizione}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.marca ?? ""} {c.modello ?? ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.quantita}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right tabular-nums">
                          € {(c.quantita * c.prezzo_unitario_netto).toFixed(2)}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">
                        € {c.prezzo_unitario_vendita.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        € {(c.quantita * c.prezzo_unitario_vendita).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {(manodopera.length > 0 || servizi.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              {manodopera.length > 0 && (
                <Card>
                  <CardContent className="py-4">
                    <h4 className="font-semibold mb-2">Manodopera</h4>
                    {manodopera.map((m) => (
                      <div key={m.id} className="flex justify-between text-sm py-1">
                        <span>{m.descrizione} ({m.ore} h)</span>
                        <span className="tabular-nums">€ {(m.ore * m.tariffa_oraria_vendita).toFixed(2)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              {servizi.length > 0 && (
                <Card>
                  <CardContent className="py-4">
                    <h4 className="font-semibold mb-2">Servizi e pratiche</h4>
                    {servizi.map((s) => (
                      <div key={s.id} className="flex justify-between text-sm py-1">
                        <span>{s.descrizione}</span>
                        <span className="tabular-nums">€ {s.prezzo_vendita.toFixed(2)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* TAB Calcolo finanziario */}
        <TabsContent value="calcolo" className="mt-3">
          <Card>
            <CardContent className="py-5 space-y-3">
              <h4 className="font-semibold">Incentivi applicati</h4>
              {(progetto.incentivi_applicati ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nessun incentivo calcolato. Ricalcola dal wizard.</p>
              )}
              {(progetto.incentivi_applicati ?? []).map((inc) => (
                <div key={inc.codice} className="flex justify-between border-b pb-2">
                  <div>
                    <div className="font-medium">{inc.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {inc.tipo} · {inc.durata_anni ? `${inc.durata_anni} anni` : "una tantum"}
                    </div>
                  </div>
                  <div className="text-right text-amber-600 font-bold">
                    {inc.importo_eur != null ? formatEur(inc.importo_eur) : "Disponibile"}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB Allegati */}
        <TabsContent value="allegati" className="mt-3">
          <Card>
            <CardContent className="py-5 space-y-3">
              <h4 className="font-semibold">PDF generati</h4>
              {!progetto.pdf_vendita_url && !progetto.pdf_tecnico_url && !progetto.pdf_mobile_url && (
                <Alert>
                  <FileText className="h-4 w-4" />
                  <AlertTitle>Nessun PDF generato</AlertTitle>
                  <AlertDescription>
                    Completa il wizard fino allo Step 8 per generare i PDF.
                  </AlertDescription>
                </Alert>
              )}
              {progetto.pdf_vendita_url && (
                <Button
                  variant="outline"
                  onClick={() => handleScarica(progetto.pdf_vendita_url, "vendita")}
                  className="w-full justify-start"
                  disabled={scaricando === "vendita"}
                >
                  {scaricando === "vendita" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  PDF Vendita (12 pagine, persuasivo per cliente)
                </Button>
              )}
              {isAdmin && progetto.pdf_tecnico_url && (
                <Button
                  variant="outline"
                  onClick={() => handleScarica(progetto.pdf_tecnico_url, "tecnico")}
                  className="w-full justify-start"
                  disabled={scaricando === "tecnico"}
                >
                  {scaricando === "tecnico" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  PDF Tecnico interno (6 pagine, BOM + margini — solo titolare)
                </Button>
              )}
              {progetto.pdf_mobile_url && (
                <Button
                  variant="outline"
                  onClick={() => handleScarica(progetto.pdf_mobile_url, "mobile")}
                  className="w-full justify-start"
                  disabled={scaricando === "mobile"}
                >
                  {scaricando === "mobile" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  PDF Mobile/WhatsApp (3 pagine)
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-bold tabular-nums mt-0.5 text-lg ${accent ? "text-orange-600" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, muted }: { label: string; value: string | number; muted?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className="font-medium">{String(value)}</span>
    </div>
  );
}
