import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Calculator, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcolaVoce, type VoceEditor } from "@/lib/computo/editorNativo";
import { formatEuro } from "@/lib/computo/computoStrutturato";

const capitoliFrequenti = ["Demolizioni e rimozioni", "Opere murarie", "Impianti elettrici", "Impianti idraulici", "Pavimenti e rivestimenti", "Serramenti", "Tinteggiature", "Sicurezza"];

const quantitaTesto = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: "always" });

/**
 * Il computo a capitoli, con le voci DENTRO il loro capitolo.
 *
 * Fino al 29/10/2026 l'elenco mostrava le voci in sola lettura e una voce si
 * modificava in un pannello sotto l'elenco intero: con 226 voci importate,
 * aprirne una voleva dire scendere oltre tutte le altre. Ora la voce si apre
 * dove sta (come nel preventivo di Ristrutturazione), e quantità e prezzo si
 * scrivono nella riga stessa senza aprirla.
 *
 * Invio nel prezzo porta al prezzo della voce sotto: prezzare un computo
 * arrivato dal progettista è scrivere una colonna di prezzi, riga dopo riga.
 */
export default function ComputoCapitoli({ voci, capitoliVuoti, aperta, onApri, onAdd, onCapitoli, onRename, onListino, onModifica, onEliminaCapitolo, renderDettaglio }: {
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
  renderDettaglio: (voce: VoceEditor, indice: number) => ReactNode;
}) {
  const [ricerca, setRicerca] = useState("");
  const [chiusi, setChiusi] = useState<Set<string>>(() => new Set());
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
  const apri = (originale?: string) => { setNome(originale ?? ""); setErrore(""); setDialog({ originale }); };
  const salvaNome = () => {
    const prossimo = nome.trim();
    if (!prossimo) { setErrore("Inserisci il nome del capitolo."); return; }
    if (capitoli.some(c => c.nome.toLocaleLowerCase("it") === prossimo.toLocaleLowerCase("it") && c.nome !== dialog?.originale)) { setErrore("Questo capitolo esiste già. Scegli un nome diverso."); return; }
    if (dialog?.originale) onRename(dialog.originale, prossimo);
    else onCapitoli([...capitoliVuoti, prossimo]);
    setRicerca(""); setChiusi(prev => { const next = new Set(prev); next.delete(prossimo); return next; });
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
  const visibili = capitoli.map((c, indice) => ({ ...c, numero: indice + 1, righeVisibili: c.nome.toLocaleLowerCase("it").includes(filtro) ? c.righe : c.righe.filter(r => `${r.voce.descrizione} ${r.voce.tariffa}`.toLocaleLowerCase("it").includes(filtro)) }))
    .filter(c => !filtro || c.righeVisibili.length || c.nome.toLocaleLowerCase("it").includes(filtro));
  return <section aria-label="Capitoli del computo" className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Calculator className="h-4 w-4 text-orange-600" /><h3 className="text-sm font-semibold">Capitoli</h3><span className="text-xs text-muted-foreground">{capitoli.length} {capitoli.length === 1 ? "capitolo" : "capitoli"}</span></div>
      <div className="flex flex-wrap gap-2">
        {!!capitoli.length && <Button variant="outline" size="icon" className="h-9 w-9" title={chiusi.size ? "Espandi tutti i capitoli" : "Comprimi tutti i capitoli"} aria-label={chiusi.size ? "Espandi tutti i capitoli" : "Comprimi tutti i capitoli"} onClick={() => setChiusi(chiusi.size ? new Set() : new Set(capitoli.map(c => c.nome)))}>{chiusi.size ? <ChevronsDown className="h-4 w-4" /> : <ChevronsUp className="h-4 w-4" />}</Button>}
        <Button variant="outline" size="sm" disabled={capitoli.length >= 200} onClick={() => apri()}><Plus className="mr-1 h-4 w-4" />Aggiungi capitolo</Button>
        <Select value="" disabled={capitoli.length >= 200} onValueChange={value => {
          if (!value || capitoli.some(c => c.nome.toLocaleLowerCase("it") === value.toLocaleLowerCase("it"))) return;
          onCapitoli([...capitoliVuoti, value]); setRicerca(""); setChiusi(prev => { const next = new Set(prev); next.delete(value); return next; });
        }}><SelectTrigger aria-label="Capitoli frequenti" className="h-9 w-44"><SelectValue placeholder="Capitolo rapido" /></SelectTrigger><SelectContent>
          {capitoliFrequenti.map(n => <SelectItem key={n} value={n} disabled={capitoli.some(c => c.nome.toLocaleLowerCase("it") === n.toLocaleLowerCase("it"))}>{n}</SelectItem>)}
        </SelectContent></Select>
        {onListino && <Button variant="outline" size="sm" onClick={() => onListino()}><Search className="mr-1 h-4 w-4" />Cerca nei listini</Button>}</div>
    </div>
    {!!capitoli.length && <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Cerca lavorazioni" placeholder="Cerca un capitolo, una lavorazione o un codice" className="pl-9" value={ricerca} onChange={e => setRicerca(e.target.value)} /></div>}
    {!capitoli.length && <div className="flex min-h-52 flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-white p-6 text-center">
      <Calculator className="h-8 w-8 text-orange-500" /><h3 className="font-semibold">Costruisci il computo</h3>
      <div className="flex flex-wrap justify-center gap-2"><Button onClick={() => apri()}><Plus className="mr-1 h-4 w-4" />Crea il primo capitolo</Button><Button variant="outline" onClick={() => onListino ? onListino() : onAdd("Opere edili")}>Aggiungi lavorazione</Button></div>
      <p className="max-w-md text-xs text-muted-foreground">Hai già un computo? Parti da lì con i pulsanti qui sopra: dal PDF o dall'XPWE di PriMus, da un PDF, un Excel o una foto con l'AI, oppure descrivendo i lavori a voce.</p>
    </div>}
    <div aria-label="Elenco dei capitoli" role="region" className="space-y-3">
    {visibili.map(c => {
      const apertoCapitolo = !!filtro || !chiusi.has(c.nome);
      const parziale = c.righe.some(r => r.calcolo.errori.length);
      const totale = c.righe.reduce((s, r) => s + (r.calcolo.errori.length ? 0 : r.calcolo.importo ?? 0), 0);
      return <div key={c.nome} className="overflow-hidden rounded-xl border border-l-4 border-l-orange-400 bg-white">
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2.5">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`${apertoCapitolo ? "Chiudi" : "Apri"} capitolo ${c.nome}`} aria-expanded={apertoCapitolo} onClick={() => setChiusi(prev => { const next = new Set(prev); if (next.has(c.nome)) next.delete(c.nome); else next.add(c.nome); return next; })}>{apertoCapitolo ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button>
          <span className="text-xs font-semibold text-orange-600">{String(c.numero).padStart(2, "0")}</span><h4 className="min-w-0 flex-1 break-words text-sm font-semibold">{c.nome}</h4>
          <span className="hidden shrink-0 rounded-full border bg-white px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">{c.righe.length} {c.righe.length === 1 ? "voce" : "voci"}</span>
          {!!c.righe.length && <div className="shrink-0 text-right text-sm tabular-nums"><strong>{formatEuro(totale)} €</strong>{parziale && <span className="block text-[11px] text-amber-700">Parziale</span>}</div>}
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Rinomina capitolo" aria-label={`Rinomina capitolo ${c.nome}`} onClick={() => apri(c.nome)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-700" title="Elimina capitolo" aria-label={`Elimina capitolo ${c.nome}`} onClick={() => elimina(c.nome, c.righe.length)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
        {apertoCapitolo && <div className="space-y-2 p-2 sm:p-3">
          {c.righeVisibili.map(({ voce, indice, calcolo }) => {
            const eAperta = aperta === voce.id;
            const daMisure = voce.misure.length > 0;
            const segni = [daMisure && `${voce.misure.length} ${voce.misure.length === 1 ? "riga" : "righe"} di misura`, voce.corpo && "A corpo", voce.sicurezza && "Sicurezza", voce.detrazione && "Detrazione"].filter(Boolean) as string[];
            return <div key={voce.id} className={`rounded-lg border bg-white transition-shadow ${eAperta ? "border-orange-300 shadow-sm" : "hover:border-slate-300"}`}>
              <div className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <button type="button" aria-expanded={eAperta} aria-label={`${eAperta ? "Chiudi" : "Apri"} voce ${indice + 1}`} onClick={() => onApri(eAperta ? null : voce.id)} className="min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
                  <span className="flex items-baseline gap-2"><span className="text-xs font-semibold tabular-nums text-orange-600">{indice + 1}</span>{voce.tariffa && <span className="truncate font-mono text-[11px] text-muted-foreground">{voce.tariffa}</span>}</span>
                  <span className={`mt-0.5 block break-words text-sm font-medium ${eAperta ? "" : "line-clamp-2"}`}>{voce.descrizione.trim() || "Nuova lavorazione"}</span>
                  {(!!segni.length || !!calcolo.errori.length) && <span className="mt-1 flex flex-wrap gap-1">
                    {segni.map(s => <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{s}</span>)}
                    {!!calcolo.errori.length && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">Da completare</span>}
                  </span>}
                </button>
                <div className="flex flex-wrap items-center justify-end gap-1.5 text-sm tabular-nums">
                  {!eAperta && <>
                    {daMisure
                      ? <span className="text-right" title="Dalle righe di misura">{calcolo.quantita == null ? "—" : quantitaTesto(calcolo.quantita)}</span>
                      : <Input aria-label={`Quantità voce ${indice + 1}`} inputMode="decimal" maxLength={40} className="h-8 w-20 text-right" placeholder="Qtà"
                        value={voce.quantita} onChange={e => onModifica(voce.id, { quantita: e.target.value })} />}
                    <span className="min-w-[2rem] text-xs text-muted-foreground">{voce.unita}</span>
                    <span aria-hidden="true" className="text-muted-foreground">×</span>
                    <Input data-prezzo-voce aria-label={`Prezzo voce ${indice + 1}`} inputMode="decimal" maxLength={40} className="h-8 w-24 text-right" placeholder="Prezzo €"
                      value={voce.prezzo} onKeyDown={prezzoSotto} onChange={e => onModifica(voce.id, { prezzo: e.target.value })} />
                  </>}
                  <strong className={`w-28 text-right ${calcolo.errori.length ? "font-medium text-amber-700" : ""}`}>{calcolo.errori.length ? "Da completare" : `${formatEuro(calcolo.importo ?? 0)} €`}</strong>
                </div>
              </div>
              {eAperta && <div className="border-t bg-slate-50/50 p-3 sm:p-4">{renderDettaglio(voce, indice)}</div>}
            </div>;
          })}
          <div className="flex flex-wrap gap-2 pt-1"><Button variant="ghost" size="sm" disabled={voci.length >= 5000} onClick={() => { setRicerca(""); onAdd(c.nome); }}><Plus className="mr-1 h-4 w-4" />Voce libera</Button>{onListino && <Button variant="ghost" size="sm" onClick={() => { setRicerca(""); onListino(c.nome); }}><Search className="mr-1 h-4 w-4" />Dal listino</Button>}</div>
        </div>}
      </div>;
    })}
    </div>
    {!!capitoli.length && !visibili.length && <p className="py-4 text-sm text-muted-foreground">Nessuna lavorazione trovata.</p>}
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
