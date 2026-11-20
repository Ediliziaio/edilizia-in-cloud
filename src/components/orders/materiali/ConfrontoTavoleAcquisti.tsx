import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { caricaContestoPianoAcquisti } from "@/hooks/usePianoAcquistiComputo";
import { materialiEsistentiPerPiano } from "@/lib/distinta/materialiEsistentiPerPiano";
import { pianoAcquisti } from "@/lib/distinta/pianoAcquisti";
import { candidatiDaTavola, raggruppaConteggiTavola, type ConteggioTavola, type GruppoTavola } from "@/lib/distinta/confrontaTavole";
import { Button } from "@/components/ui/button";
const numero = (q: number | null | undefined) => q == null ? "Da verificare" : q.toLocaleString("it-IT", { maximumFractionDigits: 4 });
export function ConfrontoTavoleAcquisti({ companyId, orderId, conteggi, puoScrivere, onAggiornati, onGenera }: {
  companyId: string; orderId: string; conteggi: ConteggioTavola[]; puoScrivere: boolean; onAggiornati: () => void; onGenera?: () => void;
}) {
  const gruppi = useMemo(() => raggruppaConteggiTavola(conteggi), [conteggi]);
  const [gruppo, setGruppo] = useState<string | null>(null), [articoloId, setArticoloId] = useState("");
  const [conferma, setConferma] = useState(false), [salvando, setSalvando] = useState(false), [errore, setErrore] = useState("");
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["confronto-tavole-acquisti", companyId, orderId], enabled: gruppi.length > 0 && !!companyId,
    queryFn: () => caricaContestoPianoAcquisti(companyId, orderId) });
  const g = gruppi.find(g => g.chiave === gruppo);
  const esistenti = useMemo(() => query.data?.esistenti ?? [], [query.data]);
  const candidati = g ? candidatiDaTavola(g, esistenti) : [];
  const scelto = candidati.find(c => c.materiale.id === articoloId)?.materiale;
  const materiali = useMemo(() => materialiEsistentiPerPiano(esistenti), [esistenti]);
  const attuale = query.data && scelto ? pianoAcquisti(materiali, query.data).find(r => r.chiave === scelto.chiave_materiale) : null;
  const proposta = query.data && scelto && g ? pianoAcquisti(materiali.map(m => m.chiave === scelto.chiave_materiale ? { ...m, quantita_calcolata: g.quantita, quantita_netta: g.quantita } : m),
    { ...query.data, esistenti: esistenti.map(e => e.id === scelto.id ? { ...e, quantity: g.quantita, quantita_calcolata: g.quantita } : e) }).find(r => r.chiave === scelto.chiave_materiale) : null;
  const scegli = (g: GruppoTavola) => {
    setGruppo(g.chiave); setConferma(false); setErrore("");
    const esatti = candidatiDaTavola(g, esistenti).filter(c => c.esatto); setArticoloId(esatti.length === 1 ? esatti[0].materiale.id : "");
  };
  const applica = async () => {
    if (!g || !scelto || !conferma || salvando || !puoScrivere) return;
    setSalvando(true); setErrore("");
    try {
      // La quantità è ricalcolata sul server dai conteggi correnti, non da un totale del client.
      const { error } = await supabase.rpc("materiale_quantita_da_tavola" as never, { p_order: orderId, p_item: scelto.id,
        p_conteggi: g.conteggi.map(c => ({ id: c.id, versione: c.updated_at })),
        p_versione: scelto.updated_at, p_nota: `${g.documento}, pagina ${g.pagina}: ${g.nome}. Stesso articolo e ambito verificati.` } as never);
      if (error) throw error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["confronto-tavole-acquisti"] }), qc.invalidateQueries({ queryKey: ["piano-acquisti-computo"] }),
        qc.invalidateQueries({ queryKey: ["materiali-per-fase"] }), qc.invalidateQueries({ queryKey: ["order-items"] }), qc.invalidateQueries({ queryKey: ["fabbisogno-materiali"] })]);
      toast.success("Quantità aggiornata dalla tavola", { description: "Il piano ricalcola il residuo con magazzino e ordini. Gli ordini esistenti restano collegati." });
      setConferma(false); onAggiornati();
    } catch (e) { setErrore(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Aggiornamento non riuscito. Riprova."); }
    finally { setSalvando(false); }
  };
  return <section aria-label="Tavole e acquisti" className="space-y-3 rounded-xl border bg-muted/10 p-4">
    <div><h3 className="font-semibold">Usa le tavole per migliorare gli acquisti</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Confronta una tavola alla volta con i materiali della commessa. La quantità scelta sostituisce il fabbisogno della riga: computo e tavola rimangono come fonti consultabili.</p></div>
    {!gruppi.length ? <p className="text-sm text-muted-foreground">Classifica e conferma prima i conteggi da usare. I nomi anonimi dei blocchi richiedono un articolo riconoscibile.</p> : <>
      {query.isPending && <p role="status">Leggo materiali, ordini e magazzino…</p>}
      {query.isError && <p role="alert">Non riesco a verificare gli acquisti. <Button variant="link" onClick={() => void query.refetch()}>Riprova</Button></p>}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"><div className="max-h-72 space-y-1 overflow-y-auto" aria-label="Quantità dalle tavole">{gruppi.map(r => <button key={r.chiave} type="button" disabled={salvando} onClick={() => scegli(r)} aria-pressed={r.chiave === gruppo}
        className={`w-full rounded-lg border p-3 text-left text-sm ${r.chiave === gruppo ? "border-primary bg-primary/5" : "bg-background"}`}><span className="block font-medium">{r.nome} · {numero(r.quantita)} {r.unita}</span><span className="mt-1 block text-xs text-muted-foreground">{r.documento} · pagina {r.pagina}</span></button>)}</div>
        <div className="space-y-3 rounded-lg border bg-background p-3">{!g ? <p className="text-sm text-muted-foreground">Scegli un conteggio per confrontarlo con gli articoli.</p> : <>
          <label className="block text-xs font-medium">Articolo della commessa<select aria-label="Articolo da confrontare" className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={articoloId} disabled={salvando} onChange={e => { setArticoloId(e.target.value); setConferma(false); setErrore(""); }}><option value="">Scegli l’articolo corrispondente</option>{candidati.map(({ materiale: m, esatto }) => <option key={m.id} value={m.id}>{esatto ? "Suggerito · " : ""}{m.name} · {numero(m.quantity)} {m.unita_misura}</option>)}</select></label>
          {scelto && <><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-muted/40 p-3"><span className="block text-xs text-muted-foreground">Fabbisogno attuale</span><strong>{numero(scelto.quantity)} {scelto.unita_misura}</strong></div><div className="rounded-lg bg-primary/5 p-3"><span className="block text-xs text-muted-foreground">Dalla tavola</span><strong>{numero(g.quantita)} {g.unita}</strong></div></div>
            <p className="text-xs leading-5 text-muted-foreground">Già ordinato: {numero(proposta?.ordinato)} · da magazzino: {numero(proposta?.daMagazzino)}. Nuovo ordine: {numero(attuale?.nuovoOrdine)} → <strong>{numero(proposta?.nuovoOrdine)} {g.unita}</strong>.</p>
            <label className="flex items-start gap-2 rounded-lg bg-muted/30 p-3 text-xs leading-5"><input type="checkbox" className="mt-1" checked={conferma} disabled={salvando || !puoScrivere} onChange={e => setConferma(e.target.checked)} />Ho verificato che la tavola riguarda lo stesso articolo, fase e intero ambito della quantità da sostituire.</label>
            <Button disabled={!conferma || !puoScrivere || salvando || !scelto.updated_at} onClick={() => void applica()}>{salvando ? "Aggiornamento…" : "Usa questa quantità negli acquisti"}</Button></>}
          {!candidati.length && <p className="text-xs text-muted-foreground">Nessun articolo con fase e unità compatibili. Puoi generare una proposta dai conteggi confermati.</p>}
        </>}</div></div>
      {onGenera && <Button variant="outline" onClick={onGenera}>Genera materiali dai conteggi confermati</Button>}
    </>}
    {errore && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{errore}</p>}
  </section>;
}
