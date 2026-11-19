import { useState } from "react";
import { Plus, Ruler, Trash2, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SupplierSelect } from "../SupplierSelect";
import type { OrderItem } from "../OrderItemsList";
import { formatCurrency } from "@/lib/formatters";
import { parseDecimalITStrict } from "@/lib/parseDecimalIT";
import { calcolaPreparazione, cambiaBaseIva, fontePrezzoArticolo, numeroCampo, ripartisciPreparazione, type RigaPreparazione } from "@/lib/orders/preparazioneForniture";

interface Props {
  forniture: Record<string, TotaleFornitura>;
  onFornitureChange: React.Dispatch<React.SetStateAction<Record<string, TotaleFornitura>>>;
  righe: RigaPreparazione[];
  onChange: (righe: RigaPreparazione[]) => void;
  articoli: OrderItem[];
  fornitori: Array<{ id: string; name: string }>;
  companyId?: string;
  canViewCosts: boolean;
  contestoFornitore?: string;
  onContestoFornitore: (id: string | undefined) => void;
  onNuova: () => void;
  onMisure: (chiave: string) => void;
  onDettagli: (chiave: string) => void;
  onModifica?: (indice: number) => void;
  onSalva: () => Promise<void>;
  salvando: boolean;
}
export interface TotaleFornitura { ivato: boolean; totale: string; criterio: "valore" | "uguale" }
const base: TotaleFornitura = { ivato: false, totale: "", criterio: "valore" };

export function PreparazioneForniture({ forniture, onFornitureChange: setForniture, righe, onChange, articoli, fornitori, companyId, canViewCosts, contestoFornitore, onContestoFornitore, onNuova, onMisure, onDettagli, onModifica, onSalva, salvando }: Props) {
  const [errore, setErrore] = useState<string | null>(null);
  const gruppi = new Map<string, RigaPreparazione[]>();
  for (const r of righe) { const id = r.articolo.supplier_id || "_nessuno"; gruppi.set(id, [...(gruppi.get(id) ?? []), r]); }
  const salvati = new Map<string, Array<{r: OrderItem; indice: number}>>();
  articoli.forEach((r,indice) => { const key=r.supplier_id || "_nessuno"; salvati.set(key,[...(salvati.get(key) ?? []),{r,indice}]); });
  const aggiorna = (chiave: string, fn: (r: RigaPreparazione) => RigaPreparazione) => onChange(righe.map(r => r.chiave === chiave ? fn(r) : r));
  const stato = (id: string) => forniture[id] ?? base;
  const cambiaStato = (id: string, dati: Partial<TotaleFornitura>) => setForniture(p => ({ ...p, [id]: { ...stato(id), ...dati } }));
  const nome = (id: string) => fornitori.find(f => f.id === id)?.name ?? "Fornitore";
  const salva = async () => {
    setErrore(null);
    for (const [id, gruppo] of gruppi) {
      const s = stato(id);
      if (!s.totale.trim()) continue;
      const importo = parseDecimalITStrict(s.totale), calcoli = gruppo.map(calcolaPreparazione);
      const totale = calcoli.reduce((n,c) => n+(s.ivato ? c.lordo : c.netto),0);
      if (!Number.isFinite(importo) || calcoli.some(c => c.errore || c.daDefinire) || Math.abs(importo-totale)>0.005) {
        setErrore(`${id === "_nessuno" ? "Fornitura senza fornitore" : nome(id)}: ripartisci il totale sulle righe oppure svuota il totale fornitura.`); return;
      }
    }
    try { await onSalva(); setForniture({}); } catch (e) { setErrore(e instanceof Error ? e.message : "Salvataggio non confermato. La preparazione è conservata."); }
  };
  return <div className="space-y-5" aria-label="Preparazione per fornitore">
    <fieldset disabled={salvando} className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-1 sm:max-w-lg"><Label>Fornitore per i nuovi articoli liberi</Label><SupplierSelect searchable inlineCreate value={contestoFornitore} onValueChange={onContestoFornitore} fallbackCompanyId={companyId} />
        <p className="text-xs text-muted-foreground">Le voci del listino mantengono il proprio fornitore. Questo vale per le nuove righe senza un fornitore già indicato.</p></div>
      <Button type="button" variant="outline" onClick={onNuova} disabled={salvando}><Plus className="mr-1 h-4 w-4" />Aggiungi riga libera</Button>
    </div>
    {canViewCosts && <p className="text-sm text-muted-foreground">Qui prepari articoli e prezzi stimati, anche da definire. I prezzi confermati seguono gli ODA, i DDT e le fatture ricevute collegati.</p>}
    {righe.length === 0 && <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Cerca gli articoli a sinistra o aggiungi una riga libera. Puoi preparare più prodotti e posizioni prima di salvarli insieme.</div>}
    {[...gruppi].map(([id, gruppo]) => {
      const s = stato(id), calcoli = gruppo.map(calcolaPreparazione);
      const totali = calcoli.reduce((n,c) => ({ netto:n.netto+c.netto, iva:n.iva+c.iva, lordo:n.lordo+c.lordo, mancanti:n.mancanti+Number(c.daDefinire) }),{netto:0,iva:0,lordo:0,mancanti:0});
      return <section key={id} className="min-w-0 rounded-xl border bg-background" aria-label={`Fornitura ${id === "_nessuno" ? "senza fornitore" : nome(id)}`}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 p-3">
          <div className="min-w-0 flex-1"><h3 className="font-semibold">{id === "_nessuno" ? "Fornitore da scegliere" : nome(id)}</h3><p className="text-xs text-muted-foreground">{gruppo.length} righe in preparazione</p></div>
          <div className="w-full min-w-0 sm:w-64"><SupplierSelect searchable inlineCreate value={id === "_nessuno" ? undefined : id} fallbackCompanyId={companyId} onValueChange={nuovo => {
            onChange(righe.map(r => gruppo.some(g => g.chiave === r.chiave) ? { ...r, articolo: { ...r.articolo, supplier_id: nuovo }, prezzo: id === "_nessuno" || nuovo === id ? r.prezzo : { versione:1,modo:"unitario",ivato:s.ivato,valore:"" } } : r));
          }} /></div>
          {canViewCosts && <Select value={s.ivato ? "ivato" : "netto"} onValueChange={v => {
            try {
              const convertite = gruppo.map(r => cambiaBaseIva(r,v === "ivato"));
              onChange(righe.map(r => convertite.find(c => c.chiave === r.chiave) ?? r));
              cambiaStato(id,{ ivato:v === "ivato", totale:s.totale.trim() ? numeroCampo(v === "ivato" ? totali.lordo : totali.netto) : "" }); setErrore(null);
            } catch (e) { setErrore((e as Error).message); }
          }}><SelectTrigger aria-label={`Prezzi IVA ${id}`} className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="netto">Prezzi IVA esclusa</SelectItem><SelectItem value="ivato">Prezzi IVA inclusa</SelectItem></SelectContent></Select>}
        </div>
        <div className="space-y-2 p-3">
          {gruppo.map((r, i) => {
            const c = calcoli[i], valutaIvata = s.ivato;
            const totaleVisibile = valutaIvata ? c.lordo : c.netto;
            const unitario = Number((c.prezzoNetto * (valutaIvata ? 1+parseDecimalITStrict(r.aliquota)/100 : 1)).toFixed(6));
            return <div key={r.chiave} className="rounded-lg border p-3" data-riga-preparazione={r.chiave}>
              <div className={`grid min-w-0 grid-cols-2 items-start gap-2 ${canViewCosts ? "xl:grid-cols-[minmax(140px,1.8fr)_4.5rem_4rem_6rem_6rem_4rem_2rem]" : "xl:grid-cols-[minmax(160px,1fr)_5rem_5rem_2rem]"}`}>
                <div className="col-span-2 min-w-0 space-y-1 xl:col-span-1"><Label htmlFor={`nome-${r.chiave}`} className="text-xs">Articolo / posizione</Label><Input id={`nome-${r.chiave}`} value={r.articolo.name} onChange={e => aggiorna(r.chiave,x => ({...x,articolo:{...x.articolo,name:e.target.value}}))} />
                  {r.articolo.riferimento && <p className="text-xs text-muted-foreground">{r.articolo.riferimento} · {r.articolo.misure_preventivo?.larghezza_mm ?? "—"} × {r.articolo.misure_preventivo?.altezza_mm ?? "—"}{r.articolo.misure_preventivo?.profondita_mm ? ` × ${r.articolo.misure_preventivo.profondita_mm}` : ""} mm</p>}</div>
                <div className="space-y-1"><Label htmlFor={`q-${r.chiave}`} className="text-xs">Quantità</Label><Input id={`q-${r.chiave}`} inputMode="decimal" value={r.quantita} onChange={e => aggiorna(r.chiave,x => ({...x,quantita:e.target.value}))} /></div>
                <div className="space-y-1"><Label htmlFor={`um-${r.chiave}`} className="text-xs">Unità</Label><Input id={`um-${r.chiave}`} value={r.articolo.unita_misura ?? "pz"} disabled={!!r.articolo.gruppo_id} onChange={e => aggiorna(r.chiave,x => ({...x,articolo:{...x.articolo,unita_misura:e.target.value}}))} /></div>
                {canViewCosts && <>
                  <div className="space-y-1"><Label htmlFor={`cad-${r.chiave}`} className="text-xs">Prezzo cad. €</Label><Input id={`cad-${r.chiave}`} inputMode="decimal" placeholder="Da definire" value={r.prezzo.modo === "unitario" && r.prezzo.ivato === valutaIvata ? r.prezzo.valore : c.daDefinire || c.errore ? "" : numeroCampo(unitario)} onChange={e => aggiorna(r.chiave,x => ({...x,articolo:{...x.articolo,prezzo_fonte:"manuale"},prezzo:{versione:1,modo:"unitario",ivato:valutaIvata,valore:e.target.value}}))} /></div>
                  <div className="space-y-1"><Label htmlFor={`tot-${r.chiave}`} className="text-xs">Totale riga €</Label><Input id={`tot-${r.chiave}`} inputMode="decimal" placeholder="Da definire" value={r.prezzo.modo === "totale" && r.prezzo.ivato === valutaIvata ? r.prezzo.valore : c.daDefinire || c.errore ? "" : numeroCampo(totaleVisibile)} onChange={e => aggiorna(r.chiave,x => ({...x,articolo:{...x.articolo,prezzo_fonte:"manuale"},prezzo:{versione:1,modo:"totale",ivato:valutaIvata,valore:e.target.value}}))} /></div>
                  <div className="space-y-1"><Label htmlFor={`iva-${r.chiave}`} className="text-xs">IVA %</Label><Input id={`iva-${r.chiave}`} inputMode="decimal" value={r.aliquota} onChange={e => aggiorna(r.chiave,x => ({...x,aliquota:e.target.value}))} /></div>
                </>}
                <Button type="button" size="icon" variant="ghost" className="mt-5 self-start" aria-label={`Togli ${r.articolo.name || "riga"}`} onClick={() => onChange(righe.filter(x => x.chiave !== r.chiave))}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{canViewCosts ? r.prezzo.ripartizione ? "Stima ripartita dal totale fornitura" : c.daDefinire ? "Prezzo da definire con ODA, DDT o fattura collegata" : `Stima · ${r.prezzo.modo === "totale" ? "Totale riga mantenuto" : "Prezzo unitario mantenuto"} · IVA ${valutaIvata ? "inclusa" : "esclusa"}` : "Articolo in preparazione"}</p>
                <div className="flex flex-wrap gap-1">{!r.articolo.gruppo_id && <Button type="button" variant="ghost" size="sm" onClick={() => { try { onDettagli(r.chiave); } catch(e) { setErrore((e as Error).message); } }}>Dettagli</Button>}
                <Button type="button" variant="ghost" size="sm" onClick={() => { try { onMisure(r.chiave); } catch(e) { setErrore((e as Error).message); } }}><Ruler className="mr-1 h-3.5 w-3.5" />{r.articolo.gruppo_id ? "Modifica misure" : "Posizioni e misure"}</Button></div>
              </div>
              {c.errore && <p role="alert" className="mt-1 text-xs text-destructive">{c.errore}</p>}
            </div>;
          })}
        </div>
        {canViewCosts && <div className="space-y-3 border-t bg-muted/10 p-3">
          <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="space-y-1"><Label htmlFor={`fornitura-${id}`} className="text-xs">Totale fornitura · IVA {s.ivato ? "inclusa" : "esclusa"}</Label><Input id={`fornitura-${id}`} inputMode="decimal" value={s.totale} placeholder="Facoltativo: importo complessivo" onChange={e => cambiaStato(id,{totale:e.target.value})} /></div>
            <Select value={s.criterio} onValueChange={v => cambiaStato(id,{criterio:v as TotaleFornitura["criterio"]})}><SelectTrigger aria-label={`Criterio ripartizione ${id}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="valore">In proporzione ai prezzi</SelectItem><SelectItem value="uguale">Quote uguali per riga</SelectItem></SelectContent></Select>
            <Button type="button" variant="outline" onClick={() => { try { const nuove = ripartisciPreparazione(gruppo,s.totale,s.ivato,s.criterio,crypto.randomUUID()); onChange(righe.map(r => nuove.find(n => n.chiave === r.chiave) ?? r)); setErrore(null); } catch(e) { setErrore((e as Error).message); } }}>Ripartisci totale</Button>
          </div>
          <p className="text-xs text-muted-foreground">La ripartizione valorizza le righe una sola volta. Le misure e le quantità restano quelle preparate.</p>
          <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm"><span>Netto {formatCurrency(totali.netto)}</span><span>IVA {formatCurrency(totali.iva)}</span><strong>Totale {formatCurrency(totali.lordo)}</strong>{totali.mancanti>0 && <span className="text-amber-800">{totali.mancanti} prezzi da definire</span>}</div>
        </div>}
      </section>;
    })}
    </fieldset>
    {errore && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errore}</p>}
    {righe.length>0 && <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3"><p className="text-sm text-muted-foreground">{righe.length} righe · {gruppi.size} forniture · ancora da salvare</p><Button type="button" onClick={() => void salva()} disabled={salvando}>{salvando ? "Salvataggio…" : "Salva preparazione"}</Button></div>}
    {articoli.length>0 && <section aria-label="Articoli già nella commessa" className="space-y-2 border-t pt-4"><h3 className="font-semibold">Già nella commessa</h3><p className="text-xs text-muted-foreground">I prezzi confermati dai documenti restano separati dalle nuove stime.</p>
      {[...salvati].map(([id, righeSalvate]) => <section key={id} className="rounded-lg border" aria-label={`Fornitura salvata ${id === "_nessuno" ? "senza fornitore" : nome(id)}`}>
        <h4 className="border-b bg-muted/20 px-3 py-2 text-sm font-semibold">{id === "_nessuno" ? "Fornitore da scegliere" : nome(id)}</h4>
        {righeSalvate.map(({r,indice}) => <div key={r.id ?? indice} className="flex min-w-0 flex-wrap items-center gap-3 border-b p-3 last:border-b-0">
          <FileCheck2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{r.name}{r.riferimento ? ` · ${r.riferimento}` : ""}</p>
            <p className="text-xs text-muted-foreground">{r.supplier_id ? nome(r.supplier_id) : "Fornitore da scegliere"} · {r.quantity} {r.unita_misura || "pz"} · {fontePrezzoArticolo(r)}</p>
            {canViewCosts && r.costo_stimato_iniziale != null && Math.abs(r.costo_stimato_iniziale-(r.purchase_price ?? 0))>0.000001 && <p className="text-xs text-muted-foreground">Stima iniziale: {formatCurrency(r.costo_stimato_iniziale*r.quantity)} IVA esclusa</p>}
          </div>
          {canViewCosts && <span className="text-right text-sm">{r.prezzo_da_definire || (!(r.purchase_price ?? 0) && !r.prezzo_fonte) ? "Da definire" : <>{formatCurrency((r.purchase_price ?? 0)*r.quantity)}<span className="block text-xs text-muted-foreground">IVA esclusa</span></>}</span>}
          {onModifica && <Button type="button" variant="ghost" size="sm" disabled={salvando} onClick={() => onModifica(indice)}>Dettagli</Button>}
        </div>)}
      </section>)}
    </section>}
  </div>;
}
