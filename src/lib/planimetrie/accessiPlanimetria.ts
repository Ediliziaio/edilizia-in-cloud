import { assiDelMuro, distanzaDalContorno, puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import { eAmbienteInterno, type Apertura, type Locale, type Muro, type Planimetria, type Punto, type StatoPianta } from "../../../shared/planimetrie/modello.ts";
import { firmaRiscontroTecnico } from "../../../shared/planimetrie/urbanistica.ts";
import { eParteComune } from "./unita";

export interface EsitoAccesso {
  localeId: string;
  nome: string;
  dettaglio?: string;
  esito: "collegato" | "da_verificare" | "assente";
}

const MARGINE_CM = 4;
const NOMI_ESITI: Record<EsitoAccesso["esito"],string> = {
  collegato:"Collegamento disegnato",
  da_verificare:"Collegamento da verificare",
  assente:"Nessun accesso rilevato",
};
export const nomeEsitoAccesso = (esito: EsitoAccesso["esito"]) => NOMI_ESITI[esito];

function latoDelVano(locali: Locale[], p: Punto, interno: Punto): string[] {
  const dentro=locali.filter(l=>puntoNelPoligono(interno,l.contorno));
  if (dentro.length) return dentro.map(l=>l.id);
  return locali.filter(l=>distanzaDalContorno(p,l.contorno)<=MARGINE_CM).map(l=>l.id);
}

type VanoDiPassaggio = { apertura: Apertura; muro: Muro; centro: Punto; lati: [string[], string[]] };

export function vaniDiPassaggio(stato: StatoPianta): VanoDiPassaggio[] {
  const attivi = new Map(stato.muri.filter(m => m.stato !== "da_demolire").map(m => [m.id, m]));
  const vani: VanoDiPassaggio[] = [];
  for (const apertura of stato.aperture) {
    if (apertura.stato === "da_demolire" || apertura.tipo === "finestra" || apertura.sistema === "fisso" || !(apertura.larghezza > 0)) continue;
    const muro = attivi.get(apertura.muroId);
    if (!muro) continue;
    const { dir, normale } = assiDelMuro(muro);
    const offset = apertura.offset + apertura.larghezza / 2;
    const centro = { x: muro.p1.x + dir.x * offset, y: muro.p1.y + dir.y * offset };
    const lato = (segno: number) => {
      const faccia = { x: centro.x + normale.x * segno * muro.spessore / 2, y: centro.y + normale.y * segno * muro.spessore / 2 };
      const interno = { x: faccia.x + normale.x * segno * MARGINE_CM, y: faccia.y + normale.y * segno * MARGINE_CM };
      return latoDelVano(stato.locali, faccia, interno);
    };
    vani.push({ apertura, muro, centro, lati: [lato(1), lato(-1)] });
  }
  return vani;
}

/** Verifica i collegamenti ricostruiti nella tavola, anche attraverso un altro vano della proposta. */
export function controllaAccessiLocali(stato: StatoPianta, nuoviLocali: readonly string[]): EsitoAccesso[] {
  const bersagli=new Set(nuoviLocali);
  const locali=stato.locali;
  const daControllare=locali.filter(l=>bersagli.has(l.id));
  if (!daControllare.length) return [];
  const collegamenti=new Map(locali.map(l=>[l.id,new Set<string>()]));
  const incerti=new Set<string>();
  const accessibili=new Set(locali.filter(l=>!bersagli.has(l.id)).map(l=>l.id));

  for (const { muro, lati: ambienti } of vaniDiPassaggio(stato)) {
    const [sinistra,destra]=ambienti;
    if (sinistra.length===1 && destra.length===1) {
      if (sinistra[0]!==destra[0]) {
        collegamenti.get(sinistra[0])?.add(destra[0]);
        collegamenti.get(destra[0])?.add(sinistra[0]);
      }
    } else if (sinistra.length+destra.length===1 && muro.tipo==="esterno") {
      accessibili.add(sinistra[0] ?? destra[0]);
    } else {
      ambienti.flat().forEach(id=>incerti.add(id));
    }
  }

  const coda=[...accessibili];
  for (let i=0;i<coda.length;i++) {
    for (const id of collegamenti.get(coda[i]) ?? []) {
      if (accessibili.has(id)) continue;
      accessibili.add(id);
      coda.push(id);
    }
  }
  return daControllare.map(l=>({
    localeId:l.id,nome:l.nome,
    esito:accessibili.has(l.id) ? "collegato"
      : incerti.has(l.id) || l.aperto || (collegamenti.get(l.id)?.size ?? 0)>0 ? "da_verificare"
      : "assente",
  }));
}

export interface IngressoUnita {
  sigla: string;
  tipo: "diretto" | "comune" | "mancante";
  porta?: { id: string; larghezza: number; centro: Punto };
  ambientiScollegati: string[];
}

function cortileChiuso(stato: StatoPianta, vano: VanoDiPassaggio, verso: 1 | -1) {
  const { normale } = assiDelMuro(vano.muro);
  const distanza = vano.muro.spessore / 2 + MARGINE_CM;
  const fuori = { x: vano.centro.x + verso * normale.x * distanza, y: vano.centro.y + verso * normale.y * distanza };
  return (stato.aree ?? []).find(a => a.tipo === "lotto" && a.recinzione !== false && a.stato !== "da_demolire"
    && puntoNelPoligono(fuori, a.contorno)
    && !stato.elementi.some(e => ["cancello_pedonale", "cancello_carrabile"].includes(e.tipo) && e.stato !== "da_demolire"
      && distanzaDalContorno(e.posizione, a.contorno) <= Math.max(10, e.profondita / 2 + 5)));
}

/** Segue le porte disegnate partendo dal perimetro, attraverso le sole parti comuni e la singola unità. */
export function controllaIngressiUnita(stato: StatoPianta, accessoId?: string, quotaPiano = 0) {
  const vani = vaniDiPassaggio(stato);
  const unita = new Map<string, Locale[]>();
  const comuni = new Set<string>();
  const esterni = new Set(stato.locali.filter(l => quotaPiano === 0 &&
    (l.destinazione === "terrazzo" || l.destinazione === "giardino")).map(l => l.id));
  const latoEsterno = (lato: string[]) => !lato.length || (lato.length === 1 && esterni.has(lato[0]));
  for (const locale of stato.locali) {
    if (!eAmbienteInterno(locale)) continue;
    const sigla = locale.unita?.trim();
    if (!sigla) continue;
    if (eParteComune(sigla)) {
      comuni.add(locale.id);
    } else {
      const ambienti = unita.get(sigla) ?? [];
      ambienti.push(locale);
      unita.set(sigla, ambienti);
    }
  }

  const daFuori = new Map<string, VanoDiPassaggio>();
  const recinzioniChiuse = new Set<string>();
  const passaggi = new Map<string, Array<{ verso: string; vano: VanoDiPassaggio }>>();
  for (const vano of vani) {
    const [a, b] = vano.lati;
    if (a.length === 1 && b.length === 1 && a[0] !== b[0]) {
      for (const [da, verso] of [[a[0], b[0]], [b[0], a[0]]]) {
        const altri = passaggi.get(da) ?? [];
        altri.push({ verso, vano });
        passaggi.set(da, altri);
      }
    }
    if (vano.muro.tipo !== "esterno" || vano.apertura.tipo !== "porta" || (accessoId && vano.apertura.id !== accessoId)) continue;
    const fuoriA = latoEsterno(a), fuoriB = latoEsterno(b);
    if (fuoriA === fuoriB) continue;
    const interno = fuoriA ? b : a;
    if (interno.length !== 1) continue;
    const cortile = cortileChiuso(stato, vano, fuoriA ? 1 : -1);
    if (cortile) recinzioniChiuse.add(cortile.nome || "Lotto recintato");
    else daFuori.set(interno[0], vano);
  }

  function raggiungibili(partenze: string[], permessi: Set<string>) {
    const visti = new Set(partenze);
    const coda = [...visti];
    for (let i = 0; i < coda.length; i++) {
      for (const { verso } of passaggi.get(coda[i]) ?? []) {
        if (permessi.has(verso) && !visti.has(verso)) {
          visti.add(verso);
          coda.push(verso);
        }
      }
    }
    return visti;
  }

  const comuniRaggiunti = raggiungibili([...daFuori.keys()].filter(id => comuni.has(id)), comuni);
  const ingressi = [...unita].map(([sigla, ambienti]): IngressoUnita => {
    const propri = new Set(ambienti.map(l => l.id));
    const diretto = ambienti.find(l => daFuori.has(l.id));
    const daComune = ambienti.flatMap(l => (passaggi.get(l.id) ?? [])
      .filter(p => p.vano.apertura.tipo === "porta" && comuniRaggiunti.has(p.verso))
      .map(p => ({ id: l.id, vano: p.vano })))[0];
    const partenza = diretto ? { id: diretto.id, vano: daFuori.get(diretto.id)! } : daComune;
    const visti = partenza ? raggiungibili([partenza.id], propri) : new Set<string>();
    return {
      sigla,
      tipo: diretto ? "diretto" : daComune ? "comune" : "mancante",
      ...(partenza && { porta: { id: partenza.vano.apertura.id, centro: partenza.vano.centro, larghezza: partenza.vano.apertura.larghezza } }),
      ambientiScollegati: ambienti.filter(l => !visti.has(l.id)).map(l => l.nome),
    };
  });
  return { ingressi, vani, recinzioniChiuse: [...recinzioniChiuse] };
}

/** Controlla il piano attivo. In un alloggio senza sigle, segue gli accessi fra i locali interni. */
export function controllaAccessiPiano(stato: StatoPianta, alloggio = false, quotaPiano = 0) {
  const interni = stato.locali.filter(eAmbienteInterno);
  const senzaUnita = interni.filter(l => !l.unita?.trim());
  const haUnita = interni.some(l => l.unita?.trim() && !eParteComune(l.unita));
  const daVerificare = alloggio && !haUnita
    ? { ...stato, locali: stato.locali.map(l => eAmbienteInterno(l) ? { ...l, unita: "Alloggio" } : l) } : stato;
  const { ingressi, recinzioniChiuse } = controllaIngressiUnita(daVerificare, undefined, quotaPiano);
  return {
    ingressi, recinzioniChiuse,
    senzaUnita: haUnita ? senzaUnita : [],
    interni: interni.length,
  };
}

export function accessiDellaVariante(documento: Planimetria, varianteId: string) {
  return documento.livelli.flatMap(piano=>{
    const stato=piano.proposte.find(p=>p.id===varianteId);
    if (!stato) return [];
    const parti = new Set(stato.frazionamenti?.flatMap(f => f.parti));
    const sigle = new Set(stato.locali.filter(l => parti.has(l.id)).map(l => l.unita?.trim()));
    if (!stato.distribuzioneBilocali && !parti.size) return [];
    const esito = controllaIngressiUnita(piano.fatto.aree && !stato.aree ? {...stato,aree:piano.fatto.aree} : stato, undefined, piano.quota);
    const percorso = documento.urbanistica?.riscontriTecnici?.find(r=>r.criterio==="percorso" && r.livelloId===piano.id
      && r.varianteId===varianteId && r.firma===firmaRiscontroTecnico(documento,r));
    const nota = percorso ? percorso.esito==="criticita" ? "Criticità registrata dal tecnico" : "Percorso riscontrato dal tecnico" : piano.quota!==0 ? "Collegamento tra piani da riscontrare" : undefined;
    return esito.ingressi.filter(a => stato.distribuzioneBilocali || sigle.has(a.sigla)).map(a => ({
      localeId: piano.id + "-" + a.sigla, nome: "Unità " + a.sigla, piano: piano.nome,
      esito: a.tipo === "mancante" ? "assente" as const : a.ambientiScollegati.length || (piano.quota!==0 && percorso?.esito!=="riscontrato") || percorso?.esito==="criticita" ? "da_verificare" as const : "collegato" as const,
      dettaglio: a.tipo === "mancante" && esito.recinzioniChiuse.length ? "Cortile recintato senza cancello" :
        nota ?? (a.tipo === "comune" ? "Dal percorso comune" : a.tipo === "diretto" ? "Porta sul perimetro" : undefined),
    }));
  });
}
