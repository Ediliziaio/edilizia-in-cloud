import type { Planimetria } from "../../../../shared/planimetrie/modello.ts";
import { isModelloSimulato, ipotesiDiPartenza, type Ipotesi } from "./simulatore";
import type { Mese } from "./pianoConti";
import { studioVariante, type FonteStudio } from "@/lib/planimetrie/studioImmobiliare";
import { arrotondaDecimale, calcolaVoce, type BozzaComputo } from "@/lib/computo/editorNativo";

export function importoLavoriDaComputo(bozza: BozzaComputo, sospese: ReadonlySet<string> = new Set()) {
  const risultati = bozza.voci.filter(v => !v.opzionale).map(v => ({
    ...calcolaVoce(v), daQuantificare:v.daQuantificare || sospese.has(v.id),
  }));
  const incomplete = risultati.filter(r => r.daQuantificare || r.importo === null || r.errori.length).length;
  const daMisurare = risultati.filter(r=>r.daQuantificare || r.quantita===null).length;
  const daPrezzare = risultati.filter(r=>r.prezzo===null || r.prezzo<0).length;
  const totale = arrotondaDecimale(risultati.reduce((somma,r)=>somma+(r.importo ?? 0),0),2);
  return { importo:risultati.length && !incomplete && totale>=0 ? totale : null, incomplete, daMisurare, daPrezzare };
}

export function fonteDaParametri(params: URLSearchParams) {
  const planimetriaId = params.get("planimetria"), varianteId = params.get("variante"), modello = params.get("modello");
  const versione = Number(params.get("versione"));
  if (!planimetriaId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(planimetriaId) ||
    !varianteId || !/^[-\w]{1,36}$/.test(varianteId) || !Number.isSafeInteger(versione) || versione < 1 || !isModelloSimulato(modello)) return null;
  return { planimetriaId,varianteId,versione,modello };
}

export function ipotesiDaPlanimetria({ documento, fonte, inizio, importoComputo }: {
  documento:Planimetria; fonte:FonteStudio & { modello:Ipotesi["modello"] }; inizio:Mese; importoComputo:number|null;
}): {id:null; nome:string; ipotesi:Ipotesi} {
  const variante = documento.livelli.flatMap(l=>l.proposte).find(p=>p.id===fonte.varianteId);
  if (!variante) throw new Error("Variante non disponibile in questa versione.");
  const studio = studioVariante(documento,fonte.varianteId);
  if (!studio.unita.length || studio.sovrapposti.length) throw new Error("Verifica i perimetri e le assegnazioni prima di trasferire le unità.");
  if (studio.bagniDaRivedere.length || studio.cucineDaRivedere.length) throw new Error("Rivedi i locali dello spostamento prima di trasferire il costo lavori.");
  const ipotesi:Ipotesi = {
    ...ipotesiDiPartenza(fonte.modello,inizio),
    planimetria:{ planimetriaId:fonte.planimetriaId,varianteId:fonte.varianteId,versione:fonte.versione,confermata:false,computoImportato:importoComputo!==null },
    acquisto:0, impostePct:0, costoMq:0, oneri:0, tecniciPct:0, commercializzazionePct:0, imprevistiPct:0,
    mezziPropri:0, mutuo:{ importo:0,tassoPct:0,speseIniziali:0,rimborso:"vendite" },
    tipologie:studio.unita.map((u,i): Ipotesi["tipologie"][number] => ({
      id:`unita-${i+1}`,sigla:u.sigla,nome:`Unità ${u.sigla}`,quante:1,mq:u.mqCommerciali,prezzoMq:0,costoMq:null,
    })),
    ritocchi:importoComputo === null ? {} : { costruzione:{importo:importoComputo} },
  };
  return { id:null, nome:`${documento.titolo ?? "Immobile"} · ${variante.nome}`.slice(0,200), ipotesi };
}
