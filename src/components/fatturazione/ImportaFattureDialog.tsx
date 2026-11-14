/**
 * «Importa XML o PDF»: il popup che prende tanti file insieme e fa scegliere
 * cosa importare PRIMA di scrivere qualcosa.
 *
 * Prima il pulsante apriva il selettore del sistema operativo e l'anteprima
 * compariva come riquadro sotto l'intestazione: si vedevano solo i conteggi
 * («40 da importare»), non le singole fatture, e non si poteva escluderne una.
 * Su carichi da centinaia di file — com'è stato per le aziende importate a
 * novembre 2026 — quello che serve è l'elenco: numero, data, chi, quanto, e
 * una spunta.
 *
 * Quello che fa:
 *   · file trascinati o scelti dal disco, insieme, anche dentro uno zip;
 *   · ogni file letto in locale (XML, p7m firmato) o con l'AI (PDF);
 *   · le fatture già a sistema sono segnalate e lasciate fuori di default;
 *   · un file rotto diventa una riga in errore col suo motivo, e gli altri
 *     proseguono;
 *   · avanzamento mentre lavora, riepilogo alla fine.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { AlertTriangle, FileText, Loader2, Upload, X } from "lucide-react";
import {
  espandiXmlDaFiles,
  eliminaDoppioniInterni,
  riepilogoEsiti,
  descriviRiepilogo,
  type EsitoImport,
  type XmlDaImportare,
} from "@/lib/fatturazione/bulkXmlImport";
import {
  contaVoci,
  costruisciVoci,
  filtraVoci,
  ordinaVoci,
  etichettaTipoFile,
  pesoLeggibile,
  puoSpuntare,
  riconosciTipoFile,
  type GiaPresenti,
  type VoceImport,
} from "@/lib/fatturazione/importaFatture";
import { chiaveEmessa, chiaveRicevuta, errorePassaggero, inParallelo, tempoRimanente } from "@/lib/fatturazione/importMassivo";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { bytesToBase64 } from "../../../supabase/functions/_shared/base64";

type Fase = "scelta" | "lettura" | "elenco" | "importa" | "fine";

interface Props {
  aperto: boolean;
  companyId: string | null | undefined;
  partitaIvaAzienda: string | null | undefined;
  onChiudi: () => void;
  /** Finito l'import: la pagina ricarica elenchi e statistiche. */
  onImportate: () => void;
  /** Un PDF che l'AI non ha saputo leggere: si compila a mano col modulo che c'è già. */
  onPdfAMano?: (file: File) => void;
}

/**
 * Cosa c'è già a sistema, diviso in due: le fatture che hanno anche il loro
 * file e quelle registrate senza (a mano, da un gestionale, o con la sola
 * testata). Le prime non si rifanno; le seconde si importano apposta, perché
 * è così che la riga esistente riceve l'originale.
 */
async function chiaviGiaPresenti(companyId: string): Promise<GiaPresenti> {
  const conFile = new Set<string>();
  const senzaFile = new Set<string>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [ric, em] = await Promise.all([
      tutteLePagine<{ cedente_piva: string | null; cedente_cf: string | null; numero_fattura: string; data_fattura: string; xml_url: string | null }>((from, to) => db.from("fatture_ricevute")
        .select("id, cedente_piva, cedente_cf, numero_fattura, data_fattura, xml_url").eq("company_id", companyId).order("id").range(from, to)),
      tutteLePagine<{ invoice_number: string; issue_date: string; external_xml_url: string | null }>((from, to) => db.from("invoices")
        .select("id, invoice_number, issue_date, external_xml_url").eq("company_id", companyId).order("id").range(from, to)),
    ]);
    for (const r of ric) (r.xml_url ? conFile : senzaFile).add(chiaveRicevuta(r.cedente_piva || r.cedente_cf, r.numero_fattura, r.data_fattura));
    for (const e of em) (e.external_xml_url ? conFile : senzaFile).add(`E|${chiaveEmessa(e.invoice_number, e.issue_date)}`);
  } catch {
    // Senza il confronto si importa lo stesso: i doppioni li rifiuta il server.
  }
  return { conFile, senzaFile };
}

/**
 * Il guscio: tiene il popup e monta il corpo solo quando è aperto, così alla
 * chiusura lo stato (file scelti, spunte, esito) se ne va da solo e riaprendo
 * non si ritrova il carico di prima.
 */
export function ImportaFattureDialog(props: Props) {
  // Mentre legge o importa il popup non si chiude: smontarlo a metà lascerebbe
  // il lavoro a metà e chi guarda senza riepilogo. Il corpo tiene aggiornati
  // questi due riferimenti, che il guscio usa quando qualcuno prova a uscire
  // (anche dalla X, che sta dentro il corpo ma passa di qui).
  const controllo = useRef<Controllo>({ occupato: false, pulisci: () => {} });
  const annota = useCallback((c: Controllo) => { controllo.current = c; }, []);
  return (
    <Dialog open={props.aperto} onOpenChange={(o) => {
      if (o || controllo.current.occupato) return;
      controllo.current.pulisci();
      props.onChiudi();
    }}>
      {props.aperto && <CorpoImport {...props} annota={annota} />}
    </Dialog>
  );
}

/** Quello che il corpo fa sapere al guscio: se sta lavorando e come ripulire. */
interface Controllo { occupato: boolean; pulisci: () => void }

function CorpoImport({ companyId, partitaIvaAzienda, onChiudi, onImportate, onPdfAMano, annota }: Props & { annota: (c: Controllo) => void }) {
  const [file, setFile] = useState<File[]>([]);
  const [sopra, setSopra] = useState(false);
  const [fase, setFase] = useState<Fase>("scelta");
  const [voci, setVoci] = useState<VoceImport[]>([]);
  const [lette, setLette] = useState<{ fatti: number; totale: number } | null>(null);
  const [avanzamento, setAvanzamento] = useState<{ fatte: number; totale: number; inizio: number; aggiornato: number } | null>(null);
  const [esiti, setEsiti] = useState<EsitoImport[] | null>(null);
  const [cerca, setCerca] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // I PDF letti restano in memoria per nome e peso: tornare indietro e rileggere
  // non deve ripagare l'AI né lasciare un secondo file nello storage.
  const pdfLetti = useRef(new Map<string, VoceImport>());

  const aggiungi = useCallback((nuovi: File[]) => {
    if (nuovi.length === 0) return;
    setFile((prima) => {
      const visti = new Set(prima.map((f) => `${f.name}|${f.size}`));
      return [...prima, ...nuovi.filter((f) => !visti.has(`${f.name}|${f.size}`))];
    });
  }, []);

  const conto = useMemo(() => contaVoci(voci), [voci]);
  // Prima quelle da importare, poi le già presenti, in fondo quelle che non si
  // leggono: su trecento file è l'unico modo di vedere subito cosa conta.
  const inElenco = useMemo(() => ordinaVoci(filtraVoci(voci, cerca)), [voci, cerca]);
  // Quanto vale quello che si sta per importare: un carico sbagliato si vede
  // più in fretta da un totale che da trecento righe.
  const totaleIncluse = useMemo(() => voci.reduce((s, v) => (v.inclusa ? s + (v.dati?.totale ?? 0) : s), 0), [voci]);

  // ─── Lettura ──────────────────────────────────────────────────────────

  const leggiPdf = async (pdf: File[]): Promise<VoceImport[]> => {
    const out: VoceImport[] = [];
    for (const [i, f] of pdf.entries()) {
      const id = `pdf-${i}`;
      const chiaveFile = `${f.name}|${f.size}`;
      const gia = pdfLetti.current.get(chiaveFile);
      if (gia) {
        out.push({ ...gia, id });
        setLette({ fatti: i + 1, totale: pdf.length });
        continue;
      }
      if (!companyId) {
        out.push({ id, nome: f.name, origine: "pdf", dati: null, stato: "errore", inclusa: false, pdf: f, motivo: "Nessuna azienda selezionata." });
        continue;
      }
      const percorso = `${companyId}/import-fatture/${crypto.randomUUID()}.pdf`;
      try {
        const { error: errFile } = await supabase.storage.from("documenti-smart").upload(percorso, f, { contentType: "application/pdf" });
        if (errFile) throw errFile;
        const { data, error } = await supabase.functions.invoke("ai-fattura-ricevuta-ocr", {
          body: { storage_path: percorso, storage_bucket: "documenti-smart", company_id: companyId, file_name: f.name, mime_type: "application/pdf" },
        });
        if (error) throw error;
        const letto = data?.extracted;
        const numero = letto?.numero_fattura ? String(letto.numero_fattura) : "";
        const dataFattura = letto?.data_fattura ? String(letto.data_fattura) : "";
        if (!data?.ok || !numero || !dataFattura) {
          // Il file caricato per la lettura non serve più: non lo si lascia in giro.
          void supabase.storage.from("documenti-smart").remove([percorso]);
          out.push({ id, nome: f.name, origine: "pdf", dati: null, stato: "errore", inclusa: false, pdf: f,
            motivo: "L'AI non ha ricavato numero e data dal PDF: va compilato a mano." });
          continue;
        }
        const duplicata = Boolean(data?.gia_registrata);
        out.push({
          id, nome: f.name, origine: "pdf", pdf: f, stato: duplicata ? "duplicata" : "pronta", inclusa: !duplicata,
          dati: {
            numero, data: dataFattura,
            soggetto: String(letto?.cedente?.ragione_sociale ?? "—"),
            imponibile: Number(letto?.imponibile_totale ?? 0),
            iva: Number(letto?.iva_totale ?? 0),
            totale: Number(letto?.totale_documento ?? 0),
            direzione: "passiva",
          },
          // Quel che ha letto l'AI serve alla scrittura: resta attaccato alla voce.
          letturaPdf: { campi: letto as Record<string, unknown>, percorso },
        });
      } catch (e) {
        out.push({ id, nome: f.name, origine: "pdf", dati: null, stato: "errore", inclusa: false, pdf: f,
          motivo: e instanceof Error ? e.message : "Lettura del PDF non riuscita." });
      }
      const ultima = out[out.length - 1];
      if (ultima) pdfLetti.current.set(chiaveFile, ultima);
      setLette({ fatti: i + 1, totale: pdf.length });
    }
    return out;
  };

  const leggi = async () => {
    setFase("lettura");
    setLette(null);
    const pdf = file.filter((f) => riconosciTipoFile(f.name) === "pdf");
    const altri = file.filter((f) => riconosciTipoFile(f.name) !== "pdf");

    const { xml, scartati } = altri.length > 0 ? await espandiXmlDaFiles(altri) : { xml: [] as XmlDaImportare[], scartati: [] };
    const daLeggere = eliminaDoppioniInterni(xml);
    const presenti: GiaPresenti = companyId ? await chiaviGiaPresenti(companyId) : { conFile: new Set<string>(), senzaFile: new Set<string>() };
    const daXml = costruisciVoci(daLeggere, scartati, partitaIvaAzienda, presenti, new DOMParser());
    const daPdf = pdf.length > 0 ? await leggiPdf(pdf) : [];

    const tutte = [...daXml, ...daPdf];
    setVoci(tutte);
    setFase("elenco");
    if (tutte.length === 0) toast.error("Nessuna fattura trovata nei file scelti");
  };

  // ─── Importazione ─────────────────────────────────────────────────────

  const importaXml = async (v: VoceImport): Promise<EsitoImport> => {
    const f = v.xml!;
    const direzione = v.dati!.direzione === "attiva" ? "attiva" : "passiva";
    const funzione = direzione === "attiva" ? "importa-fattura-attiva-xml" : "ricevi-sdi";
    const originale = f.originale ?? f.firmato;
    const body = originale
      ? { originale_base64: bytesToBase64(originale), xml_content: f.contenuto, company_id: companyId }
      : { xml_content: f.contenuto, company_id: companyId };
    try {
      let resp = await supabase.functions.invoke(funzione, { body });
      for (let tentativo = 1; tentativo <= 2 && resp.error; tentativo++) {
        const stato = (resp.error as { context?: Response }).context?.status;
        if (!errorePassaggero(resp.error.message, stato)) break;
        await new Promise((ok) => setTimeout(ok, 1500 * tentativo));
        resp = await supabase.functions.invoke(funzione, { body });
      }
      if (resp.error) {
        let motivo = resp.error.message;
        try {
          const dettaglio = await (resp.error as { context?: Response }).context?.json?.();
          if (dettaglio?.error) motivo = dettaglio.error;
        } catch { /* resta il messaggio generico */ }
        return { nome: v.nome, stato: "errore", motivo, direzione };
      }
      if (resp.data?.duplicate && !resp.data?.completed) return { nome: v.nome, stato: "duplicata", direzione };
      if (resp.data?.duplicate || resp.data?.success) {
        return { nome: v.nome, stato: "importata", direzione, ...(resp.data.warning ? { avviso: String(resp.data.warning) } : {}) };
      }
      return { nome: v.nome, stato: "errore", motivo: resp.data?.error ?? "Fattura rifiutata dal sistema.", direzione };
    } catch (err) {
      return { nome: v.nome, stato: "errore", motivo: err instanceof Error ? err.message : "Errore imprevisto.", direzione };
    }
  };

  const importaPdf = async (v: VoceImport): Promise<EsitoImport> => {
    const letto = v.letturaPdf?.campi ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cedente = (letto.cedente ?? {}) as any;
    try {
      // Il file resta dove stanno le altre fatture da PDF (documenti-fiscali):
      // documenti-smart è solo il passaggio che serve all'AI per leggerlo.
      let bucket = "documenti-smart";
      let percorso = v.letturaPdf?.percorso ?? null;
      if (v.pdf && companyId) {
        const definitivo = `${companyId}/ricevute-pdf/${crypto.randomUUID()}.pdf`;
        const { error: errCopia } = await supabase.storage.from("documenti-fiscali").upload(definitivo, v.pdf, { contentType: "application/pdf" });
        if (!errCopia) { bucket = "documenti-fiscali"; percorso = definitivo; }
      }
      const { error } = await supabase.from("fatture_ricevute" as never).insert({
        company_id: companyId,
        numero_fattura: v.dati!.numero,
        data_fattura: v.dati!.data,
        tipo_documento: (letto.tipo_documento as string) ?? "TD01",
        cedente_ragione_sociale: cedente.ragione_sociale ?? v.dati!.soggetto,
        cedente_piva: cedente.piva ?? null,
        cedente_cf: cedente.cf ?? null,
        cedente_indirizzo: cedente.indirizzo ?? null,
        cedente_cap: cedente.cap ?? null,
        cedente_comune: cedente.comune ?? null,
        cedente_provincia: cedente.provincia ?? null,
        imponibile_totale: v.dati!.imponibile,
        iva_totale: v.dati!.iva,
        totale_documento: v.dati!.totale,
        righe: (letto.righe as unknown[]) ?? [],
        riepilogo_iva: (letto.riepilogo_iva as unknown[]) ?? [],
        cedente_paese: (cedente.paese as string) ?? "IT",
        pdf_storage_bucket: bucket,
        pdf_storage_path: percorso,
        stato: "non_letta",
      } as never);
      if (error) {
        const doppione = (error as { code?: string }).code === "23505";
        return doppione ? { nome: v.nome, stato: "duplicata", direzione: "passiva" } : { nome: v.nome, stato: "errore", motivo: error.message, direzione: "passiva" };
      }
      return { nome: v.nome, stato: "importata", direzione: "passiva" };
    } catch (err) {
      return { nome: v.nome, stato: "errore", motivo: err instanceof Error ? err.message : "Errore imprevisto.", direzione: "passiva" };
    }
  };

  const importa = async () => {
    const scelte = voci.filter((v) => v.inclusa && v.stato !== "errore");
    if (scelte.length === 0) return;
    setFase("importa");
    const inizio = Date.now();
    setAvanzamento({ fatte: 0, totale: scelte.length, inizio, aggiornato: inizio });
    const avvisaUscita = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avvisaUscita);
    let fatti: EsitoImport[];
    try {
      fatti = await inParallelo(scelte, 4, (v) => (v.origine === "pdf" ? importaPdf(v) : importaXml(v)),
        (fatte) => setAvanzamento({ fatte, totale: scelte.length, inizio, aggiornato: Date.now() }));
    } finally {
      window.removeEventListener("beforeunload", avvisaUscita);
    }
    setAvanzamento(null);
    setEsiti(fatti);
    setFase("fine");
    // Il passaggio in documenti-smart serviva solo alla lettura: finito l'import
    // non serve più a nessuno, né per le importate (il file sta in
    // documenti-fiscali) né per quelle rimaste fuori o non riuscite.
    const temporanei = [...pdfLetti.current.values()].filter((v) => v.letturaPdf).map((v) => v.letturaPdf!.percorso);
    if (temporanei.length > 0) void supabase.storage.from("documenti-smart").remove(temporanei);
    onImportate();
    const r = riepilogoEsiti(fatti);
    if (r.errori > 0) toast.warning("Importazione completata con eccezioni", { description: descriviRiepilogo(r) });
    else toast.success("Importazione completata", { description: descriviRiepilogo(r) });
  };

  /** Chiudere senza importare non deve lasciare nello storage i PDF letti. */
  const pulisciPdfNonUsati = useCallback(() => {
    if (fase === "fine") return;
    // Tutti quelli letti, anche quelli tolti dall'elenco tornando indietro.
    const percorsi = [...pdfLetti.current.values()].filter((v) => v.letturaPdf).map((v) => v.letturaPdf!.percorso);
    if (percorsi.length > 0) void supabase.storage.from("documenti-smart").remove(percorsi);
  }, [fase]);
  const chiudiEPulisci = () => { pulisciPdfNonUsati(); onChiudi(); };
  // Il guscio ha bisogno di sapere, al momento del clic, se può chiudere e
  // cosa ripulire: glielo dice questo riferimento, tenuto aggiornato qui.
  useEffect(() => {
    annota({ occupato: fase === "lettura" || fase === "importa", pulisci: pulisciPdfNonUsati });
  }, [annota, fase, pulisciPdfNonUsati]);

  // ─── Schermata ────────────────────────────────────────────────────────

  const riepilogo = esiti ? riepilogoEsiti(esiti) : null;

  return (
    <DialogContent struttura="scorrevole" ampiezza="spazio" className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importa fatture</DialogTitle>
          <DialogDescription>
            Trascina qui i file o scegli dal disco: XML, file firmati .p7m, archivi .zip e PDF. Prima di scrivere
            qualcosa vedi cosa c'è dentro e decidi quali importare.
          </DialogDescription>
        </DialogHeader>

        {(fase === "scelta" || fase === "lettura") && (
          <div className="space-y-3">
            <div
              data-testid="area-trascinamento"
              onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
              onDragLeave={() => setSopra(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSopra(false);
                aggiungi(Array.from(e.dataTransfer?.files ?? []));
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                sopra ? "border-primary bg-primary/10" : "border-muted-foreground/30 hover:border-primary/60"
              }`}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">{sopra ? "Lascia qui i file" : "Trascina qui le fatture"}</p>
              <p className="text-xs text-muted-foreground">oppure fai clic per sceglierle dal disco · XML, p7m, zip, PDF</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xml,.p7m,.zip,.pdf"
              multiple
              className="hidden"
              aria-label="Scegli i file da importare"
              onChange={(e) => { aggiungi(Array.from(e.target.files ?? [])); if (inputRef.current) inputRef.current.value = ""; }}
            />

            {file.length > 0 && (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {file.map((f) => (
                  <div key={`${f.name}-${f.size}`} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{pesoLeggibile(f.size)}</span>
                    <Badge variant="outline" className="shrink-0 text-[11px]">{etichettaTipoFile(riconosciTipoFile(f.name))}</Badge>
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                      aria-label={`Togli ${f.name}`}
                      disabled={fase === "lettura"}
                      onClick={(e) => { e.stopPropagation(); setFile((p) => p.filter((x) => x !== f)); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {file.some((f) => riconosciTipoFile(f.name) === "pdf") && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                I PDF non sono fatture elettroniche: li legge l'AI, che consuma credito, e i dati vanno controllati.
              </p>
            )}

            {fase === "lettura" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {lette ? `Lettura dei PDF ${lette.fatti} di ${lette.totale}…` : "Lettura dei file…"}
              </p>
            )}
          </div>
        )}

        {fase === "elenco" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="default">{conto.incluse} da importare</Badge>
              {conto.daCompletare > 0 && <Badge variant="secondary">{conto.daCompletare} da completare</Badge>}
              {conto.duplicate > 0 && <Badge variant="secondary">{conto.duplicate} già a sistema</Badge>}
              {conto.errori > 0 && <Badge variant="destructive">{conto.errori} {conto.errori === 1 ? "non leggibile" : "non leggibili"}</Badge>}
              {conto.incluse > 0 && (
                <span className="text-muted-foreground">
                  per {formatCurrency(totaleIncluse)} in tutto
                </span>
              )}
              {conto.importabili > 0 && (
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setVoci((p) => p.map((v) => (puoSpuntare(v) ? { ...v, inclusa: conto.incluse < conto.importabili } : v)))}
                >
                  {conto.incluse < conto.importabili ? "Spunta tutte" : "Togli tutte"}
                </Button>
              )}
            </div>

            {conto.daCompletare > 0 && (
              <p className="text-xs text-muted-foreground">
                «Da completare»: {conto.daCompletare === 1 ? "una fattura è già registrata" : `${conto.daCompletare} fatture sono già registrate`} senza
                il file. Importandole, alla riga che c'è già viene attaccato l'originale.
              </p>
            )}

            {voci.length > 8 && (
              <Input
                value={cerca}
                onChange={(e) => setCerca(e.target.value)}
                placeholder="Cerca per numero, fornitore o nome del file"
                className="h-9"
              />
            )}

            <div className="max-h-[50vh] overflow-y-auto rounded-md border">
              {inElenco.length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">Nessuna riga con «{cerca}».</p>
              )}
              {inElenco.map((v) => (
                <div key={v.id} className="flex items-start gap-3 border-b p-2 text-sm last:border-b-0">
                  <Checkbox
                    className="mt-1"
                    checked={v.inclusa}
                    disabled={!puoSpuntare(v)}
                    aria-label={`Importa ${v.nome}`}
                    onCheckedChange={(c) => setVoci((p) => p.map((x) => (x.id === v.id ? { ...x, inclusa: c === true } : x)))}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {v.dati ? `${v.dati.numero} · ${formatDateShort(v.dati.data)}` : v.nome}
                      </span>
                      {v.dati && <span className="truncate text-muted-foreground">{v.dati.soggetto}</span>}
                      {v.dati?.direzione === "attiva" && <Badge variant="outline">emessa</Badge>}
                      {v.dati?.direzione === "passiva" && <Badge variant="outline">ricevuta</Badge>}
                      {v.origine === "pdf" && <Badge variant="outline">da PDF</Badge>}
                      {v.stato === "completa" && <Badge variant="secondary">da completare</Badge>}
                      {v.stato === "duplicata" && <Badge variant="secondary">già a sistema</Badge>}
                      {v.stato === "errore" && <Badge variant="destructive">non importabile</Badge>}
                    </div>
                    {v.dati && (
                      <p className="text-xs text-muted-foreground">
                        Imponibile {formatCurrency(v.dati.imponibile)} · IVA {formatCurrency(v.dati.iva)} · Totale{" "}
                        <span className="font-medium text-foreground">{formatCurrency(v.dati.totale)}</span> · {v.nome}
                      </p>
                    )}
                    {v.motivo && (
                      <p className="text-xs text-destructive">
                        {v.motivo}
                        {v.origine === "pdf" && v.pdf && onPdfAMano && (
                          <Button variant="link" size="sm" className="h-auto px-1 py-0 text-xs"
                            onClick={() => { onPdfAMano(v.pdf!); chiudiEPulisci(); }}>
                            Inseriscila a mano
                          </Button>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {fase === "importa" && avanzamento && (
          <div className="space-y-3 py-6 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="font-medium">Importazione {avanzamento.fatte} di {avanzamento.totale}</p>
            <Progress value={Math.round((avanzamento.fatte / Math.max(1, avanzamento.totale)) * 100)} className="mx-auto h-2 w-2/3 bg-muted" />
            <p className="text-xs text-muted-foreground">
              {tempoRimanente(avanzamento.fatte, avanzamento.totale, avanzamento.aggiornato - avanzamento.inizio) ?? "Tieni aperta questa finestra fino alla fine."}
            </p>
          </div>
        )}

        {fase === "fine" && riepilogo && esiti && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">{riepilogo.importate} {riepilogo.importate === 1 ? "importata" : "importate"}</Badge>
              {riepilogo.duplicate > 0 && <Badge variant="secondary">{riepilogo.duplicate} già presenti</Badge>}
              {riepilogo.errori > 0 && <Badge variant="destructive">{riepilogo.errori} non riuscite</Badge>}
              {esiti.some((e) => e.direzione === "attiva" && e.stato !== "errore") && (
                <Badge variant="outline">{esiti.filter((e) => e.direzione === "attiva" && e.stato !== "errore").length} emesse</Badge>
              )}
              {esiti.some((e) => e.direzione === "passiva" && e.stato !== "errore") && (
                <Badge variant="outline">{esiti.filter((e) => e.direzione === "passiva" && e.stato !== "errore").length} ricevute</Badge>
              )}
            </div>
            {esiti.some((e) => e.stato === "errore" || e.avviso) && (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
                {esiti.filter((e) => e.stato === "errore" || e.avviso).map((e) => (
                  <div key={`esito-${e.nome}`} className="flex gap-2">
                    <span className="shrink-0 font-medium text-destructive">{e.nome}</span>
                    <span className="text-muted-foreground">{e.motivo || e.avviso}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {fase === "scelta" && (
            <>
              <Button variant="outline" onClick={chiudiEPulisci}>Annulla</Button>
              <Button disabled={file.length === 0} onClick={() => void leggi()}>
                Leggi {file.length > 0 ? `${file.length} file` : "i file"}
              </Button>
            </>
          )}
          {fase === "lettura" && <Button disabled>Lettura in corso…</Button>}
          {fase === "elenco" && (
            <>
              <Button variant="outline" onClick={() => setFase("scelta")}>Indietro</Button>
              <Button disabled={conto.incluse === 0} onClick={() => void importa()}>
                {conto.incluse === 0 ? "Importa" : conto.incluse === 1 ? "Importa 1 fattura" : `Importa ${conto.incluse} fatture`}
              </Button>
            </>
          )}
          {fase === "importa" && <Button disabled>Importazione in corso…</Button>}
          {fase === "fine" && <Button onClick={onChiudi}>Chiudi</Button>}
        </DialogFooter>
    </DialogContent>
  );
}
