/**
 * «Stato fattura elettronica» nella schermata del documento (01/10/2026).
 *
 * Un riquadro solo, al centro, sopra l'anteprima: dice a che punto è la fattura
 * verso lo SDI e dà i quattro gesti che servono — Cosa fare, Visualizza la fattura
 * elettronica, Verifica formale, Esporta XML — più Invia / Aggiorna quando
 * servono. Prima c'erano un banner, due pulsanti sparsi nella testata e nessun
 * modo di vedere l'XML come fattura o di controllarla prima di spedirla.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, FileDown, FileSearch, HelpCircle, Info, Loader2, Printer, RefreshCw, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { faseSdi, motivoSdi, puoInviare, type FaseSdi } from "@/lib/fatturazione/sdiCassetto";
import { leggiXmlFattura } from "@/lib/fatturazione/scaricaXml";
import { fatturaRicevutaHtml, type FatturaRicevutaVista } from "@/lib/fatturazione/fatturaRicevutaHtml";
import { verificaFormale, type RisultatoVerifica } from "@/lib/fatturazione/verificaFormale";
import { stampaPreventivoNativo } from "@/lib/fotovoltaico/htmlToPdf";
import type { AnagraficaAzienda, DocumentoFiscale } from "@/types/fatturazione";

interface Props {
  doc: DocumentoFiscale;
  azienda: AnagraficaAzienda | null | undefined;
  tipoLabel: string;
  onInvia?: () => void;
  isInvio?: boolean;
  onAggiorna?: () => void;
  isAggiorna?: boolean;
  onEsportaXml: () => void;
}

const TONI = {
  attesa: { riquadro: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30", testo: "text-amber-900 dark:text-amber-200" },
  lavoro: { riquadro: "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30", testo: "text-sky-900 dark:text-sky-200" },
  ok: { riquadro: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30", testo: "text-emerald-900 dark:text-emerald-200" },
  errore: { riquadro: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30", testo: "text-red-900 dark:text-red-200" },
  neutro: { riquadro: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40", testo: "text-slate-900 dark:text-slate-200" },
} as const;

const PASSI: Record<FaseSdi | "bozza", string[]> = {
  bozza: [
    "Controlla i dati con «Verifica formale»: ti dice cosa manca prima che lo scopra lo SDI.",
    "Emetti il documento: da quel momento ha il suo numero definitivo.",
    "Premi «Invia allo SDI». Dopo l'invio la fattura non si modifica più.",
  ],
  da_inviare: [
    "Controlla l'anteprima e lancia «Verifica formale».",
    "Premi «Invia allo SDI»: la firma e la trasmette openapi.it.",
    "Dopo l'invio non si modifica più. Se lo SDI la scarta potrai correggerla e rimandarla con lo stesso numero.",
  ],
  invio_in_corso: ["Non c'è niente da fare: la fattura sta partendo. Non chiudere e non rimandarla."],
  in_elaborazione: [
    "Aspetta: lo SDI controlla la fattura e di solito risponde in pochi minuti (a volte qualche ora).",
    "La pagina si aggiorna da sola; con «Aggiorna stato» chiedi subito l'esito.",
    "Non rimandarla: rischieresti un doppio invio.",
  ],
  inviata: [
    "Fatto: la fattura è stata consegnata al cliente. Non devi fare altro.",
    "Verso la Pubblica Amministrazione, dopo la consegna l'ente ha 15 giorni per accettarla o rifiutarla.",
    "Il file XML trasmesso resta qui: lo scarichi con «Esporta XML». Ricorda la conservazione a norma.",
  ],
  accettata: ["Fatto: la fattura è accettata. Registra l'incasso quando arriva il pagamento."],
  scartata: [
    "Leggi il motivo dello scarto qui sopra.",
    "Premi «Correggi»: i dati tornano modificabili, tranne numero e data.",
    "Correggi e premi «Rimanda allo SDI»: la fattura riparte con lo stesso numero.",
  ],
  rifiutata_ente: [
    "L'ente ha rifiutato la fattura: non si corregge.",
    "Emetti una nota di credito per annullarla e poi una nuova fattura corretta.",
  ],
  manuale: [
    "Scarica l'XML con «Esporta XML».",
    "Caricalo su Fatture e Corrispettivi dell'Agenzia delle Entrate. Se è verso la PA va firmato prima.",
    "Finché non lo carichi, la fattura non è stata trasmessa.",
  ],
};

export function FatturaElettronicaPannello({ doc, azienda, tipoLabel, onInvia, isInvio, onAggiorna, isAggiorna, onEsportaXml }: Props) {
  const [cosaFare, setCosaFare] = useState(false);
  const [vista, setVista] = useState<FatturaRicevutaVista | null>(null);
  const [verifica, setVerifica] = useState<RisultatoVerifica | null>(null);
  const [lavoro, setLavoro] = useState<"vista" | "verifica" | null>(null);

  const f = faseSdi(doc as never);
  const bozza = doc.stato === "bozza";
  if (!f && !bozza) return null;

  const fase: FaseSdi | "bozza" = f?.fase ?? "bozza";
  const tono = TONI[f ? f.tono : "neutro"];
  const Icona = !f ? Info : f.tono === "ok" ? CheckCircle2 : f.tono === "errore" ? XCircle : f.fase === "invio_in_corso" ? Loader2 : f.tono === "lavoro" ? Clock : Send;
  const titolo = !f ? "Bozza" : ({
    da_inviare: "Da inviare allo SDI", invio_in_corso: "Invio in corso…", in_elaborazione: "In elaborazione allo SDI",
    inviata: "Inviata", accettata: "Accettata", scartata: "Scartata dallo SDI", rifiutata_ente: "Rifiutata dall'ente", manuale: "XML da caricare a mano",
  } as Record<FaseSdi, string>)[f.fase];
  const sottotitolo = !f ? "Non è ancora stata emessa né inviata: è modificabile." : f.spiegazione;
  const motivo = f?.fase === "scartata" ? motivoSdi(doc.sdi_errori) : null;
  const erroreInvio = f?.fase === "da_inviare" ? motivoSdi(doc.sdi_errori) : null;
  const inviabile = !!f && puoInviare(doc as never) && !!onInvia;
  const scartata = f?.fase === "scartata";

  const apriVista = async () => {
    setLavoro("vista");
    try {
      const { xml } = await leggiXmlFattura(doc, azienda);
      const v = fatturaRicevutaHtml(xml, new DOMParser(), { emessa: true });
      if (!v) throw new Error("L'XML non è leggibile come fattura: lancia «Verifica formale».");
      setVista(v);
    } catch (e) {
      toast.error("Impossibile mostrare la fattura elettronica", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setLavoro(null);
    }
  };

  const apriVerifica = async () => {
    setLavoro("verifica");
    try {
      let xml: string | null = null;
      try { xml = (await leggiXmlFattura(doc, azienda)).xml; } catch { /* si controlla il resto */ }
      setVerifica(verificaFormale(doc, azienda, xml));
    } finally {
      setLavoro(null);
    }
  };

  const btn = "h-9 gap-1.5 bg-background text-xs font-medium shadow-sm max-sm:h-8";

  return (
    <>
      <section
        className={cn("mx-auto w-full max-w-4xl rounded-xl border px-4 py-4 text-center shadow-sm max-sm:px-3 max-sm:py-3", tono.riquadro, tono.testo)}
        role="status" aria-live="polite" aria-label="Stato fattura elettronica"
      >
        <div className="flex items-center justify-center gap-2">
          <Icona className={cn("h-5 w-5", f?.fase === "invio_in_corso" && "animate-spin")} aria-hidden="true" />
          <p className="text-base font-semibold max-sm:text-sm">
            <span className="font-normal opacity-80">Stato fattura elettronica: </span>{titolo}
          </p>
        </div>
        <p className="mx-auto mt-1 max-w-2xl text-sm opacity-90 max-sm:text-xs">{sottotitolo}</p>
        {motivo && <p className="mt-1 text-sm font-medium">Motivo: {motivo}</p>}
        {erroreInvio && <p className="mt-1 text-sm font-medium">Ultimo tentativo non riuscito: {erroreInvio}</p>}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" className={btn} onClick={() => setCosaFare(true)}>
            <HelpCircle className="h-4 w-4" /> Cosa fare
          </Button>
          <Button variant="outline" size="sm" className={cn(btn, "max-sm:hidden")} onClick={() => void apriVista()} disabled={lavoro === "vista"}>
            {lavoro === "vista" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />} Visualizza fattura elettronica
          </Button>
          <Button variant="outline" size="sm" className={btn} onClick={() => void apriVerifica()} disabled={lavoro === "verifica"}>
            {lavoro === "verifica" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Verifica formale
          </Button>
          <Button variant="outline" size="sm" className={cn(btn, "max-sm:hidden")} onClick={onEsportaXml}>
            <FileDown className="h-4 w-4" /> Esporta XML
          </Button>

          {f?.fase === "in_elaborazione" && onAggiorna && (
            <Button variant="outline" size="sm" className={btn} onClick={onAggiorna} disabled={isAggiorna}>
              {isAggiorna ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Aggiorna stato
            </Button>
          )}

          {inviabile && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="h-9 gap-1.5 bg-blue-600 text-xs font-medium text-white shadow-sm hover:bg-blue-700 max-sm:h-8" disabled={isInvio}>
                  {isInvio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {scartata ? "Rimanda allo SDI" : "Invia allo SDI"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{scartata ? "Rimandare la fattura corretta?" : "Inviare la fattura allo SDI?"}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {scartata
                      ? `${tipoLabel} n. ${doc.numero ?? ""} riparte con lo stesso numero e la stessa data, con i dati come sono adesso. Controlla di aver corretto il motivo dello scarto.`
                      : `${tipoLabel} n. ${doc.numero ?? ""} parte verso il Sistema di Interscambio. Dopo l'invio non si modifica più: se lo SDI la scarta, potrai correggerla e rimandarla.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={onInvia} className="bg-blue-600 hover:bg-blue-700">{scartata ? "Rimanda" : "Invia"}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </section>

      {/* Cosa fare */}
      <Dialog open={cosaFare} onOpenChange={setCosaFare}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5" /> Cosa fare adesso</DialogTitle>
            <DialogDescription>{titolo}</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm marker:font-semibold">
            {PASSI[fase].map((p) => <li key={p}>{p}</li>)}
          </ol>
        </DialogContent>
      </Dialog>

      {/* La fattura elettronica come fattura */}
      <Dialog open={!!vista} onOpenChange={(o) => { if (!o) setVista(null); }}>
        <DialogContent className="flex h-[90vh] max-w-4xl flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 flex-row items-center justify-between space-y-0 border-b px-4 py-3">
            <DialogTitle className="flex items-center gap-2 pr-8 text-sm font-medium"><FileSearch className="h-4 w-4" />{vista?.titolo}</DialogTitle>
            <Button
              variant="outline" size="sm" className="mr-6 h-8 text-xs"
              onClick={() => {
                if (!vista) return;
                stampaPreventivoNativo(vista.html, vista.titolo).catch((e: unknown) =>
                  toast.error("Impossibile preparare la stampa", { description: e instanceof Error ? e.message : undefined }));
              }}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Stampa / Salva PDF
            </Button>
          </DialogHeader>
          <DialogDescription className="sr-only">La fattura elettronica come la riceverà il cliente, letta dall'XML.</DialogDescription>
          {vista && <iframe title={vista.titolo} srcDoc={vista.html} sandbox="" className="w-full flex-1 border-0 bg-white" />}
        </DialogContent>
      </Dialog>

      {/* Verifica formale */}
      <Dialog open={!!verifica} onOpenChange={(o) => { if (!o) setVerifica(null); }}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Verifica formale</DialogTitle>
            <DialogDescription>
              {verifica && (verifica.errori === 0
                ? (verifica.avvisi === 0 ? "Tutto a posto: non risultano problemi." : `Nessun errore, ${verifica.avvisi} da guardare.`)
                : `${verifica.errori} ${verifica.errori === 1 ? "problema da correggere" : "problemi da correggere"} prima dell'invio.`)}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 text-sm">
            {verifica?.voci.map((v, i) => (
              <li key={`${i}-${v.testo}`} className="flex items-start gap-2">
                {v.esito === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="a posto" />}
                {v.esito === "avviso" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="attenzione" />}
                {v.esito === "errore" && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="errore" />}
                <span className={cn(v.esito === "errore" && "font-medium text-red-700 dark:text-red-300")}>{v.testo}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Controllo sui dati che abbiamo. Il verdetto definitivo lo dà lo SDI.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
