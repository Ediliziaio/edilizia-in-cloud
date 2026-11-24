import { UniformSelect } from "@/components/ui/uniform-select";
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
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
      if (colonneDoppie) setErrore(t("Non so quale usare fra queste colonne: {colonne}. Lasciane una sola e riprova.", { colonne: colonneDoppie }));
      else if (lette.length > LIMITE_RIGHE) setErrore(t("Il foglio ha {n} righe: il massimo è {massimo}.", { n: lette.length, massimo: LIMITE_RIGHE }));
      else if (senzaIntestazione) setErrore(t("Non trovo le colonne «Descrizione» e «Prezzo». Scarica il modello e riprova."));
      else if (lette.length === 0) setErrore(t("Il foglio non ha righe da caricare."));
      else { setRighe(lette); setOrigine(file.name); }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : t("Non riesco a leggere il file"));
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
    if (error) { setErrore(t("Non riesco a leggere il listino di quel contratto.")); return; }
    const lette: RigaListino[] = ((data ?? []) as Array<Omit<RigaListino, "riga" | "problema">>).map((r, i) => ({ ...r, prezzo_unitario: Number(r.prezzo_unitario), riga: i + 1, problema: null as string | null }));
    if (lette.length === 0) { setErrore(t("Quel contratto non ha voci in uso.")); return; }
    setRighe(lette);
    setOrigine(altriContratti.find((c) => c.id === daCopiare)?.nome ?? t("altro contratto"));
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
      toast.success(n === 1 ? t("1 voce caricata") : t("{n} voci caricate", { n: String(n ?? "") }));
      chiudi();
    },
    onError: () => toast.error(t("Listino non caricato: non è cambiato niente. Riprova.")),
  });

  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && chiudi()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("Carica listino")}</DialogTitle>
          <DialogDescription>{contratto.nome}</DialogDescription>
        </DialogHeader>

        {!righe ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> {t("Da un foglio Excel")}</p>
              <p className="text-xs text-muted-foreground">{t("Colonne: Descrizione, Unità, Prezzo. Facoltative: Tipo, Codice, Qualifica, Note.")}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" disabled={leggendo}>
                  <label className="cursor-pointer">
                    {leggendo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                    {t("Scegli il file")}
                    <input type="file" accept=".xlsx,.csv" aria-label={t("File del listino")} className="hidden" onChange={(e) => { void leggi(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                </Button>
                <Button size="sm" variant="outline" onClick={() => void scaricaModelloListino()}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> {t("Scarica il modello")}
                </Button>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><Copy className="h-4 w-4 text-blue-600" /> {t("Da un altro contratto")}</p>
              {altriContratti.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("Questo committente non ha altri contratti.")}</p>
              ) : (
                <>
                  <Select value={daCopiare} onValueChange={setDaCopiare}>
                    <SelectTrigger aria-label={t("Contratto da copiare")}><SelectValue placeholder={t("Scegli il contratto")} /></SelectTrigger>
                    <SelectContent>{altriContratti.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={!daCopiare || leggendo} onClick={() => void copia()}>{t("Usa questo listino")}</Button>
                </>
              )}
            </div>
            {errore && <p className="flex items-start gap-1.5 text-sm text-destructive sm:col-span-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{errore}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("Da")} <span className="font-medium text-foreground">{origine}</span>: {t(buone.length === 1 ? "{n} voce entra" : "{n} voci entrano", { n: buone.length })}
              {scartate > 0 && <span className="text-destructive">{" "}· {t("{scartate} con un problema, restano fuori", { scartate })}</span>}
              {gia.size > 0 && ` · ${t("{size} già in listino", { size: gia.size })}`}
            </p>

            {inUso > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { v: false, t: t("Aggiungi"), d: t("Le voci di adesso restano; quelle già presenti non si raddoppiano.") },
                  { v: true, t: t("Sostituisci"), d: inUso === 1
                    ? t("La voce di adesso non si potrà più scegliere. I rendiconti già fatti non cambiano; le eccezioni di prezzo dei cantieri restano sulle voci vecchie.")
                    : t("Le {n} voci di adesso non si potranno più scegliere. I rendiconti già fatti non cambiano; le eccezioni di prezzo dei cantieri restano sulle voci vecchie.", { n: inUso }) },
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
                {senzaTipo === 1
                  ? t("Una voce non ha il tipo nel foglio. Controlla la colonna Tipo: i rapportini valorizzano le ore solo con le voci di Manodopera.")
                  : t("{senzaTipo} voci non hanno il tipo nel foglio. Controlla la colonna Tipo: i rapportini valorizzano le ore solo con le voci di Manodopera.", { senzaTipo })}
              </p>
            )}

            <div className="max-h-[40vh] overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                  <tr><th className="px-2 py-1.5 font-medium">{t("Voce")}</th><th className="px-2 py-1.5 font-medium">{t("Tipo")}</th><th className="px-2 py-1.5 font-medium">{t("Unità")}</th><th className="px-2 py-1.5 text-right font-medium">{t("Prezzo")}</th><th className="px-2 py-1.5 font-medium">{t("Esito")}</th></tr>
                </thead>
                <tbody className="divide-y">
                  {righe.map((r) => (
                    <tr key={r.riga} className={cn(r.problema && "bg-red-50 dark:bg-red-950/20", gia.has(r.riga) && "text-muted-foreground")}>
                      <td className="px-2 py-1.5">{r.descrizione || "—"}{r.codice && <span className="ml-1.5 text-xs text-muted-foreground">{r.codice}</span>}</td>
                      <td className="px-2 py-1">
                        <UniformSelect
                          aria-label={r.descrizione ? t("Tipo di {voce}", { voce: r.descrizione }) : t("Tipo di riga {riga}", { riga: r.riga })}
                          value={r.tipo}
                          disabled={!!r.problema || gia.has(r.riga)}
                          onChange={(e) => cambiaTipo(r.riga, e.target.value)}
                          className={cn("rounded border bg-background px-1 py-0.5 text-xs disabled:opacity-50", r.tipoDaScegliere && "border-amber-400 bg-amber-50")}
                        >
                          {TIPI_VOCE.map((tipo) => <option key={tipo.v} value={tipo.v}>{t(tipo.label)}</option>)}
                        </UniformSelect>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{UNITA_ETICHETTA[r.unita_misura] ?? (r.unita_misura || "—")}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{/rezzo/.test(r.problema ?? "") ? "—" : euro(r.prezzo_unitario, true)}</td>
                      <td className="px-2 py-1.5 text-xs">{r.problema ? <span className="text-destructive">{t("Riga {riga}: {problema}", { riga: String(r.riga ?? ""), problema: String(r.problema ?? "") })}</span> : gia.has(r.riga) ? t("Già in listino") : t("Entra")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          {righe && <Button variant="ghost" onClick={ricomincia}>{t("Indietro")}</Button>}
          <Button variant="outline" onClick={chiudi}>{t("Annulla")}</Button>
          {righe && (
            <Button disabled={buone.length === 0 || carica.isPending} onClick={() => carica.mutate()}>
              {carica.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {sostituisci ? t("Sostituisci") : t("Carica")} {buone.length === 1 ? t("1 voce") : t("{n} voci", { n: buone.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
