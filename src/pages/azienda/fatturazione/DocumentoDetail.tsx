import { useParams, useNavigate, Link } from "react-router-dom";
import { formatCurrency } from "@/lib/formatters";
import { useDocumentoFiscale, useUpdateDocumento } from "@/hooks/useDocumentiFiscali";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import { creaNotaCredito } from "@/lib/fatturazione/noteCredito";
import { convertiProformaInFattura } from "@/lib/fatturazione/proforma";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { scaricaXmlFattura } from "@/lib/fatturazione/scaricaXml";
import { faseSdi, motivoSdi } from "@/lib/fatturazione/sdiCassetto";
import { useInvioSdi, useAggiornaStatoSdi } from "@/hooks/useInvioSdi";
import { SdiStatoBanner } from "@/components/fatturazione/SdiStatoBanner";
import { FaseSdiBadge } from "@/components/fatturazione/FaseSdiBadge";
import { SegnaPagataDialog } from "@/components/fatturazione/SegnaPagataDialog";
import { residuoDaIncassare } from "@/lib/fatturazione/incassi";
import { useRataDellaFattura } from "@/hooks/useRataDellaFattura";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Download, FileText, FileWarning, Loader2, CreditCard, AlertTriangle, CheckCircle, Send, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import type { AnagraficaAzienda } from "@/types/fatturazione";

const NC_ALLOWED_STATES = ["emessa", "consegnata", "inviata_sdi", "accettata", "pagata", "parzialmente_pagata"];
const TIPI_PAGABILI = ["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria", "nota_debito"];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

const STATO_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  bozza: { label: "Bozza", variant: "secondary" },
  emessa: { label: "Emessa", variant: "default" },
  in_invio: { label: "Invio in corso", variant: "outline" },
  inviata_sdi: { label: "Inviata SDI", variant: "default" },
  consegnata: { label: "Consegnata", variant: "default" },
  accettata: { label: "Accettata", variant: "default" },
  rifiutata: { label: "Rifiutata", variant: "destructive" },
  pagata: { label: "Pagata", variant: "default" },
  parzialmente_pagata: { label: "Parzialmente pagata", variant: "outline" },
  stornata: { label: "Stornata", variant: "secondary" },
  annullata: { label: "Annullata", variant: "destructive" },
};

const TIPO_LABELS: Record<string, string> = {
  fattura: "Fattura", fattura_pa: "Fattura PA", nota_credito: "Nota di Credito",
  nota_debito: "Nota di Debito", ddt: "DDT", proforma: "Proforma", preventivo: "Preventivo",
  parcella: "Parcella", fattura_accompagnatoria: "Fattura Accompagnatoria",
  autofattura: "Autofattura", fattura_riepilogativa: "Fatt. Riepilogativa",
  integrazione_servizi_estero: "TD17 — Servizi Estero", integrazione_beni_ue: "TD18 — Beni UE", integrazione_beni_extra_ue: "TD19 — Beni Extra-UE",
};

export default function DocumentoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: doc, isLoading, refetch } = useDocumentoFiscale(id);
  const { data: rataCommessa } = useRataDellaFattura(id);
  const { data: azienda } = useAnagraficaAzienda();
  const updateMutation = useUpdateDocumento();
  const [ncLoading, setNcLoading] = useState(false);
  const [convertLoading, setConvertLoading] = useState(false);
  const [pagaAperto, setPagaAperto] = useState(false);
  // Invio e esito, gli stessi dell'editor: dopo l'invio la pagina si rilegge da
  // sola e passa a «In elaborazione» (24/09/2026).
  const invioSdi = useInvioSdi();
  const aggiornaStatoSdi = useAggiornaStatoSdi();
  const fase = doc ? faseSdi(doc)?.fase : undefined;

  // Mentre lo SDI la elabora, si rilegge ogni minuto: l'esito arriva col giro
  // automatico (ogni quarto d'ora) o con «Aggiorna stato».
  useEffect(() => {
    if (fase !== "in_elaborazione" && fase !== "invio_in_corso") return;
    const giro = window.setInterval(() => { void refetch(); }, 60_000);
    return () => window.clearInterval(giro);
  }, [fase, refetch]);

  if (isLoading || !doc) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const canCreateNC = NC_ALLOWED_STATES.includes(doc.stato) && ["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria"].includes(doc.tipo);
  const stato = STATO_LABELS[doc.stato] ?? { label: doc.stato, variant: "secondary" as const };
  const tipoLabel = TIPO_LABELS[doc.tipo] ?? doc.tipo;
  const residuo = doc.totale_da_pagare - doc.importo_pagato;
  const paymentProgress = doc.totale_da_pagare > 0 ? (doc.importo_pagato / doc.totale_da_pagare) * 100 : 0;
  const isProforma = doc.tipo === "proforma";
  const isPreventivo = doc.tipo === "preventivo";
  const canSegnaPagata = TIPI_PAGABILI.includes(doc.tipo)
    && ["emessa", "inviata_sdi", "consegnata", "accettata", "parzialmente_pagata"].includes(doc.stato)
    && residuoDaIncassare(doc) > 0;

  const handleCreaNC = async (modalita: "totale" | "parziale") => {
    try {
      setNcLoading(true);
      const prefilled = await creaNotaCredito(doc.id, modalita);
      navigate("/azienda/documenti/nuovo?tipo=nota_credito", { state: { prefilled } });
    } catch (err: unknown) { toast.error("Errore nella creazione della NC", { description: getErrorMessage(err) }); }
    finally { setNcLoading(false); }
  };

  const handleDownloadPDF = async () => {
    try { await downloadNativePDF(doc.id, doc.numero); toast.success("PDF scaricato"); }
    catch (err: unknown) { toast.error("Errore nel download PDF", { description: getErrorMessage(err) }); }
  };

  const handleDownloadXML = async () => {
    try {
      await scaricaXmlFattura(doc, azienda as AnagraficaAzienda | undefined);
    } catch (err: unknown) { toast.error("XML non scaricato", { description: getErrorMessage(err) }); }
  };

  const handleInviaSDI = () => {
    if (!invioSdi.isPending) invioSdi.mutate(doc.id);
  };

  const handleConvertToFattura = async () => {
    try {
      setConvertLoading(true);
      const newDoc = await convertiProformaInFattura(doc.id);
      toast.success("Convertito in fattura");
      navigate(`/azienda/documenti/${newDoc.id}`);
    } catch (err: unknown) { toast.error(getErrorMessage(err)); }
    finally { setConvertLoading(false); }
  };


  const handleStatoPreventivo = (nuovoStato: "accettata" | "annullata") => {
    if (updateMutation.isPending) return;
    updateMutation.mutate({ id: doc.id, stato: nuovoStato === "accettata" ? "accettata" : "annullata" });
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Proforma banner */}
      {isProforma && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <span className="font-medium text-destructive">DOCUMENTO NON FISCALE — Proforma</span>
        </div>
      )}

      {/* La fattura verso lo SDI: fase, cosa vuol dire, cosa fare. */}
      <SdiStatoBanner
        doc={doc}
        tipoLabel={tipoLabel}
        onInvia={handleInviaSDI}
        isInvio={invioSdi.isPending}
        onAggiorna={() => aggiornaStatoSdi.mutate(doc.id)}
        isAggiorna={aggiornaStatoSdi.isPending}
        onScaricaXml={handleDownloadXML}
        variante="riquadro"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Torna indietro" className="hidden md:inline-flex" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{tipoLabel} N° {doc.numero}</h1>
              {(!fase || ["pagata", "parzialmente_pagata", "scaduta", "stornata"].includes(doc.stato)) && (
                <Badge variant={stato.variant}>{stato.label}</Badge>
              )}
              {fase && <FaseSdiBadge doc={doc} />}
            </div>
            <p className="text-sm text-muted-foreground">
              {doc.cliente_snapshot?.ragione_sociale} — {doc.data_emissione}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
          {!["ddt", "proforma", "preventivo"].includes(doc.tipo) && (
            <Button variant="outline" size="sm" onClick={handleDownloadXML}>
              <FileText className="h-4 w-4 mr-1" /> XML
            </Button>
          )}

          {(isProforma || isPreventivo) && doc.stato !== "annullata" && (
            <Button size="sm" onClick={handleConvertToFattura} disabled={convertLoading}>
              {convertLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Converti in Fattura
            </Button>
          )}

          {isPreventivo && doc.stato === "emessa" && (
            <>
              <Button size="sm" variant="default" onClick={() => handleStatoPreventivo("accettata")} disabled={updateMutation.isPending}>
                <CheckCircle className="h-4 w-4 mr-1" /> Accettato
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleStatoPreventivo("annullata")} disabled={updateMutation.isPending}>
                Rifiutato
              </Button>
            </>
          )}

          {canSegnaPagata && (
            <Button variant="outline" size="sm" onClick={() => setPagaAperto(true)}>
              <CreditCard className="h-4 w-4 mr-1" /> Segna pagata
            </Button>
          )}
          {/* Un incasso vero (registra_incasso_atomico), non più la sola etichetta. */}
          <SegnaPagataDialog open={pagaAperto} onOpenChange={setPagaAperto} fatture={[doc]} />

          {canCreateNC && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={ncLoading}>
                  <FileWarning className="h-4 w-4 mr-1" />
                  {ncLoading ? "Creazione..." : "Emetti NC"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Crea Nota di Credito</AlertDialogTitle>
                  <AlertDialogDescription>Scegli la modalità di storno per la fattura N° {doc.numero}</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-3 py-2">
                  <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={() => handleCreaNC("totale")}>
                    <div className="text-left"><div className="font-medium">Storno totale automatico</div><div className="text-xs text-muted-foreground">Tutte le righe con quantità negate</div></div>
                  </Button>
                  <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={() => handleCreaNC("parziale")}>
                    <div className="text-left"><div className="font-medium">Storno parziale</div><div className="text-xs text-muted-foreground">Apri l'editor per inserire le righe</div></div>
                  </Button>
                </div>
                <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Scartata dallo SDI: si corregge nell'editor e si rimanda. */}
          {fase === "scartata" && (
            <Button size="sm" asChild>
              <Link to={`/azienda/documenti/${doc.id}`}>Correggi</Link>
            </Button>
          )}

          {doc.stato === "bozza" && (
            <Button size="sm" asChild>
              <Link to={`/azienda/documenti/${doc.id}`}>Modifica</Link>
            </Button>
          )}
        </div>
      </div>

      {/* 60/40 Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Preview (60%) */}
        <div className="lg:col-span-3 bg-muted/30 rounded-lg p-6 flex justify-center">
          <PreviewFattura documento={doc} azienda={azienda ?? null} scale={0.75} />
        </div>

        {/* Right: Info cards (40%) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Info Card */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Informazioni</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span>{tipoLabel}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Numero</span><span className="font-mono">{doc.numero}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Data emissione</span><span>{doc.data_emissione}</span></div>
              {doc.data_scadenza && <div className="flex justify-between"><span className="text-muted-foreground">Data scadenza</span><span>{doc.data_scadenza}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span>{doc.cliente_snapshot?.ragione_sociale || "—"}</span></div>
              {doc.cliente_snapshot?.partita_iva && <div className="flex justify-between"><span className="text-muted-foreground">P.IVA</span><span className="font-mono">{doc.cliente_snapshot.partita_iva}</span></div>}
            </CardContent>
          </Card>

          {/* Payment Card */}
          {!["ddt", "preventivo"].includes(doc.tipo) && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Pagamenti</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Totale</p><p className="font-semibold">{formatCurrency(doc.totale_documento)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Da pagare</p><p className="font-semibold">{formatCurrency(doc.totale_da_pagare)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Incassato</p><p className="font-semibold text-emerald-600">{formatCurrency(doc.importo_pagato)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Residuo</p><p className={`font-semibold ${residuo > 0 ? "text-destructive" : ""}`}>{formatCurrency(residuo)}</p></div>
                </div>
                <Progress value={paymentProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">{Math.round(paymentProgress)}% incassato</p>
                {residuo > 0 && (
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link to="/azienda/documenti/incassi">
                      <CreditCard className="h-4 w-4 mr-1" /> Registra incasso
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* La rata della commessa che questa fattura incassa (25/09/2026). */}
          {rataCommessa && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Commessa</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {rataCommessa.commessa && (
                  <Link to={`/azienda/ordini/${rataCommessa.commessa.id}`} className="font-medium text-primary hover:underline">
                    {rataCommessa.commessa.order_code || rataCommessa.commessa.description || "Apri la commessa"}
                  </Link>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Rata</span>
                  <span className="text-right">{rataCommessa.label} · {formatCurrency(rataCommessa.amount)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Nella commessa</span>
                  <span>
                    {rataCommessa.is_paid
                      ? `Incassata${rataCommessa.paid_date ? ` il ${new Date(`${rataCommessa.paid_date}T12:00:00`).toLocaleDateString("it-IT")}` : ""}`
                      : "Da incassare"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Pagata la fattura, la rata risulta incassata; incassata la rata, l'incasso va sulla fattura.</p>
              </CardContent>
            </Card>
          )}

          {/* SDI Status Card: parole, non sigle («AT», «NS») come prima. */}
          {doc.sdi_id_trasmissione && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Stato SDI</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {fase && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Fase</span><FaseSdiBadge doc={doc} /></div>}
                {doc.sdi_identificativo && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Identificativo SdI</span><span className="font-mono text-xs">{doc.sdi_identificativo}</span></div>}
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Trasmissione</span><span className="font-mono text-xs truncate">{doc.sdi_id_trasmissione}</span></div>
                {doc.sdi_data_consegna && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Esito arrivato il</span>
                    <span>{new Date(doc.sdi_data_consegna).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                )}
                {fase === "scartata" && motivoSdi(doc.sdi_errori) && (
                  <p className="text-xs text-destructive">Motivo dello scarto: {motivoSdi(doc.sdi_errori)}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Linked Documents */}
          {doc.documento_correlato_id && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Documenti collegati</CardTitle></CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link to={`/azienda/documenti/${doc.documento_correlato_id}/dettaglio`}>
                    <ExternalLink className="h-4 w-4 mr-1" /> Visualizza documento originale
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
