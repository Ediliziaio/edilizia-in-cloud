import type { DisegnoCommercialeFv } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";

/** Unica quantità: i moduli presenti nel disegno alimentano le righe native. */
export function datiDalDisegno(piano: DisegnoCommercialeFv, potenzaModuloW: number, extraOriginali?: Array<{uid?:string;listino_id:string|null;descrizione:string;quantita:number;prezzo_vendita:number;prezzo_acquisto:number|null}>) {
  if (!Number.isFinite(potenzaModuloW) || potenzaModuloW <= 0) throw new Error("Seleziona un pannello con potenza dichiarata.");
  const extra=extraOriginali?.filter(r=>!r.uid?.startsWith("fv-industriale-")),costi=piano.industriale?.costi;
  if(extra&&costi){
    if(costi.strutturaModulo>0)extra.push({uid:"fv-industriale-struttura",listino_id:null,descrizione:"Strutture e fissaggi fotovoltaico",quantita:piano.pannelli.length,prezzo_vendita:costi.strutturaModulo,prezzo_acquisto:null});
    if(costi.inverterAggiuntivi>0)extra.push({uid:"fv-industriale-inverter",listino_id:null,descrizione:"Inverter aggiuntivi · specifiche da confermare",quantita:costi.inverterAggiuntivi,prezzo_vendita:costi.prezzoInverter,prezzo_acquisto:null});
  }
  return { ...(extra?{prodotti_extra:extra}:{}),
    layout_overlay: piano,
    numero_pannelli_scelti: piano.pannelli.length,
    potenza_kwp: Math.round(piano.pannelli.length * potenzaModuloW) / 1000,
  };
}
