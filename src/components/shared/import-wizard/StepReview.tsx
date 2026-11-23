import { useState } from "react";
import { FileSpreadsheet, CheckCircle2, AlertCircle, AlertTriangle, CalendarClock, Download, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ImportField } from "@/components/shared/CSVImportDialog";
import type { ObjectType } from "./StepStart";
import type { ImportMode } from "./StepUpload";
import type { AnteprimaImport, EsitoImportazione, PersonaScelta } from "@/lib/importazione/tipi";
import type { Programmazione } from "@/lib/importazione/programmata";
import { OpzioniImportazione, type AutomazioneScelta } from "./OpzioniImportazione";

interface StepReviewProps {
  objectType: ObjectType;
  fields: ImportField[];
  fileHeaders: string[];
  fileRows: string[][];
  mapping: Record<string, string>;
  fileName: string;
  fileSize: number;
  importMode: ImportMode;
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  isImporting: boolean;
  result: EsitoImportazione | null;
  opzioni?: {
    etichette: string[];
    onEtichetteChange: (v: string[]) => void;
    automazioni: AutomazioneScelta[];
    onAutomazioniChange: (v: AutomazioneScelta[]) => void;
    programmazione: Programmazione | null;
    onProgrammazioneChange: (p: Programmazione | null) => void;
    assegnatari?: PersonaScelta[];
    onAssegnatariChange?: (v: PersonaScelta[]) => void;
  };
  anteprima?: { dati: AnteprimaImport | null; errore: boolean } | null;
  onRiprovaAnteprima?: () => void;
  onScaricaRighe?: () => void;
  /** Annulla l'importazione appena fatta: ritorna il testo da mostrare. */
  onAnnulla?: () => Promise<string>;
}

/** «Ho sbagliato file»: sposta nel cestino quello che l'importazione ha creato. */
function AnnullaImportazione({ onAnnulla, programmata }: { onAnnulla: () => Promise<string>; programmata: boolean }) {
  const [stato, setStato] = useState<{ fase: "pronto" | "in_corso" | "fatto" | "errore"; testo?: string }>({ fase: "pronto" });
  if (stato.fase === "fatto") return <p className="rounded-md border bg-muted/40 p-3 text-sm">{stato.testo}</p>;
  return (
    <div className="space-y-1">
      <Button
        variant="outline" className="w-full" disabled={stato.fase === "in_corso"}
        onClick={async () => {
          const domanda = programmata
            ? "Annullare l'importazione? Le righe non ancora entrate non entreranno, e quello che è già entrato come nuovo va nel cestino."
            : "Annullare l'importazione? Quello che è stato creato va nel cestino. I contatti che c'erano già e sono stati solo aggiornati restano come sono.";
          if (!window.confirm(domanda)) return;
          setStato({ fase: "in_corso" });
          try {
            setStato({ fase: "fatto", testo: await onAnnulla() });
          } catch (e) {
            setStato({ fase: "errore", testo: (e as { message?: string })?.message });
          }
        }}
      >
        <Undo2 className="mr-2 h-4 w-4" /> {stato.fase === "in_corso" ? "Annullo…" : "Ho sbagliato file: annulla questa importazione"}
      </Button>
      {stato.fase === "errore" && <p className="text-xs text-destructive">Non sono riuscito ad annullarla{stato.testo ? `: ${stato.testo}` : ""}. Riprova.</p>}
      {stato.fase === "pronto" && <p className="text-xs text-muted-foreground">Si può fare anche dopo, per 7 giorni, dall'elenco.</p>}
    </div>
  );
}

/** Cosa succederà: i numeri prima di premere il pulsante. */
function Anteprima({ stato, contatti, onRiprova }: { stato: NonNullable<StepReviewProps["anteprima"]>; contatti: boolean; onRiprova?: () => void }) {
  if (stato.errore) {
    return (
      <p className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
        Non sono riuscito a calcolare l'anteprima. L'importazione funziona lo stesso.{" "}
        {onRiprova && <button type="button" className="underline" onClick={onRiprova}>Riprova</button>}
      </p>
    );
  }
  if (!stato.dati) {
    return <p className="flex items-center gap-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Controllo il file…</p>;
  }
  const a = stato.dati;
  const voci = contatti
    ? [
        { n: a.nuovi, t: "contatti nuovi", tono: "verde" },
        { n: a.aggiornati, t: "già presenti, da aggiornare", tono: "verde" },
        { n: a.saltati, t: "non trovati, verranno saltati", tono: "giallo" },
        { n: a.doppi, t: "doppi nel file, importati una volta", tono: "giallo" },
        { n: a.nonValide, t: "con un errore, non importati", tono: "rosso" },
        { n: a.senzaContatto, t: "senza email né telefono", tono: "giallo" },
      ]
    : [
        { n: a.nuovi, t: "opportunità da creare", tono: "verde" },
        { n: a.aggiornati, t: "collegate a contatti già presenti", tono: "verde" },
        { n: a.nonValide, t: "con un errore, non importate", tono: "rosso" },
        { n: a.senzaContatto, t: "senza email né telefono del contatto", tono: "giallo" },
      ];
  const colore = { verde: "text-green-700", giallo: "text-amber-700", rosso: "text-destructive" } as const;
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="mb-2 text-sm text-muted-foreground">Su {a.righe} righe del file:</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {voci.filter((v) => v.n > 0).map((v) => (
          <div key={v.t} className="rounded-md bg-background px-3 py-2">
            <p className={`text-xl font-semibold tabular-nums ${colore[v.tono as keyof typeof colore]}`}>{v.n}</p>
            <p className="text-xs text-muted-foreground">{v.t}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Elenco({ titolo, righe, tono }: { titolo: string; righe: string[]; tono: "amber" | "red" }) {
  const colori = tono === "amber"
    ? { box: "border-amber-200 bg-amber-50 text-amber-900", riga: "bg-white/70" }
    : { box: "border-destructive/30 bg-destructive/5 text-destructive", riga: "bg-white/70" };
  const Icona = tono === "amber" ? AlertTriangle : AlertCircle;
  return (
    <div className={`rounded-lg border p-4 ${colori.box}`}>
      <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Icona className="h-4 w-4" />{titolo}</p>
      <ScrollArea className="max-h-[220px]">
        <ul className="space-y-1">
          {righe.map((r, i) => <li key={i} className={`rounded px-2 py-1 text-xs ${colori.riga}`}>{r}</li>)}
        </ul>
      </ScrollArea>
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepReview({
  objectType, fields, fileHeaders, mapping, fileName, fileSize,
  importMode, consent, onConsentChange, isImporting, result, fileRows, opzioni,
  anteprima, onRiprovaAnteprima, onScaricaRighe, onAnnulla,
}: StepReviewProps) {
  const mappedEntries = fileHeaders
    .filter((h) => mapping[h])
    .map((h) => ({ header: h, field: fields.find((f) => f.key === mapping[h]) }));

  const label = objectType === "contacts" ? "contatti" : "opportunità";
  const modeLabel = importMode === "create" ? "Crea" : importMode === "update" ? "Aggiorna" : "Crea e aggiorna";

  if (isImporting) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Importazione in corso...</p>
      </div>
    );
  }

  if (result) {
    const conteggi = [
      { n: result.creati, testo: (n: number) => (n === 1 ? "nuovo" : "nuovi") },
      { n: result.aggiornati, testo: (n: number) => (n === 1 ? "aggiornato" : "aggiornati") },
      { n: result.saltati, testo: () => "saltati: non trovati" },
    ].filter((c) => (c.n ?? 0) > 0);
    const avvisi = result.avvisi ?? [];
    return (
      <div className="max-w-xl mx-auto space-y-4 py-6">
        {result.programmata ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-5 text-primary">
            <p className="flex items-center gap-2 text-base font-semibold">
              <CalendarClock className="h-5 w-5 shrink-0" /> Importazione programmata: {result.programmata.totale} {label}
            </p>
            <p className="mt-2 pl-7 text-sm text-foreground">
              {result.programmata.descrizione}.{result.programmata.fine ? <> Finisce verso <strong>{result.programmata.fine}</strong>.</> : null}
            </p>
            {(result.fatto ?? []).length > 0 && (
              <ul className="mt-2 space-y-1 pl-7 text-sm text-foreground">
                {result.fatto!.map((f, i) => <li key={i}>✓ {f}</li>)}
              </ul>
            )}
            <p className="mt-1 pl-7 text-xs text-muted-foreground">
              Va avanti da sola anche a computer spento. La segui, la metti in pausa o la annulli dall'elenco dei {label}.
            </p>
          </div>
        ) : result.success > 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-green-800 dark:bg-green-900/20 dark:text-green-400">
            <p className="flex items-center gap-2 text-base font-semibold">
              <CheckCircle2 className="h-5 w-5 shrink-0" /> Importazione completata: {result.success} {result.success === 1 ? label.replace(/i$/, "o") : label}
            </p>
            {conteggi.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 pl-7">
                {conteggi.map((c, i) => (
                  <span key={i} className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium">{c.n} {c.testo(c.n!)}</span>
                ))}
              </div>
            )}
            {(result.fatto ?? []).length > 0 && (
              <ul className="mt-3 space-y-1 pl-7 text-sm">
                {result.fatto!.map((f, i) => <li key={i}>✓ {f}</li>)}
              </ul>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-destructive">
            <p className="flex items-center gap-2 text-base font-semibold"><AlertCircle className="h-5 w-5" /> Nessuna riga importata</p>
            {(result.saltati ?? 0) > 0 && (
              <p className="mt-2 pl-7 text-sm">
                {result.saltati} {result.saltati === 1 ? "riga saltata" : "righe saltate"}: nessun contatto esistente con la stessa email o
                lo stesso telefono. Per aggiungerli come nuovi scegli «Crea e aggiorna» al passo 2.
              </p>
            )}
          </div>
        )}
        {onAnnulla && result.importazioneId && (result.success > 0 || result.programmata) && (
          <AnnullaImportazione onAnnulla={onAnnulla} programmata={!!result.programmata} />
        )}
        {(result.nonRiuscito ?? []).length > 0 && (
          <Elenco tono="amber" titolo="Da completare a mano" righe={result.nonRiuscito!} />
        )}
        {avvisi.length > 0 && (
          <Elenco tono="amber" titolo={`${avvisi.length} ${avvisi.length === 1 ? "riga non importata perché doppia" : "righe non importate perché doppie"}`} righe={avvisi} />
        )}
        {onScaricaRighe && (
          <Button variant="outline" className="w-full" onClick={onScaricaRighe}>
            <Download className="mr-2 h-4 w-4" /> Scarica le righe da correggere (Excel)
          </Button>
        )}
        {result.errors.length > 0 && (
          <Elenco tono="red" titolo={`${result.errors.length} ${result.errors.length === 1 ? "riga non importata per un errore" : "righe non importate per un errore"}`} righe={result.errors} />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {anteprima && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Cosa succederà</h3>
          <Anteprima stato={anteprima} contatti={objectType === "contacts"} onRiprova={onRiprovaAnteprima} />
        </div>
      )}

      {opzioni && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Quando e dopo l'importazione</h3>
          <OpzioniImportazione
            {...opzioni}
            opportunita={objectType !== "contacts"}
            totale={anteprima?.dati
              ? (objectType === "contacts" ? anteprima.dati.nuovi + anteprima.dati.aggiornati + anteprima.dati.saltati : anteprima.dati.nuovi)
              : fileRows.length}
          />
        </div>
      )}

      {/* Document info */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Rivedi importazione</h3>
        <div className="flex items-center gap-3 border rounded-lg p-4 bg-muted/30">
          <FileSpreadsheet className="h-8 w-8 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{fileName}</p>
            <p className="text-xs text-muted-foreground">{formatSize(fileSize)} · {fileRows.length} righe · Modalità: {modeLabel}</p>
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">
            Caricato
          </Badge>
        </div>
      </div>

      {/* Mapping summary table */}
      <div>
        <h3 className="text-sm font-semibold mb-3">
          Mappatura colonne ({mappedEntries.length} di {fileHeaders.length})
        </h3>
        <ScrollArea className="max-h-[220px]">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Colonna file</TableHead>
                  <TableHead className="text-xs">Campo destinazione</TableHead>
                  <TableHead className="text-xs">Obbligatorio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappedEntries.map(({ header, field }) => (
                  <TableRow key={header}>
                    <TableCell className="text-sm py-1.5">{header}</TableCell>
                    <TableCell className="text-sm py-1.5">{field?.label || mapping[header]}</TableCell>
                    <TableCell className="py-1.5">
                      {field?.required ? (
                        <Badge className="bg-primary/10 text-primary border-0 text-[10px]">Sì</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </div>

      {/* Consent */}
      <div className="flex items-start gap-2 border rounded-lg p-4 bg-muted/20">
        <Checkbox
          id="consent"
          checked={consent}
          onCheckedChange={(v) => onConsentChange(!!v)}
          className="mt-0.5"
        />
        <label htmlFor="consent" className="text-sm text-muted-foreground cursor-pointer leading-relaxed">
          Confermo che tutti i {label} coinvolti in questa importazione hanno acconsentito a essere contattati
          e che i dati rispettano le normative sulla privacy (GDPR).
        </label>
      </div>
    </div>
  );
}
