import { useParams, Link } from "react-router-dom";
import { useDentroPopupDocumento, useIdDocumento, useNavigaDocumento } from "@/lib/orders/documentoPopup";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { useDocumentoFiscale, useUpdateDocumento, useEmittiDocumento, useDeleteDocumento } from "@/hooks/useDocumentiFiscali";
import { preparaCopiaDocumento, siPuoDuplicare } from "@/lib/fatturazione/duplicaDocumento";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { useAuth } from "@/contexts/AuthContext";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import { creaNotaCredito } from "@/lib/fatturazione/noteCredito";
import { convertiProformaInFattura } from "@/lib/fatturazione/proforma";
import { downloadNativePDF, apriDocumentoInScheda } from "@/lib/fatturazione/generatePDF";
import { scaricaXmlFattura } from "@/lib/fatturazione/scaricaXml";
import { faseSdi, motivoSdi } from "@/lib/fatturazione/sdiCassetto";
import { useInvioSdi, useAggiornaStatoSdi } from "@/hooks/useInvioSdi";
import { FatturaElettronicaPannello } from "@/components/fatturazione/FatturaElettronicaPannello";
import { EditorSendEmailDialog } from "./editor/EditorSendEmailDialog";
import type { EditorState } from "./editor/useEditorState";
import { FaseSdiBadge } from "@/components/fatturazione/FaseSdiBadge";
import { SegnaPagataDialog } from "@/components/fatturazione/SegnaPagataDialog";
import { IncassiFattura } from "@/components/fatturazione/IncassiFattura";
import { creditoCliente, residuoDaIncassare } from "@/lib/fatturazione/incassi";
import { useRateDellaFattura } from "@/hooks/useRataDellaFattura";
import { CommessaRateFattura } from "@/components/fatturazione/CommessaRateFattura";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoteInterneFattura } from "@/components/fatturazione/NoteInterneFattura";
import { AllegatiFattura } from "@/components/fatturazione/AllegatiFattura";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Copy, FileWarning, Loader2, CreditCard, AlertTriangle, CheckCircle, Send, ExternalLink, Mail, Pencil, Printer, Save, FileText, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { TIPI_SDI } from "@/lib/fatturazione/sdiCassetto";
import type { AnagraficaAzienda, RigaDocumento } from "@/types/fatturazione";
import { KpiMobili } from "@/components/mobile/FiltriMobile";
import { avvisoEmissione } from "@/lib/fatturazione/emissioneBozza";
import { emessaMaiUscita } from "@/lib/fatturazione/correggibile";
import { annoDelDocumento } from "@/lib/fatturazione/primaEmissione";
import { AvvisoNumerazione } from "@/components/fatturazione/AvvisoNumerazione";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

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
  reverse_charge_interno: "TD16 — Reverse Charge", integrazione_servizi_estero: "TD17 — Servizi Estero", integrazione_beni_ue: "TD18 — Beni UE", integrazione_beni_extra_ue: "TD19 — Beni Extra-UE",
};

export default function DocumentoDetail() {
  const t = useT();
  const { id: idIndirizzo } = useParams();
  const id = useIdDocumento(idIndirizzo);
  const inPopup = useDentroPopupDocumento();
  const navigate = useNavigaDocumento();
  const { data: doc, isLoading, refetch } = useDocumentoFiscale(id);
  const rateQuery = useRateDellaFattura(id);
  const rateCommessa = rateQuery.data ?? [];
  const { data: azienda } = useAnagraficaAzienda();
  const { effectiveCompany } = useAuth();
  const fatturazioneEsterna = useBillingMode({ facoltativo: true })?.isExternal ?? false;
  const updateMutation = useUpdateDocumento();
  const emittiMutation = useEmittiDocumento();
  const deleteMutation = useDeleteDocumento();
  const [ncLoading, setNcLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMessaggio, setPdfMessaggio] = useState<string | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [pagaAperto, setPagaAperto] = useState(false);
  const [emailAperta, setEmailAperta] = useState(false);
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

  const canCreateNC = !fatturazioneEsterna && NC_ALLOWED_STATES.includes(doc.stato) && ["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria"].includes(doc.tipo);
  const stato = STATO_LABELS[doc.stato] ?? { label: doc.stato, variant: "secondary" as const };
  const tipoLabel = TIPO_LABELS[doc.tipo] && !/^TD\d/.test(TIPO_LABELS[doc.tipo]) ? t(TIPO_LABELS[doc.tipo]) : (TIPO_LABELS[doc.tipo] ?? doc.tipo);
  // Al netto delle note di credito, come l'incasso sul database.
  const residuo = residuoDaIncassare(doc);
  const credito = creditoCliente(doc);
  const dovuto = doc.totale_da_pagare - (doc.stornato ?? 0);
  const paymentProgress = dovuto > 0 ? Math.min(100, (doc.importo_pagato / dovuto) * 100) : 0;
  // Emessa ma mai uscita (16/11/2026): niente SDI, niente incassi. Per l'Agenzia non esiste
  // ancora, quindi si corregge come una scartata — numero e data restano quelli.
  const maiUscita = emessaMaiUscita(doc);
  const modificabile = doc.stato === "bozza" || fase === "scartata" || maiUscita;
  const isProforma = doc.tipo === "proforma";
  const isPreventivo = doc.tipo === "preventivo";
  // Una bozza fiscale si emette direttamente dal dettaglio: assegna il numero
  // definitivo e la porta a «Da inviare allo SDI». Proforma e preventivo hanno
  // il loro flusso («Converti in Fattura»), quindi niente Emetti per loro.
  const canEmettere = !fatturazioneEsterna && doc.stato === "bozza" && TIPI_SDI.includes(doc.tipo) && !isProforma && !isPreventivo;
  const canSegnaPagata = TIPI_PAGABILI.includes(doc.tipo)
    && ["emessa", "inviata_sdi", "consegnata", "accettata", "scaduta", "parzialmente_pagata"].includes(doc.stato)
    && residuoDaIncassare(doc) > 0;

  const handleCreaNC = async (modalita: "totale" | "parziale") => {
    try {
      setNcLoading(true);
      const prefilled = await creaNotaCredito(doc.id, modalita);
      navigate("/azienda/documenti/nuovo?tipo=nota_credito", { state: { prefilled } });
    } catch (err: unknown) { toast.error(t("Errore nella creazione della NC"), { description: getErrorMessage(err) }); }
    finally { setNcLoading(false); }
  };

  // Stampa nativa del browser: «Salva PDF» e «Stampa» aprono lo stesso dialogo,
  // da cui si sceglie la stampante o «Salva come PDF» (testo vero, non immagine).
  const handleStampa = async (salva: boolean) => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfMessaggio(salva
      ? t("Preparazione della stampa. Per salvare il PDF scegli «Salva come PDF» nel dialogo del browser: non è un download automatico.")
      : t("Preparazione del documento per la stampa…"));
    try {
      await downloadNativePDF(doc.id, doc.numero);
      setPdfMessaggio(t("Stampa richiesta. Se il dialogo non compare nel browser integrato, apri il portale nel browser esterno e riprova. Nessun documento è stato emesso o inviato."));
    } catch (err: unknown) {
      setPdfMessaggio(t("PDF non preparato: {errore}", { errore: t(getErrorMessage(err)) }));
      toast.error(t("Errore nella preparazione del PDF"), { description: getErrorMessage(err) });
    } finally { setPdfBusy(false); }
  };

  const handleApriPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfMessaggio(t("Apertura del documento in una nuova scheda…"));
    try {
      await apriDocumentoInScheda(doc.id);
      setPdfMessaggio(t("Documento aperto nella nuova scheda. Per ottenere un PDF usa la stampa del browser."));
    } catch (err: unknown) {
      setPdfMessaggio(t("Documento non aperto: {errore}", { errore: t(getErrorMessage(err)) }));
      toast.error(t("Impossibile aprire il PDF"), { description: getErrorMessage(err) });
    } finally { setPdfBusy(false); }
  };

  const handleDuplica = () => {
    navigate(`/azienda/documenti/nuovo?tipo=${doc.tipo}`, { state: preparaCopiaDocumento(doc) });
  };

  const handleDownloadXML = async () => {
    try {
      await scaricaXmlFattura(doc, azienda as AnagraficaAzienda | undefined);
    } catch (err: unknown) { toast.error(t("XML non scaricato"), { description: getErrorMessage(err) }); }
  };

  const handleInviaSDI = () => {
    if (!invioSdi.isPending) invioSdi.mutate(doc.id);
  };

  // Emissione dal dettaglio: il documento è già salvato (non in modifica), quindi
  // basta la mutation; a esito riuscito si rilegge e il riquadro SDI avanza a
  // «Da inviare allo SDI». L'esito e gli errori li annuncia useEmittiDocumento.
  const handleEmetti = () => {
    if (emittiMutation.isPending) return;
    emittiMutation.mutate(doc.id, { onSuccess: () => { void refetch(); } });
  };

  const handleConvertToFattura = async () => {
    try {
      setConvertLoading(true);
      const newDoc = await convertiProformaInFattura(doc.id);
      toast.success(t("Convertito in fattura"));
      navigate(`/azienda/documenti/${newDoc.id}`);
    } catch (err: unknown) { toast.error(t(getErrorMessage(err))); }
    finally { setConvertLoading(false); }
  };


  const handleStatoPreventivo = (nuovoStato: "accettata" | "annullata") => {
    if (updateMutation.isPending) return;
    updateMutation.mutate({ id: doc.id, stato: nuovoStato === "accettata" ? "accettata" : "annullata" });
  };

  // Emessa e mai partita (26/11/2026): non c'è niente da stornare, si annulla e il numero
  // torna alla serie. Dopo, l'elenco: questa scheda non esiste più fuori dal cestino.
  const handleAnnullaMaiUscita = () => {
    if (deleteMutation.isPending) return;
    deleteMutation.mutate(doc.id, {
      onSuccess: () => navigate("/azienda/documenti"),
    });
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto max-sm:space-y-3 max-sm:p-0">
      {/* Proforma banner */}
      {isProforma && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2 max-sm:p-2 max-sm:text-xs">
          <AlertTriangle className="h-5 w-5 text-destructive max-sm:hidden" />
          <span className="font-medium text-destructive">{t("DOCUMENTO NON FISCALE — Proforma")}</span>
        </div>
      )}

      {/* Titolo e ritorno ai documenti. */}
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-1">
        {!inPopup && <Button variant="outline" size="sm" className="w-fit gap-1.5 max-sm:hidden" onClick={() => navigate("/azienda/documenti")}>
          <ArrowLeft className="h-4 w-4" /> {t("Torna ai documenti")}
        </Button>}
        <div className="sm:text-right">
          <div className="flex items-center gap-2 sm:justify-end max-sm:flex-wrap max-sm:gap-1.5">
            <h1 className="text-xl font-semibold max-sm:text-lg max-sm:leading-tight">{t("{tipoLabel} numero {numero}", { tipoLabel: String(tipoLabel ?? ""), numero: String(doc.numero ?? "") })}</h1>
            {(!fase || ["pagata", "parzialmente_pagata", "scaduta", "stornata"].includes(doc.stato)) && (
              <Badge variant={stato.variant}>{t(stato.label)}</Badge>
            )}
            {fase && <FaseSdiBadge doc={doc} />}
          </div>
          <p className="text-sm text-muted-foreground max-sm:text-xs">
            {doc.cliente_snapshot?.ragione_sociale} — {formatDateShort(doc.data_emissione)}
            {/* Mobile: la scadenza sta qui (il riquadro Informazioni è nascosto). */}
            {doc.data_scadenza && <span className="sm:hidden">{" "}{t("· scade {data_scadenza}", { data_scadenza: formatDateShort(doc.data_scadenza) })}</span>}
          </p>
        </div>
      </div>

      {fatturazioneEsterna && <p role="status" className="mx-auto w-full max-w-4xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("L'azienda usa la fatturazione esterna. Puoi consultare e scaricare questo documento; per completare le bozze nell'editor verifica la")} <Link className="font-medium underline" to="/azienda/impostazioni/fatturazione">{t("modalità di fatturazione")}</Link>.</p>}
      {/* Le azioni sul documento, tutte in fila e con il loro nome. */}
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-2 max-sm:gap-1.5 max-sm:[&_a]:h-8 max-sm:[&_a]:text-xs max-sm:[&_button]:h-8 max-sm:[&_button]:px-2.5 max-sm:[&_button]:text-xs">
        {/* Modifica: finché non è uscita — bozza, scartata dallo SDI, oppure emessa e mai trasmessa. */}
        {!isPreventivo && !isProforma || doc.stato === "bozza" ? (
          modificabile && !fatturazioneEsterna ? (
            <Button size="sm" asChild className="gap-1.5">
              <Link to={`/azienda/documenti/${doc.id}`}><Pencil className="h-4 w-4" />{fase === "scartata" ? t("Correggi") : t("Modifica")}</Link>
            </Button>
          ) : (
            <span title={fatturazioneEsterna ? t("L'editor richiede la fatturazione nativa. Verifica la modalità nelle impostazioni di fatturazione.") : t("Questa fattura è già uscita (inviata allo SDI, incassata o con una nota collegata): non si modifica. Per correggerla emetti una nota di credito.")} className="inline-flex">
              <Button size="sm" disabled className="gap-1.5"><Lock className="h-4 w-4" />{t("Modifica")}</Button>
            </span>
          )
        ) : null}
        {/* Emetti: la bozza fiscale prende il numero definitivo e diventa «Da inviare allo SDI». */}
        {canEmettere && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" className="gap-1.5" disabled={emittiMutation.isPending}>
                {emittiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {emittiMutation.isPending ? t("Emissione…") : t("Emetti")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("Emetti documento")}</AlertDialogTitle>
                <AlertDialogDescription>{t("Emetti questa {tipoLabel}? {doc} L'emissione non può essere annullata.", { tipoLabel: String(tipoLabel ?? ""), doc: String(avvisoEmissione(doc) ?? "") })}</AlertDialogDescription>
                {/* La numerazione, finché si è in tempo (16/11/2026). */}
                <AvvisoNumerazione companyId={doc.company_id} tipo={doc.tipo} anno={annoDelDocumento(doc)} />
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleEmetti} disabled={emittiMutation.isPending}>
                  {emittiMutation.isPending ? t("Emissione in corso…") : t("Emetti documento")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {!fatturazioneEsterna && siPuoDuplicare(doc.tipo) && <Button size="sm" variant="secondary" className="gap-1.5 max-md:hidden" onClick={handleDuplica}><Copy className="h-4 w-4" />{t("Duplica")}</Button>}
        <Button size="sm" variant="secondary" className="gap-1.5 max-sm:hidden" disabled={pdfBusy} onClick={() => void handleApriPdf()}><FileText className="h-4 w-4" />{t("Apri PDF")}</Button>
        <Button size="sm" variant="secondary" className="gap-1.5 max-sm:hidden" disabled={pdfBusy} onClick={() => void handleStampa(true)}><Save className="h-4 w-4" />{t("Salva PDF")}</Button>
        <Button size="sm" variant="secondary" className="gap-1.5 max-sm:hidden" disabled={pdfBusy} onClick={() => void handleStampa(false)}><Printer className="h-4 w-4" />{t("Stampa")}</Button>
        {doc.stato !== "bozza" && (
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setEmailAperta(true)}><Mail className="h-4 w-4" />{t("Invia per e-mail")}</Button>
        )}

        {!fatturazioneEsterna && (isProforma || isPreventivo) && doc.stato !== "annullata" && (
          <Button size="sm" onClick={handleConvertToFattura} disabled={convertLoading} className="gap-1.5">
            {convertLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("Converti in Fattura")}
          </Button>
        )}

        {isPreventivo && doc.stato === "emessa" && (
          <>
            <Button size="sm" onClick={() => handleStatoPreventivo("accettata")} disabled={updateMutation.isPending} className="gap-1.5">
              <CheckCircle className="h-4 w-4" /> {t("Accettato")}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleStatoPreventivo("annullata")} disabled={updateMutation.isPending}>
              {t("Rifiutato")}
            </Button>
          </>
        )}

        {canSegnaPagata && (
          <Button variant="outline" size="sm" onClick={() => setPagaAperto(true)} className="gap-1.5">
            <CreditCard className="h-4 w-4" /> {t("Segna pagata")}
          </Button>
        )}
        {/* Un incasso vero (registra_incasso_atomico), non più la sola etichetta. */}
        <SegnaPagataDialog open={pagaAperto} onOpenChange={setPagaAperto} fatture={[doc]} />

        {canCreateNC && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={ncLoading} className="gap-1.5 max-md:hidden">
                <FileWarning className="h-4 w-4" />
                {ncLoading ? t("Creazione...") : t("Emetti NC")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("Crea Nota di Credito")}</AlertDialogTitle>
                <AlertDialogDescription className="max-sm:sr-only">{t("Scegli la modalità di storno per la fattura N° {numero}", { numero: String(doc.numero ?? "") })}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3 py-2 max-sm:space-y-2 max-sm:py-0">
                <Button variant="outline" className="w-full justify-start h-auto py-3 max-sm:py-2" onClick={() => handleCreaNC("totale")}>
                  <div className="text-left"><div className="font-medium">{t("Storno totale automatico")}</div><div className="text-xs text-muted-foreground">{t("Tutte le righe della fattura, con sconti e contributi")}</div></div>
                </Button>
                <Button variant="outline" className="w-full justify-start h-auto py-3 max-sm:py-2" onClick={() => handleCreaNC("parziale")}>
                  <div className="text-left"><div className="font-medium">{t("Storno parziale")}</div><div className="text-xs text-muted-foreground">{t("Apri l'editor per inserire le righe")}</div></div>
                </Button>
              </div>
              <AlertDialogFooter><AlertDialogCancel>{t("Annulla")}</AlertDialogCancel></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Mai partita: si annulla, non si storna. Il numero torna alla serie (26/11/2026). */}
        {!fatturazioneEsterna && maiUscita && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={deleteMutation.isPending} className="gap-1.5 text-destructive hover:text-destructive">
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("Annulla fattura")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("Annullare la fattura n° {numero}?", { numero: String(doc.numero ?? "") })}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("Non è mai stata inviata allo SDI, quindi non serve una nota di credito: va nel cestino e il numero {numero} torna alla serie, lo prenderà la prossima fattura.", { numero: String(doc.numero ?? "") })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleAnnullaMaiUscita}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? t("Annullamento…") : t("Annulla la fattura")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* La fattura verso lo SDI: fase, cosa fare, vedere l'XML, verificare, esportare. */}
      {TIPI_SDI.includes(doc.tipo) && (
        <FatturaElettronicaPannello
          doc={doc}
          azienda={azienda as AnagraficaAzienda | undefined}
          tipoLabel={tipoLabel}
          onInvia={handleInviaSDI}
          isInvio={invioSdi.isPending}
          onAggiorna={() => aggiornaStatoSdi.mutate(doc.id)}
          isAggiorna={aggiornaStatoSdi.isPending}
          onEsportaXml={handleDownloadXML}
          onEmetti={canEmettere ? handleEmetti : undefined}
          isEmitting={emittiMutation.isPending}
        />
      )}

      <EditorSendEmailDialog
        state={doc as unknown as EditorState}
        open={emailAperta}
        onOpenChange={setEmailAperta}
        saveNow={async () => { /* il documento è già salvato: qui non si modifica */ }}
      />

      {/* Mobile: al posto dell'anteprima A4 (più larga dello schermo) le righe
          una per voce e i due numeri che contano. */}
      <div className="space-y-2 sm:hidden">
        {!["ddt", "preventivo"].includes(doc.tipo) && (
          <KpiMobili
            voci={[
              { label: t("Totale"), valore: formatCurrency(doc.totale_documento) },
              { label: t("Da incassare"), valore: formatCurrency(Math.max(0, residuo)), tono: residuo > 0.005 ? "text-rose-600" : undefined },
              ...(credito > 0.005 ? [{ label: t("Credito del cliente"), valore: formatCurrency(credito), tono: "text-amber-600" }] : []),
            ]}
          />
        )}
        {((doc.righe ?? []) as RigaDocumento[]).length > 0 && (
          <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
            {((doc.righe ?? []) as RigaDocumento[]).map((r, i) => (
              <div key={r.id ?? i} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-tight">{r.descrizione}</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {r.quantita} {r.unita_misura} × {formatCurrency(r.prezzo_unitario)}{doc.tipo !== "ddt" ? ` · ${t("IVA {aliquota_iva}%", { aliquota_iva: String(r.aliquota_iva ?? "") })}` : ""}
                  </p>
                </div>
                {doc.tipo !== "ddt" && <span className="shrink-0 text-[13px] font-semibold tabular-nums">{formatCurrency(r.imponibile)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* L'anteprima, al centro, come sarà sul foglio. Mobile no: vedi sopra. */}
      {pdfMessaggio && <p role="status" className="rounded-md border p-3 text-sm">{pdfMessaggio}</p>}
      <section className="max-sm:hidden" aria-label={t("Anteprima del documento")}>
        <div className="mb-3 text-center">
          <h2 className="text-lg font-semibold">{t("Anteprima del documento")}</h2>
          <p className="text-sm text-muted-foreground">{t("per vedere l'originale premi «Apri PDF»")}</p>
        </div>
        <div className="mx-auto flex max-w-4xl justify-end pb-1.5">
          <Link to="/azienda/impostazioni/fatturazione?tab=nativa&sezione=pdf" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            {t("Personalizza lo stile delle tue fatture")} <Pencil className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mx-auto flex max-w-4xl justify-center overflow-x-auto rounded-xl border bg-muted/30 p-6 shadow-inner">
          <PreviewFattura documento={doc} azienda={azienda ?? null} logoAziendale={effectiveCompany?.logo_url} scale={0.9} />
        </div>
        <p className="mx-auto mt-2 max-w-4xl text-center text-xs text-muted-foreground">
          {t("Questa anteprima può differire leggermente dal PDF generato: premi «Apri PDF» per il documento reale.")}
        </p>
      </section>

      {/* Sotto: informazioni, pagamenti, commessa, stato SDI — a colonne. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 max-sm:gap-3">
        <div className="contents">
          {/* Info Card. Mobile no: tipo, numero, data e cliente sono nel titolo. */}
          <Card className="max-sm:hidden">
            <CardHeader className="pb-3"><CardTitle className="text-sm">{t("Informazioni")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("Tipo")}</span><span>{tipoLabel}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("Numero")}</span><span className="font-mono">{doc.numero}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("Data emissione")}</span><span>{formatDateShort(doc.data_emissione)}</span></div>
              {doc.data_scadenza && <div className="flex justify-between"><span className="text-muted-foreground">{t("Data scadenza")}</span><span>{formatDateShort(doc.data_scadenza)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">{t("Cliente")}</span><span>{doc.cliente_snapshot?.ragione_sociale || "—"}</span></div>
              {doc.cliente_snapshot?.partita_iva && <div className="flex justify-between"><span className="text-muted-foreground">P.IVA</span><span className="font-mono">{doc.cliente_snapshot.partita_iva}</span></div>}
            </CardContent>
          </Card>

          {/* Payment Card. Mobile no: totale e residuo stanno in cima, l'incasso
              si registra con «Segna pagata». */}
          {!["ddt", "preventivo"].includes(doc.tipo) && (
            <Card className="max-sm:hidden">
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t("Pagamenti")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">{t("Totale")}</p><p className="font-semibold">{formatCurrency(doc.totale_documento)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("Da pagare")}</p><p className="font-semibold">{formatCurrency(doc.totale_da_pagare)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("Incassato")}</p><p className="font-semibold text-emerald-600">{formatCurrency(doc.importo_pagato)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("Residuo")}</p><p className={`font-semibold ${residuo > 0 ? "text-destructive" : ""}`}>{formatCurrency(residuo)}</p></div>
                </div>
                {credito > 0.005 && (
                  <p className="text-xs text-amber-700">{t("Il cliente ha pagato {credito} in più dopo la nota di credito: va rimborsato o compensato.", { credito: formatCurrency(credito) })}</p>
                )}
                <Progress value={paymentProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">{t("{valore}% incassato", { valore: Math.round(paymentProgress) })}</p>
                {/* Storico, annulla incasso, segna pagata, abbina al bonifico (30/10/2026). */}
                {doc.stato !== "bozza" && <IncassiFattura doc={doc} pagabile={canSegnaPagata} />}
              </CardContent>
            </Card>
          )}

          {/* La rata della commessa che questa fattura incassa (25/09/2026). */}
          <CommessaRateFattura ordineId={doc.ordine_id} rate={rateCommessa} loading={rateQuery.isPending} error={rateQuery.isError} onRetry={()=>void rateQuery.refetch()}/>

          {/* SDI Status Card: parole, non sigle («AT», «NS») come prima. */}
          {/* Mobile no: codici di trasmissione; fase e motivo sono nel riquadro in cima. */}
          {doc.sdi_id_trasmissione && (
            <Card className="max-sm:hidden">
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t("Stato SDI")}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {fase && <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("Fase")}</span><FaseSdiBadge doc={doc} /></div>}
                {doc.sdi_identificativo && <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("Identificativo SdI")}</span><span className="font-mono text-xs">{doc.sdi_identificativo}</span></div>}
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("Trasmissione")}</span><span className="font-mono text-xs truncate">{doc.sdi_id_trasmissione}</span></div>
                {doc.sdi_data_consegna && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("Esito arrivato il")}</span>
                    <span>{new Date(doc.sdi_data_consegna).toLocaleString(intlCampo(), { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                )}
                {fase === "scartata" && motivoSdi(doc.sdi_errori) && (
                  <p className="text-xs text-destructive">{t("Motivo dello scarto: {sdi_errori}", { sdi_errori: String(motivoSdi(doc.sdi_errori) ?? "") })}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Allegati: contabili, DDT, contratti. Finché il documento si può (ri)mandare
              allo SDI, si sceglie quali partono dentro l'XML con la fattura. */}
          <Card>
            <CardContent className="pt-4 max-sm:p-3">
              <AllegatiFattura
                companyId={effectiveCompany?.id}
                madre={{ documentoFiscaleId: doc.id }}
                invioSdi={modificabile && TIPI_SDI.includes(doc.tipo) && !isProforma && !isPreventivo}
              />
              {effectiveCompany?.id && (
                <div className="mt-4 border-t pt-4">
                  <NoteInterneFattura tabella="documenti_fiscali" id={doc.id} companyId={effectiveCompany.id} valore={doc.note_interne} puoModificare chiaviDaAggiornare={["documenti-fiscali", "documento-fiscale"]} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Linked Documents */}
          {doc.documento_correlato_id && (
            <Card className="max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none">
              <CardHeader className="pb-3 max-sm:hidden"><CardTitle className="text-sm">{t("Documenti collegati")}</CardTitle></CardHeader>
              <CardContent className="max-sm:p-0">
                <Button variant="outline" size="sm" asChild className="w-full max-sm:h-8 max-sm:text-xs">
                  <Link to={`/azienda/documenti/${doc.documento_correlato_id}/dettaglio`}>
                    <ExternalLink className="h-4 w-4 mr-1" /> {t("Visualizza documento originale")}
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
