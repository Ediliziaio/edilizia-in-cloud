/**
 * Conteggi da un disegno CAD (DXF; il DWG si salva come DXF dal CAD).
 *   1. Il file si legge nel browser, in un Web Worker: la pagina non si
 *      blocca anche con disegni da centinaia di MB. Il file non si carica tra
 *      i documenti: si legge e basta.
 *   2. Ogni blocco (PRESA_10A, LUCE_LED…) è contato esattamente, per locale.
 *      Il simbolo di ogni blocco si sceglie una volta per l'azienda
 *      (dwg_mappa_blocchi): la volta dopo è già pronto.
 *   3. Le lunghezze: la somma delle linee dei layer scelti, in metri.
 * I conteggi entrano come bozza (metodo «dwg»): diventano materiali solo
 * quando qualcuno li conferma, come gli altri.
 */
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DisegnoCad } from "@/lib/distinta/cad/leggiDxf";
import { nomeVersione, riconosciFormato } from "@/lib/distinta/cad/leggiDxf";
import { ISTRUZIONI_DWG, leggiDisegnoCad } from "@/lib/distinta/cad/leggiDisegnoCad";
import {
  SENZA_LOCALE, UNITA_DISEGNO, contaSimboli, lunghezzePerLayer, metriPerUnita, misuraLunghezze, nomeUnita, trovaLocali,
} from "@/lib/distinta/cad/contaDisegno";
import {
  type SceltaSimbolo, type VoceMappa, righeConteggio, scelteIniziali, vociDaSalvare,
} from "@/lib/distinta/cad/mappaBlocchi";

// Tabelle e colonne nuove (migrazione 20281023040000): ancora fuori dai tipi generati.
const db = supabase as unknown as SupabaseClient;

const NESSUNO = "_nessuno";
const SENZA_FASE = "_senza";
const fmt = (n: number, d = 2) => n.toLocaleString("it-IT", { maximumFractionDigits: d });

interface Props {
  orderId: string;
  companyId: string;
  fasi: { id: string; name: string }[];
  puoScrivere: boolean;
  /** Dopo il salvataggio, per ricaricare l'elenco dei conteggi. */
  onSalvati: () => void;
}

export default function DisegnoCadPannello({ orderId, companyId, fasi, puoScrivere, onSalvati }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const annulla = useRef<(() => void) | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [avanzamento, setAvanzamento] = useState<number | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [disegno, setDisegno] = useState<DisegnoCad | null>(null);

  const [unita, setUnita] = useState<number>(4);
  const [scala, setScala] = useState("1");
  const [layerLocali, setLayerLocali] = useState<string>(NESSUNO);
  const [cerchi, setCerchi] = useState(false);
  const [scelte, setScelte] = useState<Record<string, SceltaSimbolo>>({});
  const [layerLunghezze, setLayerLunghezze] = useState<Set<string>>(new Set());
  const [nomiLunghezze, setNomiLunghezze] = useState<Record<string, string>>({});
  const [maggiorazione, setMaggiorazione] = useState("10");
  const [fase, setFase] = useState(SENZA_FASE);
  const [salvo, setSalvo] = useState(false);

  const mappa = useQuery({
    queryKey: ["dwg-mappa-blocchi", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db.from("dwg_mappa_blocchi").select("nome_blocco, simbolo, descrizione, scomposizione_id, ignora").eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as VoceMappa[];
    },
  });

  const apri = async (f: File) => {
    setFile(f); setDisegno(null); setErrore(null);
    const testa = new Uint8Array(await f.slice(0, 64).arrayBuffer());
    if (riconosciFormato(testa) === "dwg") { setErrore(ISTRUZIONI_DWG); return; }
    setAvanzamento(0);
    const lettura = leggiDisegnoCad(f, (x) => setAvanzamento(x));
    annulla.current = lettura.annulla;
    try {
      const d = await lettura.promessa;
      setDisegno(d);
      setUnita(metriPerUnita(d.insunits) ? d.insunits : 4);
      setScala("1");
      // Layer dei locali: quello con più contorni chiusi e un nome che lo dice.
      const conContorni = new Map<string, number>();
      for (const c of d.contorni) conContorni.set(c.layer, (conContorni.get(c.layer) ?? 0) + 1);
      const probabile = [...conContorni.keys()].find((l) => /LOCAL|ROOM|STANZ|AMBIENT|VANI|SPAZ/i.test(l));
      setLayerLocali(probabile ?? NESSUNO);
      setCerchi(d.blocchi.length === 0 && d.cerchi.length > 0);
      setLayerLunghezze(new Set(lunghezzePerLayer(d).map((l) => l.layer).filter((l) => /CORRUG|CAVI|CAVO|TUBO|TUBAZ|CANAL|PASSER|LINEA|DORSAL/i.test(l))));
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setAvanzamento(null);
      annulla.current = null;
    }
  };

  const metri = (metriPerUnita(unita) ?? 0.001) * (Number(scala.replace(",", ".")) || 1);
  const locali = useMemo(() => disegno ? trovaLocali(disegno, { layerLocali: layerLocali === NESSUNO ? [] : [layerLocali] }) : null, [disegno, layerLocali]);
  const simboli = useMemo(() => disegno && locali ? contaSimboli(disegno, locali, { cerchi }) : [], [disegno, locali, cerchi]);
  // Le scelte nuove (o al cambio di file) partono dalla mappa salvata o dal suggerimento.
  const scelteEffettive = useMemo(() => {
    const iniziali = scelteIniziali(simboli, mappa.data ?? []);
    for (const k of Object.keys(iniziali)) if (scelte[k]) iniziali[k] = scelte[k];
    return iniziali;
  }, [simboli, mappa.data, scelte]);
  const layerConLunghezza = useMemo(() => disegno ? lunghezzePerLayer(disegno) : [], [disegno]);
  const lunghezze = useMemo(() => disegno && locali
    ? misuraLunghezze(disegno, [...layerLunghezze], locali, { metri, maggiorazionePct: Number(maggiorazione.replace(",", ".")) || 0 })
    : [], [disegno, locali, layerLunghezze, metri, maggiorazione]);
  const righe = useMemo(() => file ? righeConteggio(simboli, scelteEffettive, lunghezze, nomiLunghezze, {
    file: file.name, unita_disegno: nomeUnita(unita), scala: Number(scala.replace(",", ".")) || 1,
    maggiorazione_pct: Number(maggiorazione.replace(",", ".")) || 0, layer_locali: layerLocali === NESSUNO ? null : layerLocali,
  }) : [], [file, simboli, scelteEffettive, lunghezze, nomiLunghezze, unita, scala, maggiorazione, layerLocali]);

  const cambia = (chiave: string, patch: Partial<SceltaSimbolo>) =>
    setScelte((s) => ({ ...s, [chiave]: { ...scelteEffettive[chiave], ...patch } }));

  const salva = async () => {
    if (!file || !righe.length) return;
    setSalvo(true);
    try {
      const voci = vociDaSalvare(Object.values(scelteEffettive).filter((s) => s.origine !== "vuoto" || s.simbolo.trim()));
      if (voci.length) {
        const { error } = await db.from("dwg_mappa_blocchi").upsert(voci.map((v) => ({ ...v, company_id: companyId })), { onConflict: "company_id,nome_blocco" });
        if (error) throw error;
      }
      const { error } = await db.from("planimetrie_conteggi").insert(righe.map((r) => ({
        company_id: companyId, order_id: orderId, phase_id: fase === SENZA_FASE ? null : fase,
        documento_id: null as string | null, documento_nome: file.name, simbolo: r.simbolo, descrizione_legenda: r.descrizione_legenda,
        locale: r.locale, quantita: r.quantita, unita: r.unita, metodo: "dwg", confidenza: 1,
        scomposizione_id: r.scomposizione_id, dettaglio: r.dettaglio,
      })));
      if (error) throw error;
      toast.success(`${righe.length} conteggi salvati come bozza`, { description: "Controllali e confermali qui sotto: solo i confermati diventano materiali." });
      mappa.refetch();
      onSalvati();
    } catch (e) {
      toast.error("Conteggi non salvati", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvo(false);
    }
  };

  const layerContorni = useMemo(() => disegno ? [...new Set(disegno.contorni.map((c) => c.layer))].sort() : [], [disegno]);
  const daContare = simboli.filter((s) => !scelteEffettive[s.chiave]?.ignora);

  return (
    <section aria-label="Disegno CAD" className="space-y-3 rounded border p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept=".dxf,.dwg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) apri(f); e.target.value = ""; }} />
        <Button size="sm" className="h-8" disabled={avanzamento !== null} onClick={() => input.current?.click()}>
          <FileUp className="mr-1.5 h-3.5 w-3.5" /> Apri un disegno DXF / DWG
        </Button>
        {file && <span className="text-xs text-slate-600">{file.name} · {fmt(file.size / 1_048_576, 1)} MB</span>}
      </div>
      <p className="text-xs text-slate-500">
        Il disegno si legge nel tuo browser, non viene caricato. I blocchi (prese, luci, rilevatori…) si contano esattamente, stanza per stanza.
        Per un DWG: nel CAD «Salva con nome» → DXF, poi apri il DXF.
      </p>

      {avanzamento !== null && (
        <div className="flex items-center gap-2" role="status">
          <Progress value={Math.round(avanzamento * 100)} className="h-2 w-64" />
          <span className="text-xs text-slate-600">Leggo il disegno… {Math.round(avanzamento * 100)}%</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => annulla.current?.()}><X className="mr-1 h-3.5 w-3.5" /> Annulla</Button>
        </div>
      )}
      {errore && <p role="alert" className="rounded bg-amber-50 p-2 text-xs text-amber-900">{errore}</p>}

      {disegno && locali && (
        <>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="text-xs text-slate-600">
              <p><strong>{nomeVersione(disegno.versione) ?? "DXF"}</strong> · {fmt(disegno.blocchi.length, 0)} blocchi · {fmt(disegno.testi.length, 0)} scritte · {disegno.layer.length} layer</p>
              {disegno.blocchi.length === 0 && (
                <p className="mt-1 text-amber-800">Nessun blocco nel disegno: è probabilmente un PDF importato nel CAD, con i simboli fatti di linee e cerchi.
                  Si possono contare i cerchi (per layer e diametro); per il resto serve il disegno originale con i blocchi.</p>
              )}
            </div>
            <label className="space-y-1 text-xs">
              <span>Unità del disegno {disegno.insunits ? `(il file dice: ${nomeUnita(disegno.insunits)})` : "(il file non la dice)"}</span>
              <div className="flex gap-1">
                <Select value={String(unita)} onValueChange={(v) => setUnita(Number(v))}>
                  <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITA_DISEGNO.map((u) => <SelectItem key={u.valore} value={String(u.valore)}>{u.etichetta}</SelectItem>)}</SelectContent>
                </Select>
                <span className="self-center">× scala</span>
                <Input className="h-8 w-20" value={scala} onChange={(e) => setScala(e.target.value)} aria-label="Scala del disegno" />
              </div>
              <span className="text-slate-500">Disegno in scala reale: 1. Tavola stampata e reimportata (es. 1:200): 200.</span>
            </label>
            <label className="space-y-1 text-xs">
              <span>Stanze</span>
              <Select value={layerLocali} onValueChange={setLayerLocali}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNO}>Nessun layer: nome del locale scritto più vicino</SelectItem>
                  {layerContorni.map((l) => <SelectItem key={l} value={l}>Contorni del layer {l}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-slate-500">
                {locali.modo === "contorni" ? `${locali.stanze.length} stanze disegnate` : locali.modo === "testo_vicino" ? `${new Set(locali.nomi.map((n) => n.s)).size} nomi di locali scritti: è una stima, controllala` : "Nessun nome di locale trovato"}
              </span>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <section aria-label="Blocchi trovati" className="rounded border p-2">
              <div className="mb-1 flex items-center justify-between">
                <h4 className="font-semibold">Simboli (conteggio esatto)</h4>
                <label className="flex items-center gap-1 text-xs"><Checkbox checked={cerchi} onCheckedChange={(v) => setCerchi(!!v)} /> conta anche i cerchi</label>
              </div>
              <p className="mb-1 text-xs text-slate-500">Scrivi una volta il simbolo di ogni blocco: l'azienda lo ricorda per i prossimi disegni.</p>
              {simboli.length ? (
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-slate-600"><tr><th className="py-1">Conta</th><th>Blocco</th><th className="text-right">N.</th><th className="pl-2">Simbolo / materiale</th></tr></thead>
                    <tbody className="divide-y">
                      {simboli.map((s) => {
                        const c = scelteEffettive[s.chiave];
                        return (
                          <tr key={s.chiave} className={c?.ignora ? "text-slate-400" : ""}>
                            <td className="py-1"><Checkbox checked={!c?.ignora} aria-label={`Conta ${s.nome}`} onCheckedChange={(v) => cambia(s.chiave, { ignora: !v })} /></td>
                            <td className="max-w-[12rem] truncate" title={`${s.nome} — layer: ${Object.keys(s.perLayer).join(", ")}`}>{s.nome}</td>
                            <td className="text-right tabular-nums">{fmt(s.quantita, 0)}</td>
                            <td className="pl-2">
                              <Input className="h-7" value={c?.simbolo ?? ""} placeholder="es. Punto presa 10/16A" disabled={c?.ignora}
                                aria-label={`Simbolo di ${s.nome}`} onChange={(e) => cambia(s.chiave, { simbolo: e.target.value })} />
                              {c?.origine === "mappa" && <span className="text-[10px] text-emerald-700">salvato per l'azienda</span>}
                              {c?.origine === "suggerito" && <span className="text-[10px] text-slate-500">suggerito dal nome</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-xs text-slate-500">Nessun simbolo da contare.</p>}
            </section>

            <section aria-label="Lunghezze" className="rounded border p-2">
              <h4 className="mb-1 font-semibold">Lunghezze (metri)</h4>
              <p className="mb-1 text-xs text-slate-500">
                È la lunghezza del percorso disegnato sul layer, convertita in metri. Non conta le risalite alle scatole né gli sfridi:
                aggiungili con la maggiorazione.
              </p>
              <label className="mb-1 flex items-center gap-2 text-xs">
                Maggiorazione per risalite e sfridi
                <Input className="h-7 w-16" value={maggiorazione} onChange={(e) => setMaggiorazione(e.target.value)} aria-label="Maggiorazione percentuale" /> %
              </label>
              <ul className="max-h-64 space-y-1 overflow-auto text-xs">
                {layerConLunghezza.slice(0, 200).map((l) => (
                  <li key={l.layer} className="flex items-center gap-2">
                    <Checkbox checked={layerLunghezze.has(l.layer)} aria-label={`Misura ${l.layer}`} onCheckedChange={(v) => {
                      const n = new Set(layerLunghezze); if (v) n.add(l.layer); else n.delete(l.layer); setLayerLunghezze(n);
                    }} />
                    <span className="min-w-0 flex-1 truncate" title={l.layer}>{l.layer}</span>
                    <span className="tabular-nums text-slate-600">{fmt(l.lunghezza * metri)} m</span>
                    {layerLunghezze.has(l.layer) && (
                      <Input className="h-7 w-40" placeholder="es. Corrugato Ø20" value={nomiLunghezze[l.layer] ?? ""} aria-label={`Materiale del layer ${l.layer}`}
                        onChange={(e) => setNomiLunghezze({ ...nomiLunghezze, [l.layer]: e.target.value })} />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section aria-label="Anteprima per locale" className="rounded border p-2">
            <h4 className="mb-1 font-semibold">Anteprima: {righe.length} conteggi da {daContare.length} simboli e {lunghezze.length} layer</h4>
            {righe.length ? (
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-600"><tr><th className="py-1">Simbolo</th><th>Locale</th><th className="text-right">Quantità</th></tr></thead>
                  <tbody className="divide-y">
                    {righe.map((r, i) => (
                      <tr key={i}><td className="py-1">{r.simbolo}</td><td>{r.locale ?? SENZA_LOCALE}</td><td className="text-right tabular-nums">{fmt(r.quantita)} {r.unita}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-xs text-slate-500">Scrivi il simbolo dei blocchi da contare o scegli un layer da misurare.</p>}
            {puoScrivere && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span>Fase dei conteggi</span>
                <Select value={fase} onValueChange={setFase}>
                  <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SENZA_FASE}>Senza fase</SelectItem>
                    {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8" disabled={!righe.length || salvo} onClick={salva}>{salvo ? "Salvo…" : "Salva i conteggi come bozza"}</Button>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
