import {
  assiDelMuro, distanza, lunghezzaMuro, proiezioneSulSegmento,
} from "../../../shared/planimetrie/geometria.ts";
import {
  ambitiDi, origineMisura, type Apertura, type CampoMisura, type Muro, type Planimetria,
  type Punto, type Quota, type StatoPianta, type TipoApertura,
} from "../../../shared/planimetrie/modello.ts";
import { oscuranteAmmessi, sistemiAmmessi, zanzarieraAmmessa } from "../../../shared/planimetrie/serramenti.ts";
import { MISURE_APERTURA } from "@/components/planimetrie/editor/comandi";

export type SelezioneTavola = { tipo: "apertura" | "quota"; id: string };
export const NOMI_APERTURE: Record<TipoApertura, string> = {
  porta: "Porta", finestra: "Finestra", portafinestra: "Portafinestra", varco: "Varco",
};

const arrotonda = (n: number) => Math.round(n * 100) / 100;
const puntoArrotondato = (p: Punto) => ({x:arrotonda(p.x),y:arrotonda(p.y)});
const campiApertura = ["offset", "larghezza", "altezza", "davanzale"] as const satisfies CampoMisura[];
const EPS = 0.03;

export function aperturaDaVerificare(a: Apertura) {
  return campiApertura.some(c => origineMisura(a,c)==="stimata");
}

export function puntoSullAsse(muro: Muro, offset: number): Punto {
  const {dir}=assiDelMuro(muro);
  return {x:muro.p1.x+dir.x*offset,y:muro.p1.y+dir.y*offset};
}

export function lineaQuota(q: Quota): [Punto,Punto] {
  const l=distanza(q.p1,q.p2) || 1;
  const x=-(q.p2.y-q.p1.y)*q.scostamento/l;
  const y=(q.p2.x-q.p1.x)*q.scostamento/l;
  return [{x:q.p1.x+x,y:q.p1.y+y},{x:q.p2.x+x,y:q.p2.y+y}];
}

/** Il puntatore sceglie una parete vicina e porta il centro del vano sul suo asse. */
export function posizioneVano(stato: StatoPianta, punto: Punto, tipo: TipoApertura, larghezza?: number) {
  if (larghezza!==undefined && (!Number.isFinite(larghezza) || larghezza<=0)) {
    throw new Error("Indica la larghezza del vano prima di spostarlo.");
  }
  let scelta: {muro: Muro; centro: number; scarto: number} | undefined;
  for (const muro of stato.muri) {
    if (muro.stato==="da_demolire") continue;
    const proiezione=proiezioneSulSegmento(punto,muro.p1,muro.p2);
    const scarto=distanza(punto,proiezione.punto);
    const lunghezza=lunghezzaMuro(muro);
    if (lunghezza < (larghezza ?? 30) || scarto>muro.spessore/2+24 || (scelta && scarto>=scelta.scarto)) continue;
    scelta={muro,centro:proiezione.t*lunghezza,scarto};
  }
  if (!scelta) throw new Error("Scegli il punto su una parete abbastanza lunga.");
  const lunghezza=lunghezzaMuro(scelta.muro);
  const luce=larghezza ?? Math.min(MISURE_APERTURA[tipo].larghezza,lunghezza);
  return {
    muro:scelta.muro,
    larghezza:arrotonda(luce),
    offset:arrotonda(Math.max(0,Math.min(lunghezza-luce,scelta.centro-luce/2))),
  };
}

export function nuovaAperturaSullaTavola(stato: StatoPianta, punto: Punto, tipo: TipoApertura, progetto: boolean): Apertura {
  const {muro,larghezza,offset}=posizioneVano(stato,punto,tipo);
  const misure=MISURE_APERTURA[tipo];
  const davanzale=Math.min(misure.davanzale,Math.max(0,muro.altezza-30));
  return {
    id:crypto.randomUUID(),muroId:muro.id,tipo,larghezza,offset,davanzale,
    altezza:Math.min(misure.altezza,muro.altezza-davanzale),manovra:tipo==="varco" ? "nessuna" : "battente",
    stato:progetto ? "nuovo" : "esistente",origine:"stimata",
  };
}

export function conAperturaVerificata(stato: StatoPianta, proposta: Apertura, confermaMisure: boolean): StatoPianta {
  const muro=stato.muri.find(m=>m.id===proposta.muroId && m.stato!=="da_demolire");
  const apertura={...proposta,davanzale:proposta.tipo==="finestra" ? proposta.davanzale : 0};
  if (!muro || !campiApertura.every(c=>Number.isFinite(apertura[c]))) throw new Error("Compila le misure del vano e scegli una parete.");
  if (apertura.offset<0 || apertura.larghezza<=0 || apertura.offset+apertura.larghezza>lunghezzaMuro(muro)+EPS) {
    throw new Error("L’apertura deve rientrare nella lunghezza della parete.");
  }
  if (apertura.davanzale<0 || apertura.altezza<=0 || apertura.davanzale+apertura.altezza>muro.altezza+EPS) {
    throw new Error("Altezza e davanzale devono rientrare nell’altezza della parete.");
  }
  if (stato.aperture.some(a=>a.id!==apertura.id && a.muroId===muro.id && a.stato!=="da_demolire"
    && Math.min(a.offset+a.larghezza,apertura.offset+apertura.larghezza)-Math.max(a.offset,apertura.offset)>EPS)) {
    throw new Error("Il vano si sovrappone a un’apertura esistente.");
  }
  const precedente=stato.aperture.find(a=>a.id===apertura.id);
  const misureEffettive = ["luceNettaCm","superficieApribileMq","superficieIlluminanteMq"] as const;
  if (!confermaMisure && misureEffettive.some(c=>apertura[c]!==undefined && apertura[c]!==precedente?.[c])) {
    throw new Error("Conferma le misure effettive prima di applicarle.");
  }
  if (!confermaMisure && precedente && (apertura.tipo!==precedente.tipo || apertura.larghezza!==precedente.larghezza || apertura.altezza!==precedente.altezza
    || apertura.manovra!==precedente.manovra || apertura.sistema!==precedente.sistema || apertura.ante!==precedente.ante)) {
    for (const campo of misureEffettive) delete apertura[campo];
  }
  if (apertura.luceNettaCm !== undefined && (!Number.isFinite(apertura.luceNettaCm) || apertura.luceNettaCm <= 0 || apertura.luceNettaCm > apertura.larghezza)) {
    throw new Error("La luce netta deve essere positiva e rientrare nel vano.");
  }
  for (const [valore,nome] of [[apertura.superficieApribileMq,"apribile"],[apertura.superficieIlluminanteMq,"illuminante"]] as const) {
    if (valore !== undefined && (!Number.isFinite(valore) || valore < 0 || valore > apertura.larghezza*apertura.altezza/10000)) {
      throw new Error(`La superficie ${nome} deve rientrare nel vano finestrato.`);
    }
  }
  if (apertura.tipo==="varco" || (apertura.sistema && !sistemiAmmessi(apertura.tipo).includes(apertura.sistema))) {
    apertura.sistema=undefined;
    apertura.manovra=apertura.tipo==="varco" ? "nessuna" : "battente";
    apertura.verso=null;
  }
  if (apertura.oscurante && !oscuranteAmmessi(apertura.tipo).includes(apertura.oscurante)) {
    apertura.oscurante=undefined;
    apertura.cassonetto=undefined;
    apertura.altezzaCassonetto=undefined;
    apertura.motore=undefined;
  }
  if (!zanzarieraAmmessa(apertura.tipo)) apertura.zanzariera=undefined;
  apertura.origineMisure={...precedente?.origineMisure,...apertura.origineMisure};
  for (const c of campiApertura) {
    if (confermaMisure) apertura.origineMisure[c]="rilevata";
    else if (precedente && (apertura[c]!==precedente[c] || (c==="offset" && precedente.muroId!==apertura.muroId))) {
      apertura.origineMisure[c]="stimata";
    }
  }
  return {...stato,aperture:precedente ? stato.aperture.map(a=>a.id===apertura.id ? apertura : a) : [...stato.aperture,apertura]};
}

export function conQuotaVerificata(stato: StatoPianta, quota: Quota, misura: number, scostamento: number, confermaMisura: boolean): StatoPianta {
  const l=distanza(quota.p1,quota.p2);
  if (!Number.isFinite(misura) || misura<=0 || l<=EPS || !Number.isFinite(scostamento)) {
    throw new Error("Indica una distanza positiva e scegli due punti distinti.");
  }
  const p2=puntoArrotondato({
    x:quota.p1.x+(quota.p2.x-quota.p1.x)*misura/l,
    y:quota.p1.y+(quota.p2.y-quota.p1.y)*misura/l,
  });
  if (distanza(quota.p1,p2)<=EPS) throw new Error("I punti della quota sono troppo vicini.");
  const precedente=stato.quote.find(q=>q.id===quota.id);
  const geometriaCambiata=!precedente || distanza(precedente.p1,quota.p1)>EPS || distanza(precedente.p2,p2)>EPS;
  const nuova={...quota,p2,scostamento,origine:confermaMisura ? "rilevata" as const : geometriaCambiata ? "stimata" as const : quota.origine};
  return {...stato,quote:precedente ? stato.quote.map(q=>q.id===quota.id ? nuova : q) : [...stato.quote,nuova]};
}

export function togliDallaTavola(stato: StatoPianta, selezione: SelezioneTavola, progetto: boolean): StatoPianta {
  if (selezione.tipo==="quota") return {...stato,quote:stato.quote.filter(q=>q.id!==selezione.id)};
  const apertura=stato.aperture.find(a=>a.id===selezione.id);
  if (progetto && apertura?.stato==="esistente") {
    return {...stato,aperture:stato.aperture.map(a=>a.id===selezione.id ? {...a,stato:"da_demolire"} : a)};
  }
  return {...stato,aperture:stato.aperture.filter(a=>a.id!==selezione.id)};
}

/** La revisione scrive un solo piano e la rappresentazione selezionata. */
export function salvaRevisioneTavola(documento: Planimetria, livelloId: string, ambito: string, stato: StatoPianta): Planimetria {
  const variante=ambitiDi(documento).find(a=>a.chiave===ambito);
  return {...documento,livelli:documento.livelli.map(piano=>{
    if (piano.id!==livelloId) return piano;
    if (!variante?.propostaId) return {...piano,fatto:stato};
    const precedente=piano.proposte.find(p=>p.id===variante.propostaId);
    const proposta={...precedente,...stato,id:variante.propostaId,nome:variante.nome};
    return {...piano,proposte:precedente ? piano.proposte.map(p=>p.id===proposta.id ? proposta : p) : [...piano.proposte,proposta]};
  })};
}
