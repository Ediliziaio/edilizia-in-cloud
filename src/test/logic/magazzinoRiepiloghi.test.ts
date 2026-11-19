import { expect, it } from "vitest";
import { riepilogoValore, fabbisognoMateriale } from "@/lib/magazzino/riepiloghiMagazzino";
import type { ArticoloValorizzato } from "@/hooks/warehouse/useWarehouseValorizzazione";
const row = (id: string, quantity: number, unita_misura?: string): ArticoloValorizzato => ({id,name:id,quantity,unita_misura,ha_lotti:false,unit_cost:10,valore:quantity*10,warehouse_id:"w",internal_code:null});
it("separa unità, normalizza mq/m² ed esclude le giacenze a zero", () => {
 const r=riepilogoValore([row("a",13.25,"m"),row("b",17,"mq"),row("c",17,"m²"),row("d",2,"pz"),row("zero",0,"pz")]);
 expect(r.articoli).toBe(4); expect(new Map(r.quantita)).toEqual(new Map([["m",13.25],["mq",34],["pz",2]])); expect(r.valoreSenzaLotti).toBe(492.5);
});
it("non inventa unità quando mancano nell'anagrafica",()=>{const r=riepilogoValore([row("a",3),row("b",8)]);expect(r.quantita).toEqual([]);expect(r.unitaDaVerificare).toBe(2);});
it("distingue contrattuale, prenotato, netto fuori e residuo da coprire",()=>{expect(fabbisognoMateriale(6,2,4,1)).toEqual({previsti:6,impegnato:2,fuori:3,daCoprire:1});});
it("un reso riapre soltanto il fabbisogno restituito",()=>{expect(fabbisognoMateriale(6,0,6,0).daCoprire).toBe(0);expect(fabbisognoMateriale(6,0,6,0.75).daCoprire).toBe(0.75);});
