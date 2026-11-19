import { expect, it } from "vitest";
import { righeSimulazione, fornitoriSimulazione } from "../../../dev/articoli-popup-unico/simulazione-appartamento";
import { articoloDaPreparazione, calcolaPreparazione } from "@/lib/orders/preparazioneForniture";
import { procurementLines } from "@/lib/orders/materialProcurement";
import { totaliRigheOda } from "@/lib/orders/articoloAcquisto";

it("la commessa dimostrativa contiene 22 righe, quattro fornitori e otto posizioni su misura",()=>{
  expect(righeSimulazione).toHaveLength(22);
  expect(fornitoriSimulazione.map(f=>righeSimulazione.filter(r=>r.articolo.supplier_id===f.id).length)).toEqual([5,5,6,6]);
  expect(righeSimulazione.filter(r=>r.articolo.misure_preventivo)).toHaveLength(8);
  expect(righeSimulazione.find(r=>r.articolo.name==="Cassonetto coibentato")?.articolo.misure_preventivo?.profondita_mm).toBe(250);
});
it("i gruppi illustrano prezzi ivati, unitari, totale riga e ripartizione della fornitura",()=>{
  const oscuranti=righeSimulazione.filter(r=>r.articolo.supplier_id==="sim-oscuranti");
  expect(oscuranti.every(r=>r.prezzo.ivato)).toBe(true);
  expect(oscuranti.reduce((s,r)=>s+Math.round(calcolaPreparazione(r).lordo*100),0)).toBe(81740);
  expect(righeSimulazione.find(r=>r.articolo.name==="Controtelaio coibentato")?.prezzo.modo).toBe("totale");
  const elettrico=righeSimulazione.filter(r=>r.articolo.supplier_id==="sim-elettrico");
  expect(elettrico.reduce((s,r)=>s+(r.articolo.purchase_price??0)*r.articolo.quantity,0)).toBeCloseTo(715);
  expect(elettrico.reduce((s,r)=>s+calcolaPreparazione(r).netto,0)).toBe(650);
  expect(elettrico.every(r=>r.prezzo.ripartizione?.totale==="650")).toBe(true);
});
it("le quattro bozze ODA mantengono quantità e totali della preparazione",()=>{
  const articoli=righeSimulazione.map((r,i)=>({...articoloDaPreparazione(r),id:`sim-${i}`}));
  const totali=fornitoriSimulazione.map(f=>{
    const lines=procurementLines(articoli.filter(a=>a.supplier_id===f.id));
    expect(lines).toHaveLength(f.id==="sim-serramenti"||f.id==="sim-oscuranti"?5:6);
    return totaliRigheOda(lines);
  });
  expect(totali.map(t=>t.imponibile)).toEqual([3080,670,697,650]);
  expect(totali.reduce((s,t)=>s+Math.round(t.totale*100),0)).toBe(621834);
});
