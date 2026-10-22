/**
 * «Genera materiali dal computo e dalle tavole»: anteprima prima di salvare.
 * Mostra cosa entra (per fase), cosa è escluso e perché, gli avvisi e le voci
 * che non sanno ancora diventare materiali (con la proposta dell'AI). Il
 * capitolo del computo va nella fase proposta; l'utente la cambia o fa creare
 * la fase. Salvando, i materiali diventano righe della commessa «da ordinare».
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computoLetto, useComputiCommessa, useVociComputo } from "@/hooks/useComputoCommessa";
import { chiaviMateriali } from "@/hooks/useMaterialiPerFase";
import { generaDistinta, type ConteggioConfermato, type Scomposizione } from "@/lib/distinta/generaDistinta";
import { capitoloVoce, fasiDaCreare, propostaFasi } from "@/lib/distinta/fasiMateriali";
import { capitoliIncerti, fondiProposte, leggiSuggerimentiFase, VALORE_NUOVA, VALORE_SENZA, type SuggerimentoFase } from "@/lib/distinta/faseProposta";

const NUOVA = VALORE_NUOVA;
const SENZA = VALORE_SENZA;

async function caricaScomposizioni(companyId: string): Promise<Scomposizione[]> {
  const { data, error } = await supabase
    .from("scomposizioni_voce")
    .select("id, nome, codice_prezzario, parole_chiave, unita_misura, categoria, attiva, componenti:scomposizioni_voce_componenti(descrizione, specifiche, unita_misura, quantita_per_unita, sfrido_percentuale, categoria, article_template_id, supplier_id, ordine)")
    .eq("company_id", companyId)
    .eq("attiva", true);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    ...s,
    componenti: [...((s as { componenti?: { ordine: number }[] }).componenti ?? [])].sort((a, b) => a.ordine - b.ordine),
  })) as unknown as Scomposizione[];
}

export default function GeneraMaterialiDialog({ orderId, open, onOpenChange }: { orderId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? "";
  const qc = useQueryClient();
  const computi = useComputiCommessa(orderId, companyId);
  const letti = (computi.data ?? []).filter(computoLetto);
  const [computoId, setComputoId] = useState<string | null>(null);
  const preferito = letti.find((c) => c.stato === "contrattuale") ?? letti.find((c) => c.stato === "verificato") ?? letti[0];
  const scelto = letti.find((c) => c.id === computoId) ?? preferito;
  const voci = useVociComputo(scelto?.id, open);

  const dati = useQuery({
    queryKey: ["genera-materiali", orderId, companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const [scomposizioni, fasi, conteggi] = await Promise.all([
        caricaScomposizioni(companyId),
        supabase.from("order_work_phases").select("id, name, position").eq("order_id", orderId).order("position"),
        supabase.from("planimetrie_conteggi").select("id, simbolo, descrizione_legenda, locale, quantita, documento_id, documento_nome, scomposizione_id, phase_id")
          .eq("order_id", orderId).eq("confermato", true),
      ]);
      if (fasi.error) throw fasi.error;
      if (conteggi.error) throw conteggi.error;
      return { scomposizioni, fasi: fasi.data ?? [], conteggi: (conteggi.data ?? []) as ConteggioConfermato[] };
    },
  });

  const vociComputo = useMemo(() => voci.data ?? [], [voci.data]);
  // La proposta automatica; le scelte dell'utente la sovrascrivono capitolo per capitolo.
  const proposta = useMemo(() => {
    const iniziale: Record<string, string> = {};
    if (!dati.data) return iniziale;
    for (const [capitolo, fase] of propostaFasi(vociComputo, dati.data.fasi)) {
      iniziale[capitolo] = fase ?? (capitolo === "Senza capitolo" ? SENZA : NUOVA + capitolo);
    }
    return iniziale;
  }, [dati.data, vociComputo]);
  // I capitoli che le parole non sanno mettere in una fase: li propone l'AI
  // (fase esistente o nuova, col motivo). Resta un suggerimento modificabile;
  // se l'AI non risponde vale la proposta per parole.
  const perParole = useMemo(() => (dati.data ? propostaFasi(vociComputo, dati.data.fasi) : new Map<string, string | null>()), [dati.data, vociComputo]);
  const sicuri = useMemo(() => new Set([...perParole].filter(([, f]) => !!f).map(([c]) => c)), [perParole]);
  const incerti = useMemo(() => capitoliIncerti(vociComputo, perParole), [vociComputo, perParole]);
  const suggerimentiAI = useQuery({
    queryKey: ["genera-materiali-fasi-ai", orderId, incerti.map((c) => c.nome).join("|"), (dati.data?.fasi ?? []).map((f) => f.id).join("|")],
    enabled: open && !!dati.data && incerti.length > 0 && !!companyId,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<SuggerimentoFase[]> => {
      const { data, error } = await supabase.functions.invoke("distinta-proponi-fasi", {
        body: { company_id: companyId, order_id: orderId, capitoli: incerti.slice(0, 40) },
      });
      if (error) throw error;
      return leggiSuggerimentiFase(data, incerti.map((c) => c.nome), dati.data?.fasi ?? []);
    },
  });
  const suggerimenti = useMemo(() => suggerimentiAI.data ?? [], [suggerimentiAI.data]);
  const [scelte, setScelte] = useState<Record<string, string>>({});
  const mappa = useMemo(() => fondiProposte(proposta, suggerimenti, sicuri, scelte), [proposta, suggerimenti, sicuri, scelte]);
  const setMappa = (m: Record<string, string>) => setScelte(m);

  const faseDiCapitolo = (capitolo: string) => {
    const v = mappa[capitolo];
    return !v || v === SENZA ? null : v;
  };
  const risultato = useMemo(() => {
    if (!dati.data) return null;
    return generaDistinta({
      voci: vociComputo,
      scomposizioni: dati.data.scomposizioni,
      conteggi: dati.data.conteggi,
      faseVoce: (v) => faseDiCapitolo(capitoloVoce(v as never)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dati.data, vociComputo, mappa]);

  const nomeFase = (id: string | null) => {
    if (!id) return "Senza fase";
    if (id.startsWith(NUOVA)) return `${id.slice(NUOVA.length)} (nuova)`;
    return dati.data?.fasi.find((f) => f.id === id)?.name ?? "Fase";
  };
  const perFase = useMemo(() => {
    const m = new Map<string, NonNullable<typeof risultato>["righe"]>();
    for (const r of risultato?.righe ?? []) {
      const k = r.phase_id ?? SENZA;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [risultato]);

  const [proponendo, setProponendo] = useState(false);
  const proponiAI = async () => {
    if (!risultato?.senzaScomposizione.length) return;
    setProponendo(true);
    try {
      let create = 0;
      const voci = risultato.senzaScomposizione;
      for (let i = 0; i < voci.length; i += 12) {
        const { data, error } = await supabase.functions.invoke("distinta-proponi-scomposizioni", {
          body: {
            company_id: companyId,
            voci: voci.slice(i, i + 12).map((v) => ({ id: v.id, codice_prezzario: v.codice_prezzario, descrizione_breve: v.descrizione_breve, descrizione_estesa: v.descrizione_estesa, unita_misura: v.unita_misura })),
          },
        });
        if (error) throw error;
        create += Number((data as { create?: number })?.create ?? 0);
      }
      toast.success(`${create} scomposizioni proposte dall'AI`, { description: "Le trovi in Scomposizioni: valgono dopo l'approvazione del tecnico." });
      qc.invalidateQueries({ queryKey: ["scomposizioni"] });
    } catch (e) {
      toast.error("Proposta non riuscita", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setProponendo(false);
    }
  };

  const [salvando, setSalvando] = useState(false);
  const salva = async () => {
    if (!risultato || !scelto && !dati.data?.conteggi.length) return;
    setSalvando(true);
    try {
      // Le fasi nuove si creano prima, in fondo all'elenco, nell'ordine del computo.
      const daCreare = [...new Set(Object.values(mappa).filter((v) => v.startsWith(NUOVA)).map((v) => v.slice(NUOVA.length)))];
      const create = new Map<string, string>();
      if (daCreare.length) {
        const base = Math.max(0, ...(dati.data?.fasi ?? []).map((f) => f.position ?? 0)) + 1;
        const { data, error } = await supabase.from("order_work_phases")
          .insert(daCreare.map((name, i) => ({ company_id: companyId, order_id: orderId, name, position: base + i })))
          .select("id, name");
        if (error) throw error;
        for (const f of data ?? []) create.set(NUOVA + f.name, f.id);
      }
      const righe = risultato.righe.map((r) => ({
        ...r,
        phase_id: r.phase_id?.startsWith(NUOVA) ? create.get(r.phase_id) ?? null : r.phase_id,
      }));
      const { data, error } = await supabase.rpc("materiali_salva_generazione", {
        p_order: orderId,
        p_righe: righe as never,
        p_escluse: risultato.escluse as never,
        p_avvisi: risultato.avvisi as never,
        p_computo: scelto?.id,
      });
      if (error) throw error;
      const esito = data as { inserite: number; sostituite: number; saltate: number };
      toast.success(`${esito.inserite} materiali salvati nelle fasi`, {
        description: [esito.sostituite ? `${esito.sostituite} righe generate prima sostituite` : null,
          esito.saltate ? `${esito.saltate} già in offerta o in un ordine, lasciate com'erano` : null].filter(Boolean).join(" · ") || undefined,
      });
      qc.invalidateQueries({ queryKey: chiaviMateriali.commessa(orderId) });
      qc.invalidateQueries({ queryKey: ["order-work-phases"] });
      onOpenChange(false);
    } catch (e) {
      toast.error("Materiali non salvati", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  const capitoli = [...new Set(vociComputo.map((v) => capitoloVoce(v as never)))];
  const caricamento = computi.isLoading || voci.isLoading || dati.isLoading;
  const nienteDaLeggere = !caricamento && !letti.length && !(dati.data?.conteggi.length);
  const fasiNuove = dati.data ? fasiDaCreare(vociComputo, propostaFasi(vociComputo, dati.data.fasi)) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Genera i materiali dal computo e dalle tavole</DialogTitle>
          <DialogDescription>
            Anteprima: niente è salvato finché non premi «Salva i materiali». Le righe generate prima e non ancora ordinate vengono sostituite; quelle inserite a mano restano.
          </DialogDescription>
        </DialogHeader>

        {caricamento && <p className="text-sm text-slate-500">Leggo computo, scomposizioni e conteggi…</p>}
        {nienteDaLeggere && (
          <p className="rounded border bg-slate-50 p-3 text-sm">
            Questa commessa non ha ancora un computo letto né conteggi confermati delle tavole. Carica il computo in «Computo metrico» o conta le tavole in «Tavole e conteggi».
          </p>
        )}

        {!caricamento && risultato && (
          <div className="space-y-4 text-sm">
            {letti.length > 1 && (
              <label className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Computo</span>
                <Select value={scelto?.id} onValueChange={setComputoId}>
                  <SelectTrigger className="h-8 w-72"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {letti.map((c) => <SelectItem key={c.id} value={c.id}>{c.titolo || c.file_name} · {c.stato}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            )}

            {capitoli.length > 0 && (
              <section aria-label="Capitoli e fasi">
                <h4 className="mb-1 font-semibold">Capitolo del computo → fase della commessa</h4>
                {fasiNuove.length > 0 && !(dati.data?.fasi.length) && (
                  <p className="mb-2 text-xs text-slate-600">La commessa non ha fasi: le creo dai capitoli del computo (puoi cambiarle).</p>
                )}
                {suggerimentiAI.isFetching && <p className="mb-2 text-xs text-slate-600">L'AI sta proponendo la fase per {incerti.length} capitoli senza abbinamento sicuro…</p>}
                {suggerimentiAI.isError && <p className="mb-2 text-xs text-amber-800">Proposta dell'AI non disponibile: resta il confronto per parole, scegli tu la fase.</p>}
                <ul className="divide-y rounded border">
                  {capitoli.map((c) => {
                    const s = suggerimenti.find((x) => x.capitolo === c);
                    const nuovaAI = s?.nuova_fase && s.nuova_fase !== c ? s.nuova_fase : null;
                    return (
                      <li key={c} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <span className="block truncate">{c}</span>
                          {s && !sicuri.has(c) && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-violet-800" title="Suggerimento dell'AI: puoi cambiarlo">
                              <Sparkles className="h-3 w-3" aria-hidden />
                              AI: {s.motivo} · {Math.round(s.confidenza * 100)}%
                            </span>
                          )}
                        </div>
                        <Select value={mappa[c] ?? SENZA} onValueChange={(v) => setMappa({ ...mappa, [c]: v })}>
                          <SelectTrigger className="h-8 w-64" aria-label={`Fase per ${c}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(dati.data?.fasi ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                            {nuovaAI && <SelectItem value={NUOVA + nuovaAI}>Crea la fase «{nuovaAI}» (AI)</SelectItem>}
                            {c !== "Senza capitolo" && <SelectItem value={NUOVA + c}>Crea la fase «{c}»</SelectItem>}
                            <SelectItem value={SENZA}>Senza fase</SelectItem>
                          </SelectContent>
                        </Select>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section aria-label="Materiali che entrano">
              <h4 className="mb-1 font-semibold">Entrano {risultato.righe.length} materiali</h4>
              {perFase.map(([fase, righe]) => (
                <details key={fase} className="mb-1 rounded border" open={perFase.length <= 3}>
                  <summary className="cursor-pointer px-2 py-1.5 font-medium">{nomeFase(fase === SENZA ? null : fase)} · {righe.length}</summary>
                  <table className="w-full text-xs">
                    <tbody className="divide-y">
                      {righe.map((r) => (
                        <tr key={r.chiave}>
                          <td className="px-2 py-1">{r.descrizione}{r.specifiche ? <span className="text-slate-500"> · {r.specifiche}</span> : null}</td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                            {r.quantita_calcolata.toLocaleString("it-IT")} {r.unita_misura}
                            {r.sfrido ? <span className="text-slate-400"> (+{r.sfrido}%)</span> : null}
                          </td>
                          <td className="px-2 py-1 text-slate-500">{r.origine === "planimetria" ? "Tavola" : r.origini.length > 1 ? `${r.origini.length} voci` : "Computo"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </section>

            {risultato.avvisi.length > 0 && (
              <section aria-label="Avvisi" className="rounded border border-amber-200 bg-amber-50 p-2">
                <h4 className="mb-1 font-semibold text-amber-900">Da guardare ({risultato.avvisi.length})</h4>
                <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-amber-900">
                  {risultato.avvisi.map((a, i) => <li key={i}>{a.messaggio}</li>)}
                </ul>
                {risultato.senzaScomposizione.length > 0 && (
                  <Button size="sm" variant="outline" className="mt-2 h-8 bg-white" disabled={proponendo} onClick={proponiAI}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {proponendo ? "L'AI sta proponendo…" : `Proponi con l'AI le scomposizioni mancanti (${risultato.senzaScomposizione.length})`}
                  </Button>
                )}
              </section>
            )}

            {risultato.escluse.length > 0 && (
              <details className="rounded border">
                <summary className="cursor-pointer px-2 py-1.5 font-medium">Escluse {risultato.escluse.length} voci, e perché</summary>
                <ul className="max-h-56 divide-y overflow-auto text-xs">
                  {risultato.escluse.map((e) => (
                    <li key={e.voce_id} className="flex justify-between gap-2 px-2 py-1">
                      <span className="min-w-0 truncate">{e.codice ? `${e.codice} · ` : ""}{e.descrizione}</span>
                      <span className="shrink-0 text-slate-500">{e.motivo}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Chiudi</Button>
          <Button disabled={!risultato?.righe.length || salvando} onClick={salva}>
            {salvando ? "Salvo…" : `Salva i materiali (${risultato?.righe.length ?? 0})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
