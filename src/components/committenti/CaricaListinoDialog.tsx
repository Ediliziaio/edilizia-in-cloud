/**
 * Caricare il listino di un contratto: da un foglio o da un altro contratto.
 * Prima si vede riga per riga cosa entra e cosa no, poi si conferma.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { euro } from "@/lib/clienti/schedaCliente";
import {
  interpretaListino, leggiFoglio, scaricaModelloListino, vociGiaPresenti, LIMITE_RIGHE, TIPI_VOCE,
  type RigaListino, type VoceEsistente,
} from "@/lib/appalto/listinoExcel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// I tipi generati non conoscono le tabelle dell'appalto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const UNITA_ETICHETTA: Record<string, string> = { uomo_giorno: "uomo/giorno", mq: "m²", ml: "m", mc: "m³", corpo: "a corpo" };

export function CaricaListinoDialog({
  aperto, onChiudi, contratto, altriContratti, esistenti,
}: {
  aperto: boolean;
  onChiudi: () => void;
  contratto: { id: string; nome: string };
  altriContratti: Array<{ id: string; nome: string }>;
  esistenti: VoceEsistente[];
}) {
  const qc = useQueryClient();
  const [righe, setRighe] = useState<RigaListino[] | null>(null);
  const [origine, setOrigine] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [leggendo, setLeggendo] = useState(false);
  const [sostituisci, setSostituisci] = useState(false);
  const [daCopiare, setDaCopiare] = useState("");

  const ricomincia = () => { setRighe(null); setOrigine(""); setErrore(null); setSostituisci(false); setDaCopiare(""); };
  const chiudi = () => { ricomincia(); onChiudi(); };

  const leggi = async (file: File | undefined) => {
    if (!file) return;
    setErrore(null);
    setLeggendo(true);
    try {
      const { righe: lette, senzaIntestazione, colonneDoppie } = interpretaListino(await leggiFoglio(file));
      if (colonneDoppie) setErrore(`Non so quale usare fra queste colonne: ${colonneDoppie}. Lasciane una sola e riprova.`);
      else if (lette.length > LIMITE_RIGHE) setErrore(`Il foglio ha ${lette.length} righe: il massimo è ${LIMITE_RIGHE}.`);
      else if (senzaIntestazione) setErrore("Non trovo le colonne «Descrizione» e «Prezzo». Scarica il modello e riprova.");
      else if (lette.length === 0) setErrore("Il foglio non ha righe da caricare.");
      else { setRighe(lette); setOrigine(file.name); }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non riesco a leggere il file");
    } finally {
      setLeggendo(false);
    }
  };

  const copia = async () => {
    setErrore(null);
    setLeggendo(true);
    const { data, error } = await db.from("appalto_tariffe")
      .select("tipo, codice, descrizione, unita_misura, prezzo_unitario, qualifica, note, ordine")
      .eq("contratto_id", daCopiare).eq("attivo", true).order("ordine", { ascending: true });
    setLeggendo(false);
    if (error) { setErrore("Non riesco a leggere il listino di quel contratto."); return; }
    const lette: RigaListino[] = ((data ?? []) as Array<Omit<RigaListino, "riga" | "problema">>).map((r, i) => ({ ...r, prezzo_unitario: Number(r.prezzo_unitario), riga: i + 1, problema: null as string | null }));
    if (lette.length === 0) { setErrore("Quel contratto non ha voci in uso."); return; }
    setRighe(lette);
    setOrigine(altriContratti.find((c) => c.id === daCopiare)?.nome ?? "altro contratto");
  };

  const gia = useMemo(() => vociGiaPresenti(righe ?? [], esistenti, sostituisci), [righe, esistenti, sostituisci]);
  const buone = (righe ?? []).filter((r) => !r.problema && !gia.has(r.riga));
  const scartate = (righe ?? []).filter((r) => r.problema).length;
  const inUso = esistenti.filter((e) => e.attivo).length;
  const senzaTipo = buone.filter((r) => r.tipoDaScegliere).length;
  const cambiaTipo = (riga: number, tipo: string) =>
    setRighe((attuali) => (attuali ?? []).map((r) => (r.riga === riga ? { ...r, tipo, tipoDaScegliere: false } : r)));

  const carica = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("appalto_listino_carica", {
        p_contratto_id: contratto.id,
        p_sostituisci: sostituisci,
        p_righe: buone.map(({ tipo, codice, descrizione, unita_misura, prezzo_unitario, qualifica, note }) => ({ tipo, codice, descrizione, unita_misura, prezzo_unitario, qualifica, note })),
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: ["appalto-tariffe", contratto.id] });
      toast.success(n === 1 ? "1 voce caricata" : `${n} voci caricate`);
      chiudi();
    },
    onError: () => toast.error("Listino non caricato: non è cambiato niente. Riprova."),
  });

  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && chiudi()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Carica listino</DialogTitle>
          <DialogDescription>{contratto.nome}</DialogDescription>
        </DialogHeader>

        {!righe ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Da un foglio Excel</p>
              <p className="text-xs text-muted-foreground">Colonne: Descrizione, Unità, Prezzo. Facoltative: Tipo, Codice, Qualifica, Note.</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" disabled={leggendo}>
                  <label className="cursor-pointer">
                    {leggendo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                    Scegli il file
                    <input type="file" accept=".xlsx,.csv" aria-label="File del listino" className="hidden" onChange={(e) => { void leggi(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                </Button>
                <Button size="sm" variant="outline" onClick={() => void scaricaModelloListino()}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Scarica il modello
                </Button>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><Copy className="h-4 w-4 text-blue-600" /> Da un altro contratto</p>
              {altriContratti.length === 0 ? (
                <p className="text-xs text-muted-foreground">Questo committente non ha altri contratti.</p>
              ) : (
                <>
                  <Select value={daCopiare} onValueChange={setDaCopiare}>
                    <SelectTrigger aria-label="Contratto da copiare"><SelectValue placeholder="Scegli il contratto" /></SelectTrigger>
                    <SelectContent>{altriContratti.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={!daCopiare || leggendo} onClick={() => void copia()}>Usa questo listino</Button>
                </>
              )}
            </div>
            {errore && <p className="flex items-start gap-1.5 text-sm text-destructive sm:col-span-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{errore}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Da <span className="font-medium text-foreground">{origine}</span>: {buone.length} {buone.length === 1 ? "voce entra" : "voci entrano"}
              {scartate > 0 && <span className="text-destructive"> · {scartate} con un problema, restano fuori</span>}
              {gia.size > 0 && ` · ${gia.size} già in listino`}
            </p>

            {inUso > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { v: false, t: "Aggiungi", d: "Le voci di adesso restano; quelle già presenti non si raddoppiano." },
                  { v: true, t: "Sostituisci", d: `${inUso === 1 ? "La voce di adesso non si potrà" : `Le ${inUso} voci di adesso non si potranno`} più scegliere. I rendiconti già fatti non cambiano; le eccezioni di prezzo dei cantieri restano sulle voci vecchie.` },
                ].map((o) => (
                  <button key={o.t} type="button" onClick={() => setSostituisci(o.v)} aria-pressed={sostituisci === o.v}
                    className={cn("rounded-lg border p-2.5 text-left text-xs transition-colors", sostituisci === o.v ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                    <Label className="cursor-pointer text-sm font-semibold">{o.t}</Label>
                    <span className="mt-0.5 block text-muted-foreground">{o.d}</span>
                  </button>
                ))}
              </div>
            )}

            {senzaTipo > 0 && (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {senzaTipo === 1 ? "Una voce non ha" : `${senzaTipo} voci non hanno`} il tipo nel foglio. Controlla la colonna Tipo: i rapportini valorizzano le ore solo con le voci di Manodopera.
              </p>
            )}

            <div className="max-h-[40vh] overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                  <tr><th className="px-2 py-1.5 font-medium">Voce</th><th className="px-2 py-1.5 font-medium">Tipo</th><th className="px-2 py-1.5 font-medium">Unità</th><th className="px-2 py-1.5 text-right font-medium">Prezzo</th><th className="px-2 py-1.5 font-medium">Esito</th></tr>
                </thead>
                <tbody className="divide-y">
                  {righe.map((r) => (
                    <tr key={r.riga} className={cn(r.problema && "bg-red-50 dark:bg-red-950/20", gia.has(r.riga) && "text-muted-foreground")}>
                      <td className="px-2 py-1.5">{r.descrizione || "—"}{r.codice && <span className="ml-1.5 text-xs text-muted-foreground">{r.codice}</span>}</td>
                      <td className="px-2 py-1">
                        <select
                          aria-label={`Tipo di ${r.descrizione || `riga ${r.riga}`}`}
                          value={r.tipo}
                          disabled={!!r.problema || gia.has(r.riga)}
                          onChange={(e) => cambiaTipo(r.riga, e.target.value)}
                          className={cn("rounded border bg-background px-1 py-0.5 text-xs disabled:opacity-50", r.tipoDaScegliere && "border-amber-400 bg-amber-50")}
                        >
                          {TIPI_VOCE.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{UNITA_ETICHETTA[r.unita_misura] ?? (r.unita_misura || "—")}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{/rezzo/.test(r.problema ?? "") ? "—" : euro(r.prezzo_unitario, true)}</td>
                      <td className="px-2 py-1.5 text-xs">{r.problema ? <span className="text-destructive">Riga {r.riga}: {r.problema}</span> : gia.has(r.riga) ? "Già in listino" : "Entra"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          {righe && <Button variant="ghost" onClick={ricomincia}>Indietro</Button>}
          <Button variant="outline" onClick={chiudi}>Annulla</Button>
          {righe && (
            <Button disabled={buone.length === 0 || carica.isPending} onClick={() => carica.mutate()}>
              {carica.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {sostituisci ? "Sostituisci" : "Carica"} {buone.length === 1 ? "1 voce" : `${buone.length} voci`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
