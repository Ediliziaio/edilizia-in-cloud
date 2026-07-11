import { useParams, useNavigate, Link } from "react-router-dom";
import { useDocumentoFiscale, useUpdateDocumento } from "@/hooks/useDocumentiFiscali";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import { creaNotaCredito } from "@/lib/fatturazione/noteCredito";
import { convertiProformaInFattura } from "@/lib/fatturazione/proforma";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { generateFatturaPAXML } from "@/lib/fatturazione/generateXML";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Download, FileText, FileWarning, Loader2, CreditCard, AlertTriangle, CheckCircle, Send, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type { AnagraficaAzienda } from "@/types/fatturazione";
import { usePaymentGateStore } from "@/store/paymentGateStore";

// Rende leggibili gli scarti SDI (array di stringhe o {message}) invece del JSON grezzo.
function formatSdiErrors(errors: unknown): string {
  if (Array.isArray(errors) && errors.length > 0) {
    return errors
      .map((e) => (typeof e === "string" ? e : (e as { message?: string })?.message ?? JSON.stringify(e)))
      .join("; ");
  }
  return "Il SDI ha rifiutato la fattura. Controlla i dati e riprova.";
}

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
  const { data: doc, isLoading } = useDocumentoFiscale(id);
  const { data: azienda } = useAnagraficaAzienda();
  const updateMutation = useUpdateDocumento();
  const [ncLoading, setNcLoading] = useState(false);
  const [convertLoading, setConvertLoading] = useState(false);
  const [sdiLoading, setSdiLoading] = useState(false);

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
  const canSegnaPagata = TIPI_PAGABILI.includes(doc.tipo) && ["emessa", "inviata_sdi", "consegnata", "accettata", "parzialmente_pagata"].includes(doc.stato);

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

  const handleDownloadXML = () => {
    try {
      const xml = generateFatturaPAXML(doc, azienda as AnagraficaAzienda);
      const blob = new Blob([xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${doc.numero}.xml`; a.click();
      URL.revokeObjectURL(url);
      toast.success("XML scaricato");
    } catch (err: unknown) { toast.error("Errore nella generazione XML", { description: getErrorMessage(err) }); }
  };

  const TIPI_SDI = ["fattura", "fattura_pa", "nota_credito", "nota_debito", "autofattura",
    "fattura_riepilogativa", "parcella", "fattura_accompagnatoria",
    "integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue"];
  const canInviaSDI = doc.stato === "emessa" && TIPI_SDI.includes(doc.tipo);

  const handleInviaSDI = async () => {
    setSdiLoading(true);
    try {
      const { supabase: sb } = await import("@/integrations/supabase/client");
      const resp = await sb.functions.invoke("invia-sdi", { body: { documento_id: doc.id } });
      if (resp.error) {
        // 402 = gate "carta obbligatoria": apri il dialog "Aggiungi carta"
        // (coerente con CassettoSDI). invoke diretto → non passa dal MutationCache.
        if ((resp.error as { context?: { status?: number } })?.context?.status === 402) {
          usePaymentGateStore.getState().show();
          return;
        }
        const detail = (resp.error as { context?: { json?: () => Promise<{ error?: string }> } }).context
          ? await (resp.error as { context: { json?: () => Promise<{ error?: string }> } }).context.json?.().catch((): null => null)
          : null;
        throw new Error(detail?.error || resp.error.message);
      }
      const result = resp.data as { success: boolean; sdi_id?: string; errors?: unknown[] };
      if (!result.success) {
        toast.error("Errore invio SDI", { description: formatSdiErrors(result.errors) });
        return;
      }
      toast.success("Fattura inviata al SDI", { description: `ID: ${result.sdi_id}` });
    } catch (err: unknown) { toast.error("Errore invio SDI", { description: getErrorMessage(err) }); }
    finally { setSdiLoading(false); }
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

  const handleSegnaPagata = () => {
    if (updateMutation.isPending) return;
    updateMutation.mutate({ id: doc.id, stato: "pagata", importo_pagato: doc.totale_da_pagare, pagato_at: new Date().toISOString() });
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

      {/* UX-01: Banner stato SDI — mostrato quando emessa e non ancora inviata */}
      {canInviaSDI && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">
                Stato fattura elettronica: <strong>Non firmata e non inviata</strong>
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                La fattura deve essere inviata al Sistema di Interscambio (SDI) per avere valore fiscale.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="bg-white border-amber-300 hover:bg-amber-50"
                onClick={handleDownloadXML}
              >
                <FileText className="h-4 w-4 mr-1" /> Visualizza XML
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={sdiLoading}
                  >
                    {sdiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                    Firma e invia al SDI
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Conferma invio al Sistema di Interscambio</AlertDialogTitle>
                    <AlertDialogDescription>
                      Stai per inviare {TIPO_LABELS[doc.tipo] ?? doc.tipo} N° {doc.numero} al SDI.
                      Una volta inviata, non potrà essere modificata. Confermi?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleInviaSDI} className="bg-blue-600 hover:bg-blue-700">
                      Firma e invia
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{tipoLabel} N° {doc.numero}</h1>
              <Badge variant={stato.variant}>{stato.label}</Badge>
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
            <Button variant="outline" size="sm" onClick={handleSegnaPagata} disabled={updateMutation.isPending}>
              <CreditCard className="h-4 w-4 mr-1" /> Segna pagata
            </Button>
          )}

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

          {/* Bottone Invia SDI nella barra azioni */}
          {canInviaSDI && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={sdiLoading}>
                  {sdiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  Invia a SDI
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Conferma invio al SDI</AlertDialogTitle>
                  <AlertDialogDescription>
                    Inviare {TIPO_LABELS[doc.tipo] ?? doc.tipo} N° {doc.numero} al Sistema di Interscambio?
                    Una volta inviata non potrà essere modificata.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={handleInviaSDI} className="bg-blue-600 hover:bg-blue-700">
                    Invia
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
                  <div><p className="text-xs text-muted-foreground">Totale</p><p className="font-semibold">€ {doc.totale_documento.toFixed(2)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Da pagare</p><p className="font-semibold">€ {doc.totale_da_pagare.toFixed(2)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Incassato</p><p className="font-semibold text-emerald-600">€ {doc.importo_pagato.toFixed(2)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Residuo</p><p className={`font-semibold ${residuo > 0 ? "text-destructive" : ""}`}>€ {residuo.toFixed(2)}</p></div>
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

          {/* SDI Status Card */}
          {doc.sdi_id_trasmissione && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Stato SDI</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">ID Trasmissione</span><span className="font-mono text-xs">{doc.sdi_id_trasmissione}</span></div>
                {doc.sdi_stato && <div className="flex justify-between"><span className="text-muted-foreground">Stato</span><Badge variant="outline">{doc.sdi_stato}</Badge></div>}
                {doc.sdi_data_consegna && <div className="flex justify-between"><span className="text-muted-foreground">Data consegna</span><span>{doc.sdi_data_consegna}</span></div>}
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
