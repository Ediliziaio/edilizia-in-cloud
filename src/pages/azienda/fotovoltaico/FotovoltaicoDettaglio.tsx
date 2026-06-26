/**
 * Dettaglio progetto FV — vista post-wizard.
 * Tabs: Riepilogo / Componenti / Calcolo / PDF.
 * Layout v2 — coerente con mockup HTML EiC (gradient navy + cards a barra orange).
 */

import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
  ArrowLeft,
  Sun,
  FileText,
  Pencil,
  Download,
  Loader2,
  Trash2,
  AlertTriangle,
  FileSignature,
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
import { FvCard, FvKpi, FvChip, FvCallout } from "@/lib/fotovoltaico/wizardUI";
import {
  SendSignatureDialog,
  type SendSignatureResult,
} from "@/components/marketing/preventivi/SendSignatureDialog";
import { useRichiediFirma } from "@/hooks/useRichiediFirma";
import type { SendSignatureParams } from "@/hooks/useSignatureActions";
import { toast } from "sonner";

const STATI_LABEL = {
  bozza: { label: "Bozza", variant: "default" as const },
  configurato: { label: "Configurato", variant: "navy" as const },
  emesso: { label: "Emesso", variant: "orange" as const },
  firmato: { label: "Firmato", variant: "green" as const },
  annullato: { label: "Annullato", variant: "red" as const },
};

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
  const [firmaOpen, setFirmaOpen] = useState(false);
  const richiediFirma = useRichiediFirma();

  // Riusa la firma elettronica (FEA) esistente — stesso flusso del preventivo.
  const handleSendFirma = async (params: SendSignatureParams): Promise<SendSignatureResult> => {
    if (!progetto) throw new Error("Progetto non disponibile");
    const res = await richiediFirma.mutateAsync({
      tipo_documento: "fv",
      documento_id: progetto.id,
      tipo_firmatario: String(progetto.archetipo ?? "").startsWith("privato") ? "b2c" : "b2b",
      signer_email: params.recipientEmail,
      signer_name: params.recipientName,
      scadenza_giorni: params.expiresDays,
    });
    return { signature_link: res.firma_link };
  };

  const [scaricando, setScaricando] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Caricamento progetto…
      </div>
    );
  }

  if (!progetto) {
    return (
      <div className="max-w-xl mx-auto mt-8 px-4">
        <FvCard>
          <div className="py-10 text-center space-y-3">
            <Sun className="h-12 w-12 mx-auto text-slate-400" />
            <p className="font-semibold text-slate-900">Progetto non trovato</p>
            <Button asChild variant="outline">
              <Link to="/azienda/marketing/fotovoltaico">Torna alla lista</Link>
            </Button>
          </div>
        </FvCard>
      </div>
    );
  }

  const stato = STATI_LABEL[progetto.stato as keyof typeof STATI_LABEL] ?? STATI_LABEL.bozza;
  const formatEur = (n: number | null | undefined, frac = 0) =>
    n == null
      ? "—"
      : `€ ${Number(n).toLocaleString("it-IT", {
          minimumFractionDigits: frac,
          maximumFractionDigits: frac,
        })}`;
  const formatPct = (n: number | null | undefined, frac = 1) =>
    n == null ? "—" : `${(Number(n) * 100).toFixed(frac)}%`;

  const handleScarica = async (
    path: string | null,
    tipo: string,
    options?: { autoPrint?: boolean },
  ) => {
    if (!path) {
      toast.error("Anteprima non ancora generata. Completa il wizard fino allo Step 8.");
      return;
    }
    setScaricando(tipo);
    try {
      const { data, error } = await supabase.storage
        .from("fv-progetti")
        .createSignedUrl(path, 300);
      if (error) throw error;
      const isHtml = path.toLowerCase().endsWith(".html");
      if (isHtml) {
        // Supabase Storage serve .html con Content-Type: text/plain → raw source nel browser.
        // Fix: scarica il contenuto, crea un Blob con type text/html e apri via objectURL.
        const res = await fetch(data.signedUrl);
        if (!res.ok) throw new Error("Errore download preventivo");
        let htmlContent = await res.text();
        if (options?.autoPrint) {
          htmlContent = htmlContent.replace("</body>", "<script>window.onload=function(){window.print()}<\/script></body>");
        }
        const blob = new Blob([htmlContent], { type: "text/html" });
        const blobUrl = URL.createObjectURL(blob);
        const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
        // Revoca il blob URL dopo l'apertura (il browser ha già caricato il contenuto)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        if (!win) toast.error("Popup bloccato — abilita i popup per questo sito.");
        else if (!options?.autoPrint) {
          toast.success(
            "Preventivo aperto in nuova scheda. Usa Ctrl+P (Cmd+P su Mac) → 'Salva come PDF'.",
            { duration: 6000 },
          );
        }
      } else {
        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.click();
      }
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
    <div className="min-h-screen bg-slate-50">
      {/* HERO HEADER */}
      <div
        className="relative overflow-hidden text-white"
        style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2C5184 100%)" }}
      >
        <div
          className="absolute -top-1/3 -right-10 w-2/5 h-[160%] pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 60%)",
          }}
        />
        <div
          className="absolute right-8 top-6 text-7xl opacity-10 select-none"
          aria-hidden
        >
          ☀
        </div>
        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-8 py-6 space-y-3">
          <Link
            to="/azienda/marketing/fotovoltaico"
            className="inline-flex items-center gap-1.5 text-sm text-blue-100 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Torna alla lista progetti
          </Link>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-widest font-semibold mb-1 text-orange-200">
                ★ DETTAGLIO PROGETTO
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center flex-wrap gap-3">
                {progetto.titolo}
                <FvChip variant={stato.variant}>{stato.label}</FvChip>
              </h1>
              <p className="text-sm text-blue-100 mt-1.5 flex items-center gap-3 flex-wrap">
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-xs">
                  {progetto.numero}
                </span>
                <span>· {progetto.indirizzo}</span>
              </p>
            </div>
            <div className="flex gap-2">
              {progetto.stato !== "firmato" && progetto.stato !== "annullato" && (
                <Button
                  asChild
                  className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow border-0"
                >
                  <Link to={`/azienda/marketing/fotovoltaico/${progetto.id}/modifica`}>
                    <Pencil className="h-4 w-4 mr-1.5" /> Modifica
                  </Link>
                </Button>
              )}
              {isAdmin && progetto.stato !== "firmato" && (
                <Button
                  variant="outline"
                  onClick={handleElimina}
                  className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" /> Annulla
                </Button>
              )}
              {progetto.stato === "emesso" && (
                <Button
                  onClick={() => setFirmaOpen(true)}
                  className="bg-white text-orange-700 hover:bg-orange-50 shadow border-0"
                >
                  <FileSignature className="h-4 w-4 mr-1.5" /> Richiedi firma
                </Button>
              )}
              <SendSignatureDialog
                open={firmaOpen}
                onOpenChange={setFirmaOpen}
                clientEmail={null}
                clientName={null}
                quoteNumber={progetto.numero}
                onSend={handleSendFirma}
                isSending={richiediFirma.isPending}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-6 space-y-5">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FvKpi
            label="Potenza"
            value={progetto.potenza_kwp != null ? Number(progetto.potenza_kwp).toFixed(2) : "—"}
            unit="kWp"
            variant="orange"
          />
          <FvKpi
            label="Investimento"
            value={
              progetto.prezzo_vendita_iva_inclusa != null
                ? Number(progetto.prezzo_vendita_iva_inclusa).toLocaleString("it-IT", {
                    maximumFractionDigits: 0,
                  })
                : "—"
            }
            unit="€"
          />
          <FvKpi
            label="Payback"
            value={progetto.payback_anni ?? "—"}
            unit="anni"
            variant="green"
          />
          <FvKpi
            label="Risparmio anno 1"
            value={
              progetto.risparmio_anno1 != null
                ? Number(progetto.risparmio_anno1).toLocaleString("it-IT", {
                    maximumFractionDigits: 0,
                  })
                : "—"
            }
            unit="€"
            variant="green"
          />
        </div>

        {/* Capienza warning */}
        {progetto.capienza_irpef_warning && (
          <FvCallout
            variant="error"
            title="Capienza IRPEF da verificare"
            icon={<AlertTriangle className="h-4 w-4" />}
          >
            {progetto.capienza_irpef_warning}
          </FvCallout>
        )}

        <Tabs defaultValue="riepilogo">
          <TabsList className="bg-white border border-slate-200 rounded-xl p-1">
            <TabsTrigger value="riepilogo">Riepilogo</TabsTrigger>
            <TabsTrigger value="componenti">Componenti ({componenti.length})</TabsTrigger>
            <TabsTrigger value="calcolo">Calcolo finanziario</TabsTrigger>
            <TabsTrigger value="allegati">Preventivo</TabsTrigger>
          </TabsList>

          {/* TAB Riepilogo */}
          <TabsContent value="riepilogo" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <FvCard title="Cliente e immobile">
                <Row label="Archetipo" value={progetto.archetipo} />
                <Row label="Indirizzo" value={progetto.indirizzo} />
                <Row
                  label="Comune"
                  value={`${progetto.comune ?? "—"} (${progetto.provincia ?? "—"})`}
                />
                <Row label="Tipologia" value={progetto.tipologia_immobile ?? "—"} />
                <Row label="Prima casa" value={progetto.prima_casa ? "Sì" : "No"} />
                <Row
                  label="Superficie"
                  value={
                    progetto.superficie_immobile_mq != null
                      ? `${progetto.superficie_immobile_mq} m²`
                      : "—"
                  }
                />
              </FvCard>
              <FvCard title="Consumi">
                <Row
                  label="Consumo annuo"
                  value={
                    progetto.consumo_annuo_kwh != null
                      ? `${progetto.consumo_annuo_kwh.toLocaleString("it-IT")} kWh`
                      : "—"
                  }
                />
                <Row
                  label="Costo €/kWh"
                  value={
                    progetto.costo_kwh_attuale != null
                      ? `€ ${Number(progetto.costo_kwh_attuale).toFixed(3)}`
                      : "—"
                  }
                />
                <Row label="Tariffa" value={progetto.tariffa_tipo ?? "—"} />
                <Row label="Profilo" value={progetto.profilo_consumo ?? "—"} />
                <Row
                  label="ISEE"
                  value={progetto.isee != null ? formatEur(progetto.isee) : "—"}
                />
                <Row
                  label="Reddito dichiarato"
                  value={
                    progetto.reddito_annuo_dichiarato != null
                      ? formatEur(progetto.reddito_annuo_dichiarato)
                      : "—"
                  }
                />
              </FvCard>
              <FvCard title="Tetto e impianto">
                <Row label="Fonte dati tetto" value={progetto.fonte_dati_tetto ?? "—"} />
                <Row label="Qualità dati" value={progetto.qualita_dati_tetto ?? "—"} />
                <Row label="Imagery date" value={progetto.imagery_date ?? "—"} />
                <Row
                  label="Ore sole annue"
                  value={
                    progetto.ore_sole_annue != null
                      ? `${progetto.ore_sole_annue} h`
                      : "—"
                  }
                />
                <Row
                  label="Pannelli installati"
                  value={
                    progetto.numero_pannelli_scelti != null
                      ? `${progetto.numero_pannelli_scelti}`
                      : "—"
                  }
                />
                <Row
                  label="Accumulo"
                  value={
                    progetto.con_accumulo
                      ? progetto.capacita_accumulo_kwh != null
                        ? `${progetto.capacita_accumulo_kwh} kWh`
                        : "Sì"
                      : "No"
                  }
                />
                <Row label="Wallbox" value={progetto.con_wallbox ? "Sì" : "No"} />
                <Row label="Ottimizzatori" value={progetto.con_ottimizzatori ? "Sì" : "No"} />
              </FvCard>
              <FvCard title="Risultati finanziari">
                <Row
                  label="Produzione anno 1"
                  value={
                    progetto.produzione_annua_kwh != null
                      ? `${Number(progetto.produzione_annua_kwh).toLocaleString("it-IT")} kWh`
                      : "—"
                  }
                />
                <Row label="Autoconsumo" value={formatPct(progetto.autoconsumo_pct)} />
                <Row label="NPV 25 anni" value={formatEur(progetto.npv_25_anni)} />
                <Row label="IRR" value={formatPct(progetto.irr_pct, 2)} />
                <Row
                  label="CO₂ evitata"
                  value={
                    progetto.co2_evitata_25_anni_kg != null
                      ? `${progetto.co2_evitata_25_anni_kg.toLocaleString("it-IT")} kg`
                      : "—"
                  }
                />
                {isAdmin && (
                  <>
                    <Row
                      label="Costo netto"
                      value={formatEur(progetto.costo_totale_netto)}
                      muted
                    />
                    <Row
                      label="Margine €"
                      value={formatEur(progetto.margine_eur)}
                      muted
                    />
                    <Row
                      label="Margine %"
                      value={formatPct(progetto.margine_pct)}
                      muted
                    />
                  </>
                )}
              </FvCard>
            </div>
          </TabsContent>

          {/* TAB Componenti */}
          <TabsContent value="componenti" className="mt-4">
            <FvCard compact>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Categoria
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Descrizione
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Marca/Modello
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-right">
                        Qta
                      </TableHead>
                      {isAdmin && (
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-right">
                          Netto
                        </TableHead>
                      )}
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-right">
                        Vendita
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-right">
                        Tot. vendita
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {componenti.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={isAdmin ? 7 : 6}
                          className="text-center py-6 text-slate-500"
                        >
                          Nessun componente.
                        </TableCell>
                      </TableRow>
                    )}
                    {componenti.map((c) => (
                      <TableRow key={c.id} className="hover:bg-orange-50/50">
                        <TableCell>
                          <FvChip variant="navy">{c.categoria}</FvChip>
                        </TableCell>
                        <TableCell>{c.descrizione}</TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {c.marca ?? ""} {c.modello ?? ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.quantita}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right tabular-nums text-slate-600">
                            € {(c.quantita * c.prezzo_unitario_netto).toFixed(2)}
                          </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">
                          € {c.prezzo_unitario_vendita.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          € {(c.quantita * c.prezzo_unitario_vendita).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </FvCard>

            {(manodopera.length > 0 || servizi.length > 0) && (
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                {manodopera.length > 0 && (
                  <FvCard title="Manodopera">
                    {manodopera.map((m) => (
                      <div
                        key={m.id}
                        className="flex justify-between text-sm py-1.5 border-b border-slate-100 last:border-0"
                      >
                        <span className="text-slate-700">
                          {m.descrizione}{" "}
                          <span className="text-slate-400 text-xs">({m.ore} h)</span>
                        </span>
                        <span className="tabular-nums font-semibold">
                          € {(m.ore * m.tariffa_oraria_vendita).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </FvCard>
                )}
                {servizi.length > 0 && (
                  <FvCard title="Servizi e pratiche">
                    {servizi.map((s) => (
                      <div
                        key={s.id}
                        className="flex justify-between text-sm py-1.5 border-b border-slate-100 last:border-0"
                      >
                        <span className="text-slate-700">{s.descrizione}</span>
                        <span className="tabular-nums font-semibold">
                          € {s.prezzo_vendita.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </FvCard>
                )}
              </div>
            )}
          </TabsContent>

          {/* TAB Calcolo finanziario */}
          <TabsContent value="calcolo" className="mt-4">
            <FvCard title="Incentivi applicati">
              {(progetto.incentivi_applicati ?? []).length === 0 && (
                <p className="text-sm text-slate-500">
                  Nessun incentivo calcolato. Ricalcola dal wizard.
                </p>
              )}
              <div className="space-y-2">
                {(progetto.incentivi_applicati ?? []).map((inc) => (
                  <div
                    key={inc.codice}
                    className="flex justify-between items-start gap-3 border-b border-slate-100 pb-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{inc.nome}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {inc.tipo} ·{" "}
                        {inc.durata_anni ? `${inc.durata_anni} anni` : "una tantum"}
                      </div>
                    </div>
                    <div className="text-right text-orange-600 font-bold tabular-nums shrink-0">
                      {inc.importo_eur != null ? formatEur(inc.importo_eur) : "Disponibile"}
                    </div>
                  </div>
                ))}
              </div>
            </FvCard>
          </TabsContent>

          {/* TAB Allegati / Preventivo */}
          <TabsContent value="allegati" className="mt-4">
            <FvCard title="Preventivo cliente professionale">
              {!progetto.pdf_vendita_url && (
                <FvCallout
                  variant="info"
                  title="Anteprima non ancora generata"
                  icon={<FileText className="h-4 w-4" />}
                >
                  Completa il wizard fino allo Step 8 e premi "Genera ed emetti preventivo".
                  Verrà creato un documento HTML configurabile (cover, viste tetto, componenti,
                  produzione, flussi energetici, risparmio, costi futuri, piano economico,
                  cassa 25 anni, CO₂, garanzie, iter pratiche, FAQ, firma).
                </FvCallout>
              )}
              {progetto.pdf_vendita_url && (
                <>
                  <FvCallout variant="success" title="Preventivo pronto">
                    Apri l'anteprima nel browser, poi <strong>Ctrl+P</strong> (Cmd+P su Mac) →
                    "Salva come PDF" per ottenere il file da inviare al cliente. Il design è
                    print-ready A4 con tutti i grafici inline.
                  </FvCallout>
                  <div className="grid sm:grid-cols-2 gap-3 mt-4">
                    <Button
                      onClick={() => handleScarica(progetto.pdf_vendita_url, "vendita")}
                      disabled={scaricando === "vendita"}
                      className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white border-0"
                    >
                      {scaricando === "vendita" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 mr-2" />
                      )}
                      Apri preventivo (anteprima)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleScarica(progetto.pdf_vendita_url, "vendita-print", { autoPrint: true })
                      }
                      disabled={scaricando === "vendita-print"}
                    >
                      {scaricando === "vendita-print" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Apri e stampa subito (PDF)
                    </Button>
                  </div>
                </>
              )}
              {isAdmin && (progetto.pdf_tecnico_url || progetto.pdf_mobile_url) && (
                <div className="mt-6 pt-4 border-t border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">Versioni alternative</h4>
                  <div className="space-y-2">
                    {isAdmin && progetto.pdf_tecnico_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleScarica(progetto.pdf_tecnico_url, "tecnico")}
                        className="w-full justify-start"
                        disabled={scaricando === "tecnico"}
                      >
                        {scaricando === "tecnico" ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Versione tecnica interna (BOM + margini)
                      </Button>
                    )}
                    {progetto.pdf_mobile_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleScarica(progetto.pdf_mobile_url, "mobile")}
                        className="w-full justify-start"
                        disabled={scaricando === "mobile"}
                      >
                        {scaricando === "mobile" ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Versione mobile / WhatsApp
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </FvCard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string | number;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-baseline text-sm py-1.5 border-b border-slate-100 last:border-0 ${
        muted ? "text-slate-500" : ""
      }`}
    >
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold tabular-nums ${muted ? "" : "text-slate-900"}`}>
        {String(value)}
      </span>
    </div>
  );
}
