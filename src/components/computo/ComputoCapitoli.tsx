import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Calculator, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, Pencil, Plus, Ruler, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcolaVoce, type VoceEditor } from "@/lib/computo/editorNativo";
import { formatEuro } from "@/lib/computo/computoStrutturato";
import ComputoMisure from "./ComputoMisure";

const capitoliFrequenti = ["Demolizioni e rimozioni", "Opere murarie", "Impianti elettrici", "Impianti idraulici", "Pavimenti e rivestimenti", "Serramenti", "Tinteggiature", "Sicurezza"];

const quantitaTesto = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: "always" });

/**
 * Un'unica tabella a capitoli, con indice laterale e quantità, unità e prezzi
 * modificabili nelle righe. Misure e dettagli si aprono sotto la voce.
 * Le voci senza prezzo si preparano e si salvano
 * normalmente, con un filtro per ritrovarle. Invio nel prezzo passa alla riga dopo.
 */
export default function ComputoCapitoli({ voci, capitoliVuoti, aperta, onApri, onAdd, onCapitoli, onRename, onListino, onModifica, onEliminaCapitolo, renderDettaglio, indiceLaterale = true, onAttiva }: {
  voci: VoceEditor[]; capitoliVuoti: string[];
  /** La voce aperta, se ce n'è una. */
  aperta?: string; onApri: (id: string | null) => void;
  onAdd: (capitolo: string) => void; onCapitoli: (nomi: string[]) => void;
  onRename: (prima: string, dopo: string) => void; onListino?: (capitolo?: string) => void;
  /** Quantità e prezzo scritti nella riga, senza aprire la voce. */
  onModifica: (id: string, patch: Partial<VoceEditor>) => void;
  /** Toglie il capitolo e le sue voci (si torna indietro con «Annulla ultima modifica»). */
  onEliminaCapitolo: (nome: string) => void;
  /** L'editor completo della voce aperta, disegnato dentro la sua scheda. */
  renderDettaglio?: (voce: VoceEditor, indice: number) => ReactNode;
  indiceLaterale?: boolean;
  /** Seleziona la voce nel PDF anche scrivendo nei campi rapidi, senza aprire i dettagli. */
  onAttiva?: (id: string) => void;
}) {
  const [ricerca, setRicerca] = useState("");
  const [capitoloScelto, setCapitoloScelto] = useState<string | null>(null);
  const [stato, setStato] = useState<"tutte" | "da-prezzare" | "con-misure">("tutte");
  const [misureAperte, setMisureAperte] = useState<Set<string>>(() => new Set());
  const [rigaAttiva, setRigaAttiva] = useState<string | null>(null);
  const [chiusi, setChiusi] = useState<Set<string>>(() => new Set(voci.length > 60 ? [...voci.map(v => v.capitolo.trim() || "Opere edili"), ...capitoliVuoti] : []));
  const conteggioPrecedente = useRef(voci.length);
  const [dialog, setDialog] = useState<{ originale?: string } | null>(null);
  const [daEliminare, setDaEliminare] = useState<{ nome: string; voci: number } | null>(null);
  const [nome, setNome] = useState("");
  const [errore, setErrore] = useState("");
  const capitoli = useMemo(() => {
    const gruppi = new Map<string, { voce: VoceEditor; indice: number; calcolo: ReturnType<typeof calcolaVoce> }[]>();
    voci.forEach((voce, indice) => {
      const nome = voce.capitolo.trim() || "Opere edili";
      if (!gruppi.has(nome)) gruppi.set(nome, []);
      gruppi.get(nome)!.push({ voce, indice, calcolo: calcolaVoce(voce) });
    });
    for (const nome of capitoliVuoti) if (!gruppi.has(nome)) gruppi.set(nome, []);
    return [...gruppi].map(([nome, righe]) => ({ nome, righe }));
  }, [voci, capitoliVuoti]);
  // Un computo importato con centinaia di voci si apre dall'indice dei capitoli,
  // senza costringere a scorrere tutte le lavorazioni del primo capitolo.
  useEffect(() => {
    if (conteggioPrecedente.current <= 60 && voci.length > 60) setChiusi(new Set(capitoli.map(c => c.nome)));
    conteggioPrecedente.current = voci.length;
  }, [voci.length, capitoli]);
  const capitoloAperto = voci.find(v => v.id === aperta)?.capitolo.trim() || "Opere edili";
  useEffect(() => {
    if (!aperta) return;
    const frame = requestAnimationFrame(() => document.getElementById(`computo-dettaglio-${aperta}`)?.scrollIntoView?.({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [aperta, capitoloAperto]);
  const apri = (originale?: string) => { setNome(originale ?? ""); setErrore(""); setDialog({ originale }); };
  const salvaNome = () => {
    const prossimo = nome.trim();
    if (!prossimo) { setErrore("Inserisci il nome del capitolo."); return; }
    if (capitoli.some(c => c.nome.toLocaleLowerCase("it") === prossimo.toLocaleLowerCase("it") && c.nome !== dialog?.originale)) { setErrore("Questo capitolo esiste già. Scegli un nome diverso."); return; }
    if (dialog?.originale) onRename(dialog.originale, prossimo);
    else onCapitoli([...capitoliVuoti, prossimo]);
    setCapitoloScelto(null); setRicerca(""); setChiusi(prev => { const next = new Set(prev); next.delete(prossimo); return next; });
    setDialog(null);
  };
  const elimina = (nomeCapitolo: string, quante: number) => {
    if (quante) setDaEliminare({ nome: nomeCapitolo, voci: quante });
    else onEliminaCapitolo(nomeCapitolo);
  };
  /** Invio nel prezzo: il cursore scende al prezzo della voce sotto, anche nel capitolo dopo. */
  const prezzoSotto = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const tutti = [...document.querySelectorAll<HTMLInputElement>("input[data-prezzo-voce]")];
    tutti[tutti.indexOf(e.currentTarget) + 1]?.focus();
  };
  const filtro = ricerca.trim().toLocaleLowerCase("it");
  const selezionato = (!aperta || capitoloScelto === capitoloAperto) && capitoli.some(c => c.nome === capitoloScelto) ? capitoloScelto : null;
  const daPrezzare = (voce: VoceEditor) => !voce.daQuantificare && !voce.prezzo.trim();
  const totaleCapitolo = (c: typeof capitoli[number]) => c.righe.reduce((s, r) => s + (r.calcolo.errori.length || r.voce.opzionale ? 0 : r.calcolo.importo ?? 0), 0);
  const visibili = capitoli.map((c, indice) => ({ ...c, numero: indice + 1, righeVisibili: c.righe.filter(r =>
    (r.voce.id === aperta || !filtro || c.nome.toLocaleLowerCase("it").includes(filtro) || `${r.voce.descrizione} ${r.voce.tariffa}`.toLocaleLowerCase("it").includes(filtro)) &&
    (r.voce.id === aperta || r.voce.id === rigaAttiva || stato === "tutte" || (stato === "da-prezzare" ? daPrezzare(r.voce) : r.voce.misure.length > 0))) }))
    .filter(c => (!selezionato || c.nome === selezionato) && ((!filtro && stato === "tutte") || c.righeVisibili.length || (stato === "tutte" && c.nome.toLocaleLowerCase("it").includes(filtro))));
  const scegliCapitolo = (nome: string | null) => { onApri(null); setCapitoloScelto(nome); setRicerca(""); setStato("tutte"); if (nome) setChiusi(prev => { const next = new Set(prev); next.delete(nome); return next; }); };
  const nuoveVoci = (nome: string, listino = false) => { setRicerca(""); setStato("tutte"); if (listino) onListino?.(nome); else onAdd(nome); };
  const cambiaMisure = (id: string) => setMisureAperte(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <section aria-label="Capitoli del computo" className="min-w-0">
    <div className={`grid min-w-0 items-start gap-2 ${indiceLaterale ? "xl:grid-cols-[170px_minmax(0,1fr)]" : ""}`}>
      {indiceLaterale && !!capitoli.length && <nav aria-label="Indice dei capitoli" className="hidden overflow-hidden rounded-lg border bg-white p-1 xl:sticky xl:top-24 xl:block">
        <button type="button" aria-current={!selezionato ? "page" : undefined} onClick={() => scegliCapitolo(null)} className={`flex w-full items-center justify-between gap-1 rounded px-2 py-2 text-left text-xs ${!selezionato ? "bg-slate-100 font-semibold text-slate-950" : "text-slate-600 hover:bg-slate-50"}`}><span>Tutti i capitoli</span><span className="font-normal tabular-nums text-muted-foreground">{voci.length}</span></button>
        <div className="max-h-[calc(100dvh-22rem)] overflow-y-auto">{capitoli.map((c, n) => <button key={c.nome} type="button" aria-current={selezionato === c.nome ? "page" : undefined} onClick={() => scegliCapitolo(c.nome)} className={`flex w-full items-start gap-2 rounded px-2 py-2 text-left ${selezionato === c.nome ? "bg-blue-50 text-blue-950" : "hover:bg-slate-50"}`}>
          <span className="pt-0.5 text-[10px] tabular-nums text-slate-400">{String(n + 1).padStart(2, "0")}</span>
          <span className="min-w-0 flex-1"><span className="line-clamp-2 text-[11px] font-medium leading-4" title={c.nome}>{c.nome}</span><span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground">{c.righe.length} {c.righe.length === 1 ? "voce" : "voci"} · {formatEuro(totaleCapitolo(c))} €</span></span>
        </button>)}</div>
      </nav>}
      <div className={`min-w-0 space-y-2 ${!capitoli.length ? "xl:col-span-2" : ""}`}>
        {!indiceLaterale && !!capitoli.length && <Select value={selezionato ?? "__tutti__"} onValueChange={value => scegliCapitolo(value === "__tutti__" ? null : value)}>
          <SelectTrigger aria-label="Capitolo da visualizzare" className="h-8 max-w-sm bg-white text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__tutti__">Tutti i capitoli · {voci.length} voci</SelectItem>{capitoli.map((c, n) => <SelectItem key={c.nome} value={c.nome}>{String(n + 1).padStart(2, "0")} · {c.nome}</SelectItem>)}</SelectContent>
        </Select>}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative min-w-[160px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input aria-label="Cerca lavorazioni" placeholder="Cerca una voce, un capitolo o un codice…" className="h-8 bg-white pl-8 text-xs" value={ricerca} onChange={e => { setRicerca(e.target.value); setChiusi(new Set()); }} /></div>
          <div role="group" aria-label="Filtra lavorazioni" className="flex items-center gap-0.5">
            {([["tutte", "Tutte", null], ["da-prezzare", "Da prezzare", voci.filter(daPrezzare).length], ["con-misure", "Con misure", voci.filter(v => v.misure.length).length]] as const).map(([id, label, count]) => <button key={id} type="button" aria-label={count == null ? label : `${label} ${count}`} aria-pressed={stato === id} onClick={() => { setStato(id); setChiusi(new Set()); }} className={`inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs ${stato === id ? "bg-slate-800 font-medium text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}{count != null && <span className={stato === id ? "text-slate-200" : "text-slate-400"}>{count}</span>}</button>)}
          </div>
          {!!capitoli.length && <Button variant="ghost" size="icon" className="h-8 w-8" title={chiusi.size ? "Espandi tutti i capitoli" : "Comprimi tutti i capitoli"} aria-label={chiusi.size ? "Espandi tutti i capitoli" : "Comprimi tutti i capitoli"} onClick={() => setChiusi(chiusi.size ? new Set() : new Set(capitoli.map(c => c.nome)))}>{chiusi.size ? <ChevronsDown className="h-3.5 w-3.5" /> : <ChevronsUp className="h-3.5 w-3.5" />}</Button>}
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" disabled={capitoli.length >= 200} onClick={() => apri()}><Plus className="h-3.5 w-3.5" />Aggiungi capitolo</Button>
          <Select value="" disabled={capitoli.length >= 200} onValueChange={value => {
            if (!value || capitoli.some(c => c.nome.toLocaleLowerCase("it") === value.toLocaleLowerCase("it"))) return;
            onCapitoli([...capitoliVuoti, value]); setCapitoloScelto(null); setRicerca(""); setStato("tutte"); setChiusi(prev => { const next = new Set(prev); next.delete(value); return next; });
          }}><SelectTrigger aria-label="Capitoli frequenti" className="h-8 w-32 bg-white text-xs"><SelectValue placeholder="Capitolo rapido" /></SelectTrigger><SelectContent>{capitoliFrequenti.map(n => <SelectItem key={n} value={n} disabled={capitoli.some(c => c.nome.toLocaleLowerCase("it") === n.toLocaleLowerCase("it"))}>{n}</SelectItem>)}</SelectContent></Select>
          {onListino && <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => onListino(selezionato ?? undefined)}><Search className="h-3.5 w-3.5" />Cerca nei listini</Button>}
        </div>
        {!!selezionato && <button type="button" onClick={() => scegliCapitolo(null)} className="text-xs text-blue-700 xl:hidden">Tutti i capitoli · {selezionato} ×</button>}
        {!capitoli.length && <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-white p-5 text-center">
          <Calculator className="h-6 w-6 text-slate-400" /><h3 className="text-sm font-semibold">Costruisci il computo</h3>
          <div className="flex flex-wrap justify-center gap-2"><Button size="sm" onClick={() => apri()}><Plus className="mr-1 h-4 w-4" />Crea il primo capitolo</Button><Button size="sm" variant="outline" onClick={() => onListino ? onListino() : onAdd("Opere edili")}>Aggiungi lavorazione</Button></div>
          <p className="text-xs text-muted-foreground">Puoi preparare le voci anche senza prezzo e completarlo dopo.</p>
        </div>}
        {!!capitoli.length && <div aria-label="Elenco dei capitoli" role="region" tabIndex={0} className="overflow-x-auto rounded-lg border bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
          <table className="w-full min-w-[650px] table-fixed border-collapse text-xs">
            <caption className="sr-only">Lavorazioni del computo, raggruppate per capitolo. Quantità e prezzi si modificano nelle righe.</caption>
            <colgroup><col /><col className="w-[76px]" /><col className="w-[58px]" /><col className="w-[96px]" /><col className="w-[110px]" /><col className="w-[34px]" /></colgroup>
            <thead className="bg-slate-50 text-[11px] font-medium text-slate-500"><tr><th scope="col" className="px-3 py-2 text-left font-medium">Voce / lavorazione</th><th scope="col" className="px-2 py-2 text-right font-medium">Quantità</th><th scope="col" className="px-2 py-2 text-left font-medium">U.M.</th><th scope="col" className="px-2 py-2 text-right font-medium">Prezzo unit. €</th><th scope="col" className="px-2 py-2 text-right font-medium">Importo €</th><th scope="col"><span className="sr-only">Misure</span></th></tr></thead>
            {visibili.map(c => {
              const contieneAperta = c.righe.some(r => r.voce.id === aperta);
              const apertoCapitolo = contieneAperta || !chiusi.has(c.nome);
              const parziale = c.righe.some(r => r.calcolo.errori.length);
              return <tbody key={c.nome} className="border-t border-slate-200">
                <tr className="bg-slate-50/90"><th colSpan={6} scope="rowgroup" className="px-2 py-1 font-normal">
                  <div className="flex min-h-7 items-center gap-1.5">
                    <button type="button" className="flex h-7 w-6 shrink-0 items-center justify-center rounded hover:bg-slate-200" aria-label={`${apertoCapitolo ? "Chiudi" : "Apri"} capitolo ${c.nome}`} aria-expanded={apertoCapitolo} onClick={() => { if (contieneAperta) onApri(null); setChiusi(prev => { const next = new Set(prev); if (apertoCapitolo) next.add(c.nome); else next.delete(c.nome); return next; }); }}>{apertoCapitolo ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
                    <span className="text-[10px] tabular-nums text-slate-400">{String(c.numero).padStart(2, "0")}</span><h4 className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold" title={c.nome}>{c.nome}</h4>
                    <span className="shrink-0 text-[10px] font-normal text-slate-500">{c.righe.length} {c.righe.length === 1 ? "voce" : "voci"}</span>
                    {parziale && <span className="text-[10px] text-amber-700">Parziale</span>}
                    <strong className="min-w-[85px] pr-1 text-right text-xs tabular-nums">{formatEuro(totaleCapitolo(c))} €</strong>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-slate-500" title="Rinomina capitolo" aria-label={`Rinomina capitolo ${c.nome}`} onClick={() => apri(c.nome)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-slate-500 hover:text-red-700" title="Elimina capitolo" aria-label={`Elimina capitolo ${c.nome}`} onClick={() => elimina(c.nome, c.righe.length)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </th></tr>
                {apertoCapitolo && <>
                  {c.righeVisibili.map(({ voce, indice, calcolo }, posizione) => {
                    const eAperta = aperta === voce.id, misureVisibili = misureAperte.has(voce.id), daMisure = voce.misure.length > 0;
                    const categoria = [voce.categoria?.trim(), voce.sottocategoria?.trim()].filter(Boolean).join(" › ");
                    const precedente = c.righeVisibili[posizione - 1]?.voce;
                    const categoriaPrecedente = precedente ? [precedente.categoria?.trim(), precedente.sottocategoria?.trim()].filter(Boolean).join(" › ") : "";
                    const segni = [voce.corpo && "A corpo", voce.sicurezza && "Sicurezza", voce.detrazione && "Detrazione", voce.opzionale && "Opzionale · fuori dal totale", voce.fonte?.startsWith("Stima di mercato di Silvio") && "Prezzo stimato"].filter(Boolean) as string[];
                    return <Fragment key={voce.id}>
                      {!!categoria && categoria !== categoriaPrecedente && <tr className="border-t border-slate-100"><td colSpan={6} className="bg-slate-50/40 py-1 pl-11 pr-2 text-[10px] font-medium text-slate-500">{categoria}</td></tr>}
                      <tr onClickCapture={() => onAttiva?.(voce.id)} onFocusCapture={() => { setRigaAttiva(voce.id); onAttiva?.(voce.id); }} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setRigaAttiva(id => id === voce.id ? null : id); }} className={`group border-t border-slate-100 ${eAperta || misureVisibili ? "bg-blue-50/40" : "hover:bg-slate-50/60"}`}>
                        <td className="py-1 pl-3 pr-1 align-middle">
                          <div className="flex min-w-0 items-start gap-2">
                            <span className="w-5 shrink-0 pt-1 text-right text-[10px] tabular-nums text-slate-400">{indice + 1}</span>
                            <div className="min-w-0 flex-1"><button type="button" aria-label={`${eAperta ? "Chiudi" : "Apri"} voce ${indice + 1}`} aria-expanded={eAperta} onClick={() => { setMisureAperte(prev => { const next = new Set(prev); next.delete(voce.id); return next; }); onApri(eAperta ? null : voce.id); }} className="block w-full rounded py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"><span title={voce.descrizione} className={`block truncate text-[13px] leading-5 ${voce.descrizione.trim() ? "text-slate-900" : "italic text-slate-400"}`}>{voce.descrizione.trim() || "Nuova lavorazione"}</span></button>
                              {(voce.tariffa || segni.length > 0 || calcolo.errori.length > 0 || daMisure) && <div className="flex items-center gap-x-2 overflow-hidden whitespace-nowrap text-[10px] leading-4 text-slate-500">
                                {voce.tariffa && <span className="font-mono">{voce.tariffa}</span>}{daMisure && <span>{voce.misure.length} {voce.misure.length === 1 ? "riga" : "righe"} di misura</span>}{segni.map(s => <span key={s} className={s.startsWith("Opzionale") ? "text-blue-700" : ""}>{s}</span>)}
                                {!!calcolo.errori.length && <span className="text-amber-700">{daPrezzare(voce) ? "Da prezzare" : "Da completare"}</span>}
                              </div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-1 py-1 align-middle">{daMisure ? <output className="block px-2 text-right text-[13px] tabular-nums" aria-label={`Quantità voce ${indice + 1} dalle misure`} title="Dalle righe di misura">{calcolo.quantita == null ? "—" : quantitaTesto(calcolo.quantita)}</output> : <Input aria-label={`Quantità voce ${indice + 1}`} inputMode="decimal" maxLength={40} className="h-7 w-full border-transparent bg-transparent px-1.5 text-right text-[13px] shadow-none md:text-[13px] hover:border-slate-200 focus:border-blue-400 focus:bg-white" placeholder="—" value={voce.quantita} onChange={e => onModifica(voce.id, { quantita: e.target.value })} />}</td>
                        <td className="px-1 py-1 align-middle"><Input aria-label={`Unità voce ${indice + 1}`} maxLength={40} className="h-7 w-full border-transparent bg-transparent px-1 text-xs text-slate-500 shadow-none md:text-xs hover:border-slate-200 focus:border-blue-400 focus:bg-white" value={voce.unita} placeholder="U.M." onChange={e => onModifica(voce.id, { unita: e.target.value, corpo: ["corpo", "a corpo"].includes(e.target.value.trim().toLowerCase()) })} /></td>
                        <td className="px-1 py-1 align-middle"><Input data-prezzo-voce aria-label={`Prezzo voce ${indice + 1}`} inputMode="decimal" maxLength={40} className="h-7 w-full border-transparent bg-transparent px-1.5 text-right text-[13px] tabular-nums shadow-none md:text-[13px] hover:border-slate-200 focus:border-blue-400 focus:bg-white" placeholder="Da definire" value={voce.prezzo} onKeyDown={prezzoSotto} onChange={e => onModifica(voce.id, { prezzo: e.target.value })} /></td>
                        <td className="px-2 py-1 text-right align-middle tabular-nums"><strong className={`text-[13px] ${calcolo.errori.length ? "font-normal text-slate-400" : voce.opzionale ? "font-medium text-slate-500" : "font-semibold text-slate-900"}`}>{calcolo.errori.length ? "—" : `${formatEuro(calcolo.importo ?? 0)} €`}</strong></td>
                        <td className="py-1 pr-1 align-middle"><Button variant="ghost" size="icon" className={`h-7 w-7 ${daMisure || misureVisibili ? "text-blue-700" : "text-slate-400"}`} aria-expanded={misureVisibili} aria-label={`${misureVisibili ? "Nascondi" : "Mostra"} misure voce ${indice + 1}`} title={misureVisibili ? "Chiudi le misure" : "Misure e formule nella riga"} onClick={() => cambiaMisure(voce.id)}><Ruler className="h-3.5 w-3.5" /></Button></td>
                      </tr>
                      {misureVisibili && !eAperta && <tr onFocusCapture={() => onAttiva?.(voce.id)} onClickCapture={() => onAttiva?.(voce.id)} className="border-t border-blue-100 bg-blue-50/30"><td colSpan={6} className="px-3 py-2"><div className="max-h-[420px] overflow-auto overscroll-contain"><ComputoMisure misure={voce.misure} unita={voce.unita} onChange={misure => onModifica(voce.id, { misure })} /></div></td></tr>}
                      {eAperta && renderDettaglio && <tr id={`computo-dettaglio-${voce.id}`}><td colSpan={6} className="border-y border-blue-200 bg-blue-50/30 p-3">{renderDettaglio(voce, indice)}</td></tr>}
                    </Fragment>;
                  })}
                  <tr className="border-t border-slate-100"><td colSpan={6} className="py-0.5 pl-9"><div className="flex items-center gap-1"><Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px] font-normal text-slate-500" disabled={voci.length >= 5000} onClick={() => nuoveVoci(c.nome)}><Plus className="h-3 w-3" />Voce libera</Button>{onListino && <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px] font-normal text-slate-500" disabled={voci.length >= 5000} onClick={() => nuoveVoci(c.nome, true)}><Search className="h-3 w-3" />Dal listino</Button>}</div></td></tr>
                </>}
              </tbody>;
            })}
          </table>
          {!visibili.length && <p className="p-4 text-xs text-slate-500">{stato === "da-prezzare" ? "Nessuna voce da prezzare nei capitoli selezionati." : "Nessuna lavorazione trovata."}</p>}
        </div>}
        {!!capitoli.length && <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500"><span>{capitoli.length} capitoli · {voci.length} voci{selezionato || filtro || stato !== "tutte" ? ` · ${visibili.reduce((n, c) => n + c.righeVisibili.length, 0)} visibili` : ""}</span><span>Invio nel prezzo passa alla riga successiva.</span></div>}
      </div>
    </div>
    <Dialog open={!!dialog} onOpenChange={open => { if (!open) setDialog(null); }}><DialogContent className="max-w-md" aria-describedby={undefined}><DialogHeader><DialogTitle>{dialog?.originale ? "Rinomina capitolo" : "Nuovo capitolo"}</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); salvaNome(); }} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="computo-capitolo-nome">Nome del capitolo</Label><Input id="computo-capitolo-nome" autoFocus maxLength={300} value={nome} onChange={e => setNome(e.target.value)} placeholder="Es. Demolizioni e rimozioni" /></div>{errore && <p role="alert" className="text-sm text-red-700">{errore}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>Annulla</Button><Button type="submit">{dialog?.originale ? "Salva nome" : "Crea capitolo"}</Button></div></form>
    </DialogContent></Dialog>
    <Dialog open={!!daEliminare} onOpenChange={open => { if (!open) setDaEliminare(null); }}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Elimina il capitolo «{daEliminare?.nome}»</DialogTitle>
        <DialogDescription>Con il capitolo si tolgono {daEliminare?.voci === 1 ? "la sua voce" : `le sue ${daEliminare?.voci} voci`}. Se ci ripensi, «Annulla ultima modifica» lo rimette com'era.</DialogDescription></DialogHeader>
      <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setDaEliminare(null)}>Annulla</Button>
        <Button variant="destructive" onClick={() => { if (daEliminare) onEliminaCapitolo(daEliminare.nome); setDaEliminare(null); }}>Elimina capitolo e voci</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
