import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatEuro } from "@/lib/computo/computoStrutturato";
import { applicaImportComputo, bozzaDaComputoStrutturato, type EsitoImportComputo } from "@/lib/computo/importaComputo";
import type { BozzaComputo } from "@/lib/computo/editorNativo";

export interface ComputoImportPrimusHandle { scegliFile: () => void }

type Letto = { esito: EsitoImportComputo; formato: "primus_pdf" | "xpwe"; nomeFile: string };

/**
 * «Importa da PriMus»: il PDF stampato o l'XPWE del progettista diventa la
 * bozza, con le righe di misura.
 *
 * Prima di toccare la bozza fa vedere cosa entra e, soprattutto, se il totale
 * ricalcolato torna con quello stampato nel documento: è il momento in cui
 * l'impresa sa se può fidarsi dell'import senza ricontrollare 200 voci.
 */
const ComputoImportPrimus = forwardRef<ComputoImportPrimusHandle, {
  bozza: BozzaComputo; onApplica: (nuova: BozzaComputo) => void; onBusy: (busy: boolean) => void;
}>(function ComputoImportPrimus({ bozza, onApplica, onBusy }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [leggendo, setLeggendo] = useState(false);
  const [letto, setLetto] = useState<Letto | null>(null);
  const [errore, setErrore] = useState("");
  useImperativeHandle(ref, () => ({ scegliFile: () => input.current?.click() }), []);

  const leggi = async (file: File) => {
    setLeggendo(true); onBusy(true); setErrore("");
    try {
      const { leggiFileComputo } = await import("@/lib/computo/leggiFileComputo");
      const c = await leggiFileComputo(file);
      setLetto({ esito: bozzaDaComputoStrutturato(c), formato: c.formato, nomeFile: file.name });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "File non leggibile.");
    } finally { setLeggendo(false); onBusy(false); }
  };

  const conferma = () => {
    if (!letto) return;
    try { onApplica(applicaImportComputo(bozza, letto.esito)); setLetto(null); }
    catch (e) { setErrore(e instanceof Error ? e.message : "Import non riuscito."); setLetto(null); }
  };

  const e = letto?.esito;
  const capitoli = e ? new Set(e.voci.map(v => v.capitolo)).size : 0;
  const misure = e ? e.voci.reduce((s, v) => s + v.misure.length, 0) : 0;
  const torna = e && e.totaleDocumento !== null && Math.abs(e.totaleDocumento - e.totaleRicalcolato) < 0.005;

  return <>
    <input ref={input} type="file" hidden aria-label="File del computo da importare" accept=".pdf,.xpwe,.dcf"
      onChange={ev => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) void leggi(f); }} />
    {leggendo && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lettura del computo…</p>}
    {errore && <div role="alert" className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <span>{errore} La bozza non è stata modificata.</span>
      <Button variant="ghost" size="sm" onClick={() => setErrore("")}>Chiudi</Button>
    </div>}
    <Dialog open={!!letto} onOpenChange={open => { if (!open) setLetto(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importa il computo</DialogTitle>
          <DialogDescription className="break-all">{letto?.nomeFile}</DialogDescription>
        </DialogHeader>
        {e && <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-3 gap-3 border-y py-3 text-center">
            <div><dt className="text-xs text-muted-foreground">Lavorazioni</dt><dd className="text-lg font-semibold tabular-nums">{e.voci.length}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Capitoli</dt><dd className="text-lg font-semibold tabular-nums">{capitoli}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Righe di misura</dt><dd className="text-lg font-semibold tabular-nums">{misure}</dd></div>
          </dl>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">Totale ricalcolato</span>
            <strong className="text-base tabular-nums">{formatEuro(e.totaleRicalcolato)} €</strong>
          </div>
          {torna && <p className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />Uguale al totale stampato nel documento, al centesimo.</p>}
          {e.totaleDocumento !== null && !torna && <div className="space-y-1 text-amber-800">
            <p className="flex items-start gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />Il documento dice {formatEuro(e.totaleDocumento)} €: differenza {formatEuro(e.totaleRicalcolato - e.totaleDocumento)} €.</p>
            {e.scostamenti.slice(0, 5).map(s => <p key={s.voce} className="pl-6 text-xs">Voce {s.voce}{s.tariffa && ` (${s.tariffa})`}: documento {s.quantitaDocumento.toLocaleString("it-IT")}, ricalcolata {s.quantitaRicalcolata.toLocaleString("it-IT")}</p>)}
          </div>}
          {e.totaleDocumento === null && <p className="text-muted-foreground">Il file non riporta un totale con cui confrontarlo.</p>}
          {e.descrizioniTroncate > 0 && letto?.formato === "primus_pdf" && <p className="flex items-start gap-2 text-amber-800"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{e.descrizioniTroncate} {e.descrizioniTroncate === 1 ? "descrizione è abbreviata" : "descrizioni sono abbreviate"} nel PDF con «...»: PriMus accorcia quelle lunghe quando stampa. Il testo intero è nel file XPWE (in PriMus: File › Esporta › XPWE).</span></p>}
          {!!bozza.voci.length && <p className="text-muted-foreground">Le lavorazioni si aggiungono in coda alle {bozza.voci.length} che ci sono già. Con «Annulla ultima modifica» si torna indietro.</p>}
        </div>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setLetto(null)}>Annulla</Button>
          <Button onClick={conferma}><FileUp className="mr-1 h-4 w-4" />Importa {e?.voci.length} lavorazioni</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
});

export default ComputoImportPrimus;
