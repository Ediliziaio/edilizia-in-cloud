import { arrotonda } from "./pianoConti";
import { vociIpotesi, type Ipotesi, type VoceSimulata } from "./simulatore";

const MASSIMO_CENTESIMI = Number.MAX_SAFE_INTEGER;

function totali(voci: VoceSimulata[]) {
  const ricavi = arrotonda(voci.filter(v=>v.tipo === "ricavo").reduce((s,v)=>s+v.importo,0));
  const costi = arrotonda(voci.filter(v=>v.tipo === "costo").reduce((s,v)=>s+v.importo,0));
  const margine = arrotonda(ricavi-costi);
  return { ricavi,costi,margine,marginePct:ricavi > 0 ? margine/ricavi : null };
}

/** Cerca un prezzo a centesimi sui valori ricalcolati dal simulatore. */
function prezzoObiettivo(raggiunge: (prezzo: number) => boolean, partenza: number) {
  if (raggiunge(0)) return 0;
  let basso = 0, alto = Math.min(MASSIMO_CENTESIMI,Math.max(1,Math.round(partenza*100)));
  while (!raggiunge(alto/100)) {
    if (alto === MASSIMO_CENTESIMI) return null;
    basso = alto;
    alto = Math.min(MASSIMO_CENTESIMI,alto*2);
  }
  while (alto-basso > 1) {
    const mezzo = basso+Math.floor((alto-basso)/2);
    if (raggiunge(mezzo/100)) alto = mezzo;
    else basso = mezzo;
  }
  return alto/100;
}

export function preparaProveVendita(riferimento: Ipotesi, progetto: Ipotesi) {
  const correnti = vociIpotesi(progetto);
  const vendite = new Map(correnti.filter(v=>!v.aggiunta && v.categoria === "vendite").map(v=>[v.chiave,v.importo]));
  const tipologie = progetto.tipologie.filter(t=>t.quante > 0 || (vendite.get(`vendite:${t.id}`) ?? 0) > 0);
  if (!tipologie.length) return null;
  const attuale = arrotonda(Array.from(vendite.values()).reduce((s,n)=>s+n,0));
  const pesi = tipologie.map(t=>attuale > 0 ? vendite.get(`vendite:${t.id}`) ?? 0 : t.quante);
  const sommaPesi = pesi.reduce((s,n)=>s+n,0);
  const base = totali(vociIpotesi(riferimento));
  const simula = (prezzo: number) => {
    const centesimi = Math.round(prezzo*100);
    if (prezzo < 0 || !Number.isSafeInteger(centesimi)) return null;
    const ritocchi = {...progetto.ritocchi};
    let cumulata = 0, assegnati = 0;
    tipologie.forEach((t,i)=>{
      const chiave = `vendite:${t.id}`;
      cumulata += pesi[i];
      const fino = i === tipologie.length-1 ? centesimi : Math.round(centesimi*(cumulata/sommaPesi));
      ritocchi[chiave] = {...ritocchi[chiave],importo:(fino-assegnati)/100};
      assegnati = fino;
    });
    const dati = totali(vociIpotesi({...progetto,ritocchi}));
    return {...dati,prezzo:centesimi/100,differenza:arrotonda(dati.margine-base.margine)};
  };
  const partenza = Math.max(attuale,base.ricavi,1);
  const prezzoPariEuro = prezzoObiettivo(p=>(simula(p)?.margine ?? -Infinity) >= base.margine,partenza);
  const marginePctBase = base.marginePct;
  const prezzoPariPercentuale = marginePctBase === null ? null :
    prezzoObiettivo(p=>(simula(p)?.marginePct ?? -Infinity) >= marginePctBase,partenza);
  return { base,attuale,prezzoPariEuro,prezzoPariPercentuale,simula };
}
