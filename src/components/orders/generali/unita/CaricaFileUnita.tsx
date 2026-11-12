// src/components/orders/generali/unita/CaricaFileUnita.tsx
// Caricare insieme i file di tante unità (piante, visure, capitolati): ogni file si abbina da solo
// all'unità che ha la sigla nel nome, si controlla l'elenco, si carica. Un file che fallisce non
// ferma gli altri: resta nell'elenco con il motivo, e riprovando si ricarica solo lui.
import { useMemo, useRef, useState } from "react";
import { Check, FolderUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { messaggioDocumenti, useCaricaDocumentoVoce, useVociDocumentiAzienda } from "@/hooks/useGeneraleDocumenti";
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { abbinaFile, type FileAbbinato, type UnitaAbbinabile } from "@/lib/orders/generali/abbinaFile";
import { vociDelModello } from "@/lib/orders/generali/documenti";

const NESSUNA = "__nessuna__";
const chiaveFile = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

interface Riga extends FileAbbinato<File> { stato: "da_fare" | "fatto" | "errore"; errore: string | null }

export function CaricaFileUnita({ generaleId, modello, unita, onClose }: {
  generaleId: string;
  modello: ModelloGenerale;
  unita: UnitaAbbinabile[];
  onClose: () => void;
}) {
  const azienda = useVociDocumentiAzienda();
  const voci = useMemo(() => vociDelModello(modello, azienda.righe).filter((v) => v.ambito === "figlia"), [modello, azienda.righe]);
  const [voceId, setVoceId] = useState<string>("planimetria");
  const [righe, setRighe] = useState<Riga[]>([]);
  const [inCorso, setInCorso] = useState<number | null>(null);
  const carica = useCaricaDocumentoVoce(generaleId);
  const scelta = useRef<HTMLInputElement>(null);
  const voce = voci.find((v) => v.id === voceId) ?? voci[0] ?? null;
  const pronti = righe.filter((r) => r.orderId && r.stato !== "fatto");
  const senzaUnita = righe.filter((r) => !r.orderId).length;

  const conferma = async () => {
    if (!voce) return;
    const prima = righe;
    const dopo: Riga[] = [...prima];
    const falliti: string[] = [];
    let n = 0;
    for (const [i, r] of prima.entries()) {
      if (r.stato === "fatto" || !r.orderId) continue;
      n += 1;
      setInCorso(n);
      try {
        await carica.mutateAsync({ orderId: r.orderId, voce: { id: voce.id, nome: voce.nome }, file: r.file, scadenza: null });
        dopo[i] = { ...r, stato: "fatto", errore: null };
      } catch (e) {
        const messaggio = messaggioDocumenti(e, "il file");
        // Il file è arrivato ma non è stato segnato sulla voce: ricaricarlo lo doppierebbe.
        const giaDentro = e instanceof Error && e.message.startsWith("Il file è nell'archivio");
        dopo[i] = { ...r, stato: giaDentro ? "fatto" : "errore", errore: giaDentro ? e.message : messaggio };
        falliti.push(`${r.file.name}: ${giaDentro ? e.message : messaggio}`);
      }
      setRighe([...dopo]);
    }
    setInCorso(null);
    if (falliti.length > 0) {
      toast.error(falliti.length === 1 ? "Un file non è andato" : `${falliti.length} file non sono andati`, { description: falliti.slice(0, 3).join(" · ") });
      return;
    }
    toast.success(n === 1 ? "1 file caricato" : `${n} file caricati`);
    if (dopo.every((r) => r.stato === "fatto")) onClose();
  };

  return (
    <Dialog open onOpenChange={(aperta) => { if (!aperta && inCorso === null) onClose(); }}>
      <DialogContent ampiezza="spazio" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Carica i file delle unità</DialogTitle>
          <DialogDescription>Scegli più file insieme: quelli con la sigla nel nome («A1.pdf») vanno da soli sull'unità giusta.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="carica-voce">Che documenti sono</Label>
              <Select value={voce?.id} onValueChange={setVoceId}>
                <SelectTrigger id="carica-voce"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {voci.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" onClick={() => scelta.current?.click()} disabled={inCorso !== null}>
              <FolderUp className="mr-1.5 h-4 w-4" /> Scegli i file
            </Button>
            <input
              ref={scelta} type="file" multiple accept="image/*,application/pdf,.pdf" className="hidden" aria-label="Scegli i file"
              onChange={(ev) => {
                const nuovi = Array.from(ev.target.files ?? []);
                ev.target.value = "";
                setRighe((prima) => {
                  // Lo stesso file scelto due volte non si carica due volte.
                  const gia = new Set(prima.map((r) => chiaveFile(r.file)));
                  const veri = nuovi.filter((f) => !gia.has(chiaveFile(f)));
                  return [...prima, ...abbinaFile(veri, unita).map((r): Riga => ({ ...r, stato: "da_fare", errore: null }))];
                });
              }}
            />
          </div>

          {righe.length > 0 && (
            <ul className="max-h-[45vh] divide-y overflow-y-auto rounded-md border">
              {righe.map((r, i) => (
                <li key={`${r.file.name}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{r.file.name}</span>
                    {r.errore && <span className="block truncate text-xs text-destructive" title={r.errore}>{r.errore}</span>}
                  </span>
                  {r.stato === "fatto" && <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Caricato" />}
                  <Select
                    value={r.orderId ?? NESSUNA}
                    disabled={inCorso !== null || r.stato === "fatto"}
                    onValueChange={(v) => setRighe((prima) => prima.map((x, j) => (j === i ? { ...x, orderId: v === NESSUNA ? null : v } : x)))}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Unità di ${r.file.name}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NESSUNA} className="text-xs">Scegli l'unità</SelectItem>
                      {unita.map((u) => <SelectItem key={u.orderId} value={u.orderId} className="text-xs">{u.sigla}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          )}
          {senzaUnita > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {senzaUnita === 1 ? "Un file non ha un'unità: scegli la sua, o resta fuori." : `${senzaUnita} file non hanno un'unità: scegli la loro, o restano fuori.`}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose} disabled={inCorso !== null}>Annulla</Button>
          <Button onClick={() => void conferma()} disabled={pronti.length === 0 || !voce || inCorso !== null}>
            {inCorso !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {inCorso !== null ? `Carico ${inCorso} di ${pronti.length}` : pronti.length === 1 ? "Carica 1 file" : `Carica ${pronti.length} file`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
