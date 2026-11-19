import type { OrderItem } from "../../src/components/orders/OrderItemsList";
import { nuovaRigaPreparazione, ripartisciPreparazione, type RigaPreparazione } from "../../src/lib/orders/preparazioneForniture";
import type { TotaleFornitura } from "../../src/components/orders/articoli/PreparazioneForniture";

/** Dati inventati per illustrare la preparazione di una ristrutturazione, senza servizi remoti. */
export const fornitoriSimulazione = [
  { id:"sim-serramenti", name:"Alfa Serramenti", ambito:"Serramenti e controtelai", esempio:"Prezzi cad. + totale riga · IVA esclusa" },
  { id:"sim-oscuranti", name:"Beta Oscuranti", ambito:"Tapparelle, cassonetto e motori", esempio:"Prezzi già IVA inclusa" },
  { id:"sim-cartongesso", name:"Gamma Sistemi a Secco", ambito:"Cartongesso e accessori", esempio:"Quantità in pezzi, sacchi, rotoli e scatole" },
  { id:"sim-elettrico", name:"Delta Elettroforniture", ambito:"Materiale per impianto elettrico", esempio:"Totale fornitura 650 € netto, ripartito da 715 €" },
];
const articolo = (name:string,quantity:number,unita:string,costo:number,supplier_id:string,extra:Partial<OrderItem>={}):OrderItem => ({
  name,quantity,unita_misura:unita,purchase_price:costo,prezzo_fonte:"manuale",prezzo_da_definire:false,
  status:"da_ordinare",position:0,vat_rate:22,supplier_id,...extra,
});
const misure = (gruppo:string,riferimento:string,larghezza_mm:number,altezza_mm:number,profondita_mm?:number):Partial<OrderItem> => ({
  gruppo_id:`00000000-0000-4000-a000-${gruppo.padStart(12,"0")}`,riferimento,measure_status:"da_rilevare",
  misure_preventivo:{larghezza_mm,altezza_mm,...(profondita_mm ? {profondita_mm} : {})},
  description:"Misure di preparazione da verificare prima dell’ordine definitivo.",
});
const articoli:OrderItem[] = [
  articolo("Finestra PVC a due ante",1,"pz",620,"sim-serramenti",misure("1","Cucina",1200,1400)),
  articolo("Finestra PVC a due ante",1,"pz",690,"sim-serramenti",misure("1","Camera",1400,1500)),
  articolo("Finestra PVC a due ante",1,"pz",540,"sim-serramenti",misure("1","Cameretta",1000,1400)),
  articolo("Portafinestra PVC",1,"pz",890,"sim-serramenti",misure("2","Soggiorno",900,2300)),
  articolo("Controtelaio coibentato",4,"pz",85,"sim-serramenti"),
  articolo("Tapparella in alluminio",1,"pz",120,"sim-oscuranti",misure("3","Cucina",1200,1450)),
  articolo("Tapparella in alluminio",1,"pz",140,"sim-oscuranti",misure("3","Camera",1400,1550)),
  articolo("Tapparella in alluminio",1,"pz",160,"sim-oscuranti",misure("3","Soggiorno",900,2350)),
  articolo("Cassonetto coibentato",1,"pz",100,"sim-oscuranti",misure("4","Camera",1400,300,250)),
  articolo("Motore tubolare per tapparella",3,"pz",50,"sim-oscuranti"),
  articolo("Lastra cartongesso 1200 × 2000 mm",40,"pz",10.5,"sim-cartongesso"),
  articolo("Montante zincato 75 mm · barra 3 m",30,"pz",4.5,"sim-cartongesso"),
  articolo("Guida zincata 75 mm · barra 3 m",20,"pz",3.2,"sim-cartongesso"),
  articolo("Stucco per giunti · sacco 20 kg",4,"sacco",12.5,"sim-cartongesso"),
  articolo("Nastro per giunti · rotolo",3,"rotolo",4,"sim-cartongesso"),
  articolo("Viti cartongesso · scatola 1000 pz",2,"scatola",8,"sim-cartongesso"),
  articolo("Cavo FG16 3G2,5 mm²",150,"m",1.43,"sim-elettrico"),
  articolo("Tubo corrugato Ø 25 mm",100,"m",0.55,"sim-elettrico"),
  articolo("Presa Schuko",16,"pz",9.9,"sim-elettrico"),
  articolo("Interruttore magnetotermico",4,"pz",27.5,"sim-elettrico"),
  articolo("Quadro elettrico 24 moduli",1,"pz",137.5,"sim-elettrico"),
  articolo("Placca a tre posti",12,"pz",3.3,"sim-elettrico"),
];
const iniziali = articoli.map((a,i) => nuovaRigaPreparazione({...a,position:i},`sim-riga-${i+1}`));
const elettrico = ripartisciPreparazione(iniziali.filter(r=>r.articolo.supplier_id==="sim-elettrico"),"650",false,"valore","00000000-0000-4000-a000-000000000005");
export const righeSimulazione:RigaPreparazione[] = iniziali.map(r => {
  if(r.articolo.supplier_id==="sim-elettrico") return elettrico.find(e=>e.chiave===r.chiave)!;
  if(r.articolo.supplier_id==="sim-oscuranti") return {...r,prezzo:{versione:1,modo:"unitario",ivato:true,valore:String(Number(((r.articolo.purchase_price??0)*1.22).toFixed(2))).replace(".",",")}};
  if(r.articolo.name==="Controtelaio coibentato") return {...r,prezzo:{versione:1,modo:"totale",ivato:false,valore:"340"}};
  return r;
});
export const preparazioneSimulazione = {righe:righeSimulazione,forniture:{
  "sim-oscuranti":{ivato:true,totale:"",criterio:"valore"},
  "sim-elettrico":{ivato:false,totale:"650",criterio:"valore"},
} satisfies Record<string,TotaleFornitura>};

/** Le stesse voci sono ricercabili nel catalogo dimostrativo e hanno un fornitore automatico. */
export const catalogoSimulazione = [...new Map(articoli.map(a=>[a.name,a])).values()].map((a,i)=>({
  id:`sim-catalogo-${i+1}`,name:a.name,attivo:true,supplier_id:a.supplier_id,standard_cost:a.purchase_price,
  unit_of_measure:a.unita_misura,vat_rate:a.vat_rate,
  ...(a.gruppo_id ? {custom_field_values:{preparazione_articoli:"su_misura"}} : {}),
}));
