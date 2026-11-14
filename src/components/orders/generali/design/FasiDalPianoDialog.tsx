// src/components/orders/generali/design/FasiDalPianoDialog.tsx
// «Le fasi dal piano» (lotto 6 del piano 2026-11-14-operazione-immobiliare-piano-completo).
// Propone le fasi tipiche di un cantiere con dentro le voci del piano che le appartengono e le
// date dal calendario; si controlla, si sposta una voce o si toglie una fase, poi si crea.
// Le voci diventano lavorazioni con l'importo come costo previsto (generale_fasi_dal_piano).
// La proposta sta in lib/orders/generali/fasiDalPiano.ts.
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ListPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { fasiPerIlDatabase, proponiFasi, type PropostaFasi } from "@/lib/orders/generali/fasiDalPiano";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";
import { leggiMese } from "@/lib/orders/generali/pianoExcel";
import { cn } from "@/lib/utils";
import { DialogContentOperativo as DialogContent } from "./ContestoOperativo";
import { euro, testoMese } from "../piano/formato";

const db = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riepilogo: RiepilogoGenerale;
  /** Quante fasi ha già il cantiere: quelle nuove si aggiungono dopo. */
  fasiEsistenti: number;
}

export function FasiDalPianoDialog({ open, onOpenChange, ...resto }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        {open && <Modulo onOpenChange={onOpenChange} {...resto} />}
      </DialogContent>
    </Dialog>
  );
}

const RESTA = "__resta__";

interface Riga {
  chiave: string;
  nome: string;
  inizio: string;
  fine: string;
  scelta: boolean;
}

function Modulo(p: Omit<Props, "open">) {
  const n = useGeneralePianoNumeri(p.riepilogo);
  if (n.isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Leggo il piano…</p>;
  // La proposta nasce quando il piano è letto: il modulo la prende come stato di partenza.
  return <Contenuto {...p} proposta={proponiFasi(n.voci)} />;
}

function Contenuto({ onOpenChange, riepilogo, fasiEsistenti, proposta }: Omit<Props, "open"> & { proposta: PropostaFasi }) {
  const generaleId = riepilogo.generale.id;
  const vedeCosti = riepilogo.permessi.costi;
  const qc = useQueryClient();

  const [righe, setRighe] = useState<Riga[]>(() =>
    proposta.fasi.map((f) => ({ chiave: f.chiave, nome: f.nome, inizio: testoMese(f.inizio), fine: testoMese(f.fine), scelta: f.voci.length > 0 })),
  );
  // Dove va ogni voce: la chiave di una fase o «resta sulla generale».
  const [dove, setDove] = useState<Record<string, string>>(() => Object.fromEntries([
    ...proposta.fasi.flatMap((f) => f.voci.map((v) => [v.id, f.chiave])),
    ...proposta.restano.map((v) => [v.id, RESTA]),
  ]));
  const [aperta, setAperta] = useState<string | null>(null);

  const tutte = useMemo(() => [...proposta.fasi.flatMap((f) => f.voci), ...proposta.restano], [proposta]);
  const vociDi = (chiave: string) => tutte.filter((v) => dove[v.id] === chiave);
  const somma = (voci: VocePiano[]) => voci.reduce((t, v) => t + Math.max(0, v.importo), 0);
  const scrivi = (chiave: string, campo: keyof Riga, valore: string | boolean) =>
    setRighe((rr) => rr.map((r) => (r.chiave === chiave ? { ...r, [campo]: valore } : r)));

  const scelte = righe.filter((r) => r.scelta && r.nome.trim());
  const mese = (t: string) => (t.trim() ? leggiMese(t) : null);
  const sbagliate = scelte.filter((r) => (r.inizio.trim() && !mese(r.inizio)) || (r.fine.trim() && !mese(r.fine))
    || (mese(r.inizio) && mese(r.fine) && mese(r.fine)! < mese(r.inizio)!));
  const lavorazioni = scelte.reduce((t, r) => t + vociDi(r.chiave).length, 0);
  const restano = vociDi(RESTA);

  const crea = useMutation({
    mutationFn: async () => {
      const fasi = fasiPerIlDatabase(scelte.map((r) => ({ nome: r.nome, inizio: mese(r.inizio), fine: mese(r.fine), voci: vociDi(r.chiave) })));
      const { data, error } = await db.rpc("generale_fasi_dal_piano", { p_generale_id: generaleId, p_fasi: fasi });
      if (error) {
        if (error.code === "PGRST202" || error.code === "42883") throw new Error("La funzione non è ancora attiva: serve un aggiornamento del database.");
        throw new Error(error.message);
      }
      return data as { aggiunte: number; saltate: number; voci: number; con_costi: boolean };
    },
    onSuccess: (r) => {
      const parti = [`${r.aggiunte === 1 ? "1 fase creata" : `${r.aggiunte} fasi create`} con ${r.voci === 1 ? "1 lavorazione" : `${r.voci} lavorazioni`}`];
      if (r.saltate) parti.push(`${r.saltate} già presenti, saltate`);
      toast.success(parti.join(" · "), {
        description: r.con_costi ? "Gli importi del piano sono il costo previsto delle lavorazioni." : "Senza il permesso sui costi le lavorazioni nascono senza costo previsto.",
      });
      void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(generaleId) });
      onOpenChange(false);
    },
    onError: (e) => toast.error("Fasi non create", { description: e instanceof Error ? e.message : "Riprova." }),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ListPlus className="h-4 w-4 text-primary" aria-hidden="true" /> Le fasi del cantiere dal piano</DialogTitle>
        <DialogDescription>
          Le voci di costruzione del piano diventano le lavorazioni delle fasi, con il loro importo come costo previsto.
          {proposta.finestra
            ? <> Le date dividono la costruzione del calendario ({testoMese(proposta.finestra.inizio)} – {testoMese(proposta.finestra.fine)}) nell'ordine dei lavori: si correggono qui o dopo.</>
            : " Il piano non ha i mesi della costruzione: le date si mettono qui o dopo."}
        </DialogDescription>
      </DialogHeader>

      {fasiEsistenti > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Il cantiere ha già {fasiEsistenti === 1 ? "1 fase" : `${fasiEsistenti} fasi`}: queste si aggiungono dopo, e quelle con lo stesso nome si saltano.
        </p>
      )}

      <div className="max-h-[55vh] overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-8 px-3 py-2"><span className="sr-only">Crea</span></th>
              <th className="px-2 py-2 font-medium">Fase</th>
              <th className="px-1 py-2 font-medium">Dal</th>
              <th className="px-1 py-2 font-medium">Al</th>
              <th className="px-2 py-2 text-right font-medium">Lavorazioni</th>
              {vedeCosti && <th className="px-3 py-2 text-right font-medium">Costo previsto</th>}
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => {
              const voci = vociDi(r.chiave);
              const errata = sbagliate.includes(r);
              const espansa = aperta === r.chiave;
              return (
                <Fragment key={r.chiave}>
                  <tr className={cn("border-b", !r.scelta && "text-muted-foreground", errata && "bg-destructive/5")}>
                    <td className="px-3 py-1.5">
                      <Checkbox checked={r.scelta} onCheckedChange={(v) => scrivi(r.chiave, "scelta", v === true)} aria-label={`Crea la fase ${r.nome}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={r.nome} onChange={(e) => scrivi(r.chiave, "nome", e.target.value)} className="h-8" aria-label="Nome della fase" disabled={!r.scelta} />
                    </td>
                    <td className="px-1 py-1.5">
                      <Input value={r.inizio} onChange={(e) => scrivi(r.chiave, "inizio", e.target.value)} placeholder="mm/aaaa" className="h-8 w-24" aria-label={`Dal mese, ${r.nome}`} disabled={!r.scelta} />
                    </td>
                    <td className="px-1 py-1.5">
                      <Input value={r.fine} onChange={(e) => scrivi(r.chiave, "fine", e.target.value)} placeholder="mm/aaaa" className="h-8 w-24" aria-label={`Al mese, ${r.nome}`} disabled={!r.scelta} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs tabular-nums hover:underline disabled:no-underline disabled:opacity-60"
                        onClick={() => setAperta(espansa ? null : r.chiave)}
                        aria-expanded={espansa}
                        disabled={voci.length === 0}
                      >
                        {voci.length === 0 ? "nessuna" : voci.length}
                        {voci.length > 0 && <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", espansa && "rotate-180")} aria-hidden="true" />}
                      </button>
                    </td>
                    {vedeCosti && <td className="px-3 py-1.5 text-right tabular-nums">{voci.length ? euro(somma(voci)) : "—"}</td>}
                  </tr>
                  {espansa && (
                    <tr className="border-b bg-muted/20">
                      <td />
                      <td colSpan={vedeCosti ? 5 : 4} className="px-2 py-2">
                        <ElencoVoci voci={voci} righe={righe} dove={dove} setDove={setDove} vedeCosti={vedeCosti} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {restano.length > 0 && (
        <details className="rounded-md border px-3 py-2 text-sm">
          <summary className="cursor-pointer">
            <span className="font-medium">{restano.length === 1 ? "1 costo resta" : `${restano.length} costi restano`} sulla generale, senza fase</span>
            {vedeCosti && <span className="text-muted-foreground"> · {euro(somma(restano))}</span>}
            <span className="block text-xs text-muted-foreground">Non sono un lavoro di una fase: magazzini, assicurazioni, operai su tutto il cantiere… Se uno lo è, spostalo.</span>
          </summary>
          <div className="mt-2"><ElencoVoci voci={restano} righe={righe} dove={dove} setDove={setDove} vedeCosti={vedeCosti} /></div>
        </details>
      )}

      <DialogFooter className="items-center gap-2 sm:justify-between">
        <span className={cn("text-xs text-muted-foreground", sbagliate.length > 0 && "text-destructive")} aria-live="polite">
          {sbagliate.length > 0
            ? "Una fase ha le date da correggere: scrivi il mese come 03/2027, la fine non prima dell'inizio."
            : `${scelte.length === 1 ? "1 fase" : `${scelte.length} fasi`}, ${lavorazioni === 1 ? "1 lavorazione" : `${lavorazioni} lavorazioni`}.`}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button type="button" variant="brand" disabled={scelte.length === 0 || sbagliate.length > 0 || crea.isPending} onClick={() => crea.mutate()}>
            {crea.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {scelte.length === 1 ? "Crea 1 fase" : `Crea ${scelte.length} fasi`}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function ElencoVoci({ voci, righe, dove, setDove, vedeCosti }: {
  voci: VocePiano[];
  righe: Riga[];
  dove: Record<string, string>;
  setDove: (f: (d: Record<string, string>) => Record<string, string>) => void;
  vedeCosti: boolean;
}) {
  return (
    <ul className="space-y-1">
      {voci.map((v) => (
        <li key={v.id} className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate" title={v.descrizione}>{v.descrizione}</span>
          {vedeCosti && <span className="shrink-0 tabular-nums text-muted-foreground">{euro(v.importo)}</span>}
          <select
            aria-label={`Fase di ${v.descrizione}`}
            value={dove[v.id] ?? RESTA}
            onChange={(e) => setDove((d) => ({ ...d, [v.id]: e.target.value }))}
            className="h-7 shrink-0 rounded-md border bg-background px-1.5 text-xs"
          >
            {righe.map((r) => <option key={r.chiave} value={r.chiave}>{r.nome}</option>)}
            <option value={RESTA}>Resta sulla generale</option>
          </select>
        </li>
      ))}
    </ul>
  );
}

/**
 * Nel cantiere della generale, finché non ci sono fasi: l'invito a crearle dal piano, sopra la
 * guida «Scegli le fasi» di sempre (che resta per farle a mano o da un computo).
 */
export function InvitoFasiDalPiano({ riepilogo }: { riepilogo: RiepilogoGenerale }) {
  const [aperto, setAperto] = useState(false);
  const n = useGeneralePianoNumeri(riepilogo);
  const fasi = useQuery({
    queryKey: ["generale-cantiere-fasi", riepilogo.generale.id],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("order_work_phases").select("id").eq("order_id", riepilogo.generale.id).limit(1);
      if (error) throw error;
      return data ?? [];
    },
  });
  const proposta = useMemo(() => (Array.isArray(n.voci) ? proponiFasi(n.voci) : null), [n.voci]);
  const lavori = proposta ? proposta.fasi.reduce((t, f) => t + f.voci.length, 0) : 0;
  if (!Array.isArray(fasi.data) || fasi.data.length > 0 || lavori === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-orange-200 bg-orange-50/60 px-4 py-3 text-sm dark:border-orange-500/30 dark:bg-orange-500/5">
      <ListPlus className="h-4 w-4 shrink-0 text-orange-700 dark:text-orange-300" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">Il piano economico ha già i lavori della costruzione</span>
        <span className="block text-xs text-muted-foreground">
          {lavori === 1 ? "1 voce" : `${lavori} voci`} da dividere in fasi, con le date del calendario e l'importo come costo previsto.
        </span>
      </span>
      <Button size="sm" variant="brand" onClick={() => setAperto(true)}>Proponi le fasi dal piano</Button>
      {aperto && <FasiDalPianoDialog open onOpenChange={setAperto} riepilogo={riepilogo} fasiEsistenti={0} />}
    </div>
  );
}
