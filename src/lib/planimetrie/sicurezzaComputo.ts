/**
 * Gli oneri della sicurezza nel computo che nasce dalla pianta (25/11/2026).
 *
 * La previsione dei lavori li contava fra i «costi in più» (impianto di cantiere, oneri della
 * sicurezza), ma nel computo non arrivavano: il documento scriveva «gli oneri di sicurezza
 * eventualmente indicati sono già compresi», e non c'erano. Qui diventano voci a corpo segnate
 * «sicurezza»: il PDF le dice non soggette a ribasso e lo sconto non le tocca. Si calcolano sui
 * lavori della pianta come nella previsione (stesse percentuali di COSTI_EXTRA) e si correggono
 * con il piano di sicurezza e coordinamento quando c'è.
 */
import { voceVuota, type VoceEditor } from "@/lib/computo/editorNativo";
import { COSTI_EXTRA, extraPredefiniti } from "./previsioneLavori";
import type { RigaStudio } from "./studioImmobiliare";

/** Spese generali 15% e utile 10% (art. 32 DPR 207/2010): prezzo di vendita → costo stimato. */
export const RICARICO_PREZZARIO = 1.15 * 1.10;

/** I «costi in più» che sono costi della sicurezza (D.Lgs. 81/2008, all. XV: apprestamenti, impianti di cantiere, misure di coordinamento). */
const DELLA_SICUREZZA = ["cantiere", "cantiere_costruzione", "sicurezza"] as const;

/** Le voci del Prezzario regionale nella parte S (sicurezza): «S 1.01.3.3.a», il ponteggio. */
export const eVoceDellaSicurezza = (tariffa: string | undefined) => /^S\s+\d/.test((tariffa ?? "").trim());

const euro = (n: number) => Math.round(n * 100) / 100;
const formato = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function vociDellaSicurezza(righe: readonly RigaStudio[], capitolo: string): VoceEditor[] {
  // La base: i lavori quotati della pianta, senza quelli a parte (proposti, fuori dal totale).
  const lavori = euro(righe.reduce((s, r) => s + (!r.aParte && r.prezzo && r.quantita ? r.prezzo.importo * r.quantita : 0), 0));
  if (!(lavori > 0)) return [];
  const accesi = new Set(extraPredefiniti(righe));
  return COSTI_EXTRA.filter((e) => (DELLA_SICUREZZA as readonly string[]).includes(e.id) && accesi.has(e.id)).map((e) => {
    const importo = e.regola.tipo === "percentuale" ? euro(lavori * e.regola.percento / 100) : e.regola.importo;
    const criterio = e.regola.tipo === "percentuale" ? `${e.regola.percento}% dei lavori (${formato(lavori)} €)` : "Valore tipico a corpo";
    return {
      ...voceVuota(), id: `sicurezza:${e.id}`, capitolo, categoria: "Costi della sicurezza",
      descrizione: `${e.nome}\nEdificio · ${criterio}`,
      unita: "a corpo", quantita: "1", corpo: true, sicurezza: true,
      prezzo: String(importo), costo: String(euro(importo / RICARICO_PREZZARIO)),
      fonte: "Stima della previsione dei lavori, da sostituire con il piano di sicurezza e coordinamento",
      noteMisure: `${e.perche}. Non soggetto a ribasso.`,
    };
  });
}
