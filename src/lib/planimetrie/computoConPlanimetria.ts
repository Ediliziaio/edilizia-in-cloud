import { calcolaVoce, type BozzaComputo, type VoceEditor } from "@/lib/computo/editorNativo";
import type { VoceImportata } from "@/lib/computo/importaVoci";
import type { PlanimetriaComputoPdf } from "@/lib/computo/stampaPlanimetria";
import { ambitiDi, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { caricaPlanimetria, caricaVersione } from "./archivio";
import { studioVariante, type FonteStudio, type RigaStudio } from "./studioImmobiliare";

export function vociPerCommessaDallaVariante(bozza: BozzaComputo, documento: Planimetria): VoceImportata[] {
  const fonte = bozza.fontePlanimetria;
  if (!fonte || !ambitiDi(documento).some(a=>a.propostaId===fonte.varianteId)) throw new Error("Variante non disponibile per questo computo.");
  const righe = new Map(studioVariante(documento,fonte.varianteId).righe.map(r=>[r.id,r]));
  return bozza.voci.filter(v=>!v.opzionale).map((v): VoceImportata=>{
    const riga = righe.get(v.id);
    const {quantita,prezzo} = calcolaVoce(v);
    const sospesa = v.daQuantificare || !!riga?.quantificazioneSospesa;
    const prezzoValido = prezzo!==null && prezzo>=0;
    const chiave = v.chiavePlanimetria;
    const dallaPianta = !sospesa && chiave && riga?.chiave===chiave && v.misure.length===1 && quantita!==null
      && Math.abs(quantita)===riga.quantita && v.unita.trim()===riga.unita;
    return {
      ...v, origine:"variante-planimetria",
      ...(sospesa ? {quantita:"",misure:[],daQuantificare:true} : {}),
      ...(prezzoValido ? {} : {prezzo:""}),
      detrazione:v.detrazione || (quantita ?? 0)<0,
      avvisi:[
        ...(sospesa || quantita===null ? ["Quantità da completare"] : []),
        ...(riga?.quantificazioneSospesa ? [riga.criterio] : []),
        ...(prezzoValido ? [] : ["Prezzo da inserire"]),
      ],
      ...(dallaPianta ? {misuraPlanimetria:{id:fonte.planimetriaId,versione:fonte.versione,chiave}} : {}),
    };
  });
}

export async function preparaComputoConPlanimetria(companyId: string, fonte: FonteStudio) {
  const { riga, versione } = await caricaPlanimetria(fonte.planimetriaId);
  if (riga.company_id !== companyId) throw new Error("Planimetria non disponibile per questa azienda.");
  const revisione = versione.numero === fonte.versione ? versione : await caricaVersione(fonte.planimetriaId, fonte.versione);
  const { documento } = revisione;
  const variante = ambitiDi(documento).find(a => a.propostaId === fonte.varianteId);
  if (!variante) throw new Error("Variante non disponibile in questa versione.");
  const studio = studioVariante(documento, fonte.varianteId);
  const livelliLavorati = new Set(studio.righe.map(r => r.livelloId));
  const livelliVariante = documento.livelli.filter(p => p.proposte.some(a => a.id === fonte.varianteId));
  const piani = livelliLavorati.size ? livelliVariante.filter(p => livelliLavorati.has(p.id)) : livelliVariante;
  const [{ vistaDaPlanimetria }, { esportaSvg }, { svgInPng }] = await Promise.all([
    import("./esporta/adattatore"), import("./esporta/svg"), import("./esporta/png"),
  ]);
  const esiti = await Promise.allSettled(piani.slice(0, 2).map(async piano => {
    const vista = vistaDaPlanimetria(documento, { livelloId: piano.id, modo: "confronto", propostaId: fonte.varianteId }, revisione.quantita ?? undefined);
    const { svg, larghezzaMm, altezzaMm } = esportaSvg({ ...vista, testi: [], quote: [] }, {
      stile: "tecnico", scala: 100, quoteAutomatiche: false, margineMm: 5,
    });
    const scala = 1600 / Math.max(larghezzaMm, altezzaMm);
    const immagine = await svgInPng(svg, Math.max(1, Math.round(larghezzaMm * scala)), Math.max(1, Math.round(altezzaMm * scala)));
    return {
      nome: piano.nome, dati: new Uint8Array(await immagine.arrayBuffer()), larghezza: larghezzaMm, altezza: altezzaMm,
      nuovo: [...vista.muri, ...vista.aperture].some(a => a.stato === "nuovo"),
      demolito: [...vista.muri, ...vista.aperture].some(a => a.stato === "da_demolire"),
    };
  }));
  const tavole = esiti.flatMap(esito => esito.status === "fulfilled" ? [esito.value] : []);
  const pdf: PlanimetriaComputoPdf = { versione: fonte.versione, variante: variante.nome, tavole, numeroPiani: piani.length, misureStimate: studio.scalaIncerta };
  return { pdf, righe: studio.righe, scalaIncerta: studio.scalaIncerta };
}

export function verificaComputoConPlanimetria(voci: VoceEditor[], righe: RigaStudio[]) {
  const originali = new Map(righe.map(r => [r.id, r]));
  return voci.map((voce, indice) => {
    const riga = originali.get(voce.id);
    const quantita = calcolaVoce(voce, true).quantita;
    let stato: "pianta" | "indicativa" | "manuale" | "daMisurare";
    if (quantita === null || voce.daQuantificare) stato = "daMisurare";
    else if (!riga || riga.quantita !== quantita || riga.unita !== voce.unita.trim()) stato = "manuale";
    else if (riga.stimata || !riga.chiave) stato = "indicativa";
    else stato = "pianta";
    return { voce, indice, riga, quantita, stato };
  });
}
