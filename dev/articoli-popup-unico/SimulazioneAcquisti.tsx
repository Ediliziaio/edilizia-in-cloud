import { useState } from "react";
import { AggiungiArticoloDialog } from "../../src/components/orders/articoli/AggiungiArticoloDialog";
import type { OrderItem } from "../../src/components/orders/OrderItemsList";
import { Button } from "../../src/components/ui/button";
import { formatCurrency } from "../../src/lib/formatters";
import { articoloDaPreparazione } from "../../src/lib/orders/preparazioneForniture";
import { salvaPreparazioneForniture } from "../../src/lib/orders/salvaPreparazioneForniture";
import { procurementLines } from "../../src/lib/orders/materialProcurement";
import { totaliRigheOda } from "../../src/lib/orders/articoloAcquisto";
import { fornitoriSimulazione, preparazioneSimulazione } from "./simulazione-appartamento";

const iniziali=preparazioneSimulazione.righe.map(articoloDaPreparazione);
const totale=(righe:OrderItem[])=>totaliRigheOda(righe.map(r=>({quantity:r.quantity,unit_price:r.purchase_price??0,vat_rate:r.vat_rate??22,discount_percent:0,price_pending:r.prezzo_da_definire})));
const dimensioni=(r:OrderItem)=>r.misure_preventivo ? `${r.riferimento ?? "Posizione"} · ${r.misure_preventivo.larghezza_mm ?? "—"} × ${r.misure_preventivo.altezza_mm ?? "—"}${r.misure_preventivo.profondita_mm ? ` × ${r.misure_preventivo.profondita_mm}` : ""} mm · da verificare` : "";
export function SimulazioneAcquisti() {
  const [open,setOpen]=useState(true);
  const [items,setItems]=useState<OrderItem[]>([]);
  const [oda,setOda]=useState(false);
  const [errore,setErrore]=useState<string|null>(null);
  const [sessione,setSessione]=useState(1);
  const righe=items.length ? items : iniziali;
  const somme=totale(righe);
  const ids=[...new Set([...fornitoriSimulazione.map(f=>f.id),...righe.map(r=>r.supplier_id).filter(Boolean)])];
  const gruppi=ids.flatMap(id=>{
    const articoli=righe.filter(r=>r.supplier_id===id);if(!articoli.length)return [];
    const f=fornitoriSimulazione.find(f=>f.id===id);
    return [{id,name:f?.name??"Altro fornitore",ambito:f?.ambito??"Articoli aggiunti",esempio:f?.esempio??"Prezzi di preparazione",articoli,...totale(articoli)}];
  });
  const avviaOda=()=>{
    try {gruppi.forEach(g=>procurementLines(g.articoli));setOda(true);setErrore(null);}
    catch(e){setErrore(e instanceof Error?e.message:"Controlla le righe prima dell’ODA.");}
  };
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <p className="text-sm font-semibold text-amber-800">Simulazione locale · Azienda, fornitori e prezzi inventati · Nessun ordine inviato</p>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">Edil Rinnova · Commessa DEMO-ROSSI-01</p><h1 className="text-2xl font-semibold sm:text-3xl">Ristrutturazione appartamento Rossi</h1><p className="mt-2 text-muted-foreground">Serramenti, tapparelle, cartongesso e materiale elettrico, preparati insieme per quattro fornitori.</p></div><Button asChild variant="outline"><a href="/">Torna alla prova libera</a></Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-white p-4"><p className="text-sm text-muted-foreground">Articoli e posizioni</p><strong className="text-2xl">{righe.length} righe · {gruppi.length} fornitori</strong></div><div className="rounded-xl border bg-white p-4"><p className="text-sm text-muted-foreground">Totale netto stimato</p><strong className="text-2xl">{formatCurrency(somme.imponibile)}</strong></div><div className="rounded-xl border bg-white p-4"><p className="text-sm text-muted-foreground">Totale con IVA dimostrativa al 22%</p><strong className="text-2xl">{formatCurrency(somme.totale)}</strong></div></div>
    <div className="flex flex-wrap gap-2"><Button onClick={()=>setOpen(true)}>{items.length?"Rivedi gli articoli salvati":"Apri preparazione compilata"}</Button><Button variant="outline" disabled={!items.length||oda} onClick={avviaOda}>Simula le bozze ODA per fornitore</Button><Button variant="ghost" onClick={()=>{setItems([]);setOda(false);setErrore(null);setSessione(n=>n+1);setOpen(true);}}>Ricomincia simulazione</Button></div>
    <p role="status" className="rounded-lg border bg-white p-3 text-sm">{oda?`${gruppi.length} bozze ODA simulate, con gli articoli separati per fornitore. Nessun invio.`:items.length?`${items.length} righe salvate nella commessa simulata. Ora puoi vedere come entrerebbero nelle bozze ODA.`:"Preparazione già compilata: puoi cambiare quantità, prezzi, fornitori e misure prima di salvare."}</p>
    {errore&&<p role="alert" className="text-destructive">{errore}</p>}
    <section aria-label="Riepilogo delle forniture" className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[660px] text-sm"><thead className="bg-muted/30 text-left"><tr><th className="p-4">Fornitore / fornitura</th><th className="p-4">Righe</th><th className="p-4 text-right">Netto</th><th className="p-4 text-right">IVA</th><th className="p-4 text-right">Totale</th></tr></thead><tbody>{gruppi.map(g=><tr key={g.id} className="border-t"><td className="p-4"><strong>{g.name}</strong><p>{g.ambito}</p><p className="mt-1 text-xs text-muted-foreground">{g.esempio}</p></td><td className="p-4">{g.articoli.length}</td><td className="p-4 text-right">{formatCurrency(g.imponibile)}</td><td className="p-4 text-right">{formatCurrency(g.iva)}</td><td className="p-4 text-right font-semibold">{formatCurrency(g.totale)}</td></tr>)}</tbody></table></section>
    {gruppi.map((g,i)=><section key={g.id} aria-label={`${oda?"Bozza ODA":"Fabbisogno"} ${g.name}`} className="overflow-hidden rounded-xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 p-4"><div><h2 className="font-semibold">{oda?`ODA-SIM-${String(i+1).padStart(3,"0")} · `:""}{g.name}</h2><p className="text-sm text-muted-foreground">{g.ambito}{oda?" · Bozza simulata, nessun invio":""}</p></div><strong>{formatCurrency(g.imponibile)} + IVA</strong></div><div className="divide-y">{g.articoli.map((r,n)=><div key={r.id??n} className="flex flex-wrap justify-between gap-3 p-4 text-sm"><div className="min-w-0"><p className="font-medium">{r.name}</p>{dimensioni(r)&&<p className="text-xs text-muted-foreground">{dimensioni(r)}</p>}<p className="text-xs text-muted-foreground">{r.quantity} {r.unita_misura} · {r.preparazione_prezzo?.ripartizione?"Quota del totale fornitura":r.preparazione_prezzo?.ivato?"Inserito IVA inclusa":r.preparazione_prezzo?.modo==="totale"?"Inserito come totale riga":"Inserito come prezzo cad."}</p></div><div className="text-right"><p>{formatCurrency((r.purchase_price??0)*r.quantity)} netto</p><p className="text-xs text-muted-foreground">{formatCurrency(r.purchase_price??0)} / {r.unita_misura}</p></div></div>)}</div></section>)}
    <output hidden data-testid="righe-simulazione">{JSON.stringify(items)}</output>
    <AggiungiArticoloDialog key={sessione} open={open} onOpenChange={setOpen} companyId="articoli-demo-locale" canViewCosts azzera={0} fornitori={fornitoriSimulazione}
      articoli={items} preparazioneIniziale={items.length?undefined:preparazioneSimulazione}
      onAggiungiRiga={()=>true} onPrendiDaMagazzino={()=>{}} onEsitoSuMisura={()=>{}}
      stockBloccato="In questa simulazione prepariamo gli acquisti; il prelievo di magazzino rimane nella prova dedicata."
      onSalvaPreparazione={async(righe,richiesta)=>{const ids=await salvaPreparazioneForniture("commessa-demo-rossi",righe,richiesta);setItems(prima=>[...prima,...righe.map((r,i)=>({...r,id:ids[i]}))]);setOda(false);}}
      altreFonti={<div className="w-full space-y-2"><p className="text-xs font-semibold">DEMO-ROSSI-01 · Vai alla fornitura</p>{fornitoriSimulazione.map(f=><Button key={f.id} type="button" variant="outline" className="h-auto w-full justify-start whitespace-normal text-left text-xs" onClick={()=>document.querySelector(`section[aria-label="Fornitura ${f.name}"]`)?.scrollIntoView({block:"start"})}>{f.name}</Button>)}<p className="text-xs text-muted-foreground">Prezzi fittizi, IVA 22% per l'esempio. Le misure sono da verificare.</p></div>} />
  </div></main>;
}
