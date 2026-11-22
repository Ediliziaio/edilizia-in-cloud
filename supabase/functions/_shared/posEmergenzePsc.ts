import { CAMPI_EMERGENZE_POS, type CampoEmergenzePos, type PianoEmergenzePos } from "./posEvidenzeOperative.ts";
import { normalizzaIdentitaPscSchedaPos, pscSchedaDaRiesaminare, type IdentitaPscSchedaPos } from "./posFontiScheda.ts";
import type { PscPerPos } from "./posAiFonti.ts";

export interface IndicazioneEmergenzaPsc extends IdentitaPscSchedaPos {
  pagina: number;
  estratto: string;
  metodo: "testo" | "ocr";
  fase?: string;
}
export const LIMITE_ESTRATTI_EMERGENZA = 4;
export type FontiEmergenzePsc = Partial<Record<CampoEmergenzePos, IndicazioneEmergenzaPsc[]>>;
export type PropostaEmergenzaPsc = IndicazioneEmergenzaPsc & { campo: CampoEmergenzePos };

const campi = Object.keys(CAMPI_EMERGENZE_POS) as CampoEmergenzePos[];
const oggetto = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const testoUnito = (v: string) => v.normalize("NFC").replace(/\s+/g, " ").trim();

export function normalizzaFontiEmergenzePsc(value: unknown): FontiEmergenzePsc | undefined {
  const o = oggetto(value);
  const entries = campi.flatMap(k => {
    const raw = o[k];
    const fonti = (Array.isArray(raw) ? raw.slice(0, LIMITE_ESTRATTI_EMERGENZA) : [raw]).flatMap(v => {
      const r = oggetto(v);
      const identita = normalizzaIdentitaPscSchedaPos(r);
      const e = typeof r.estratto === "string" ? testoUnito(r.estratto) : "";
      const fase = typeof r.fase === "string" ? testoUnito(r.fase).slice(0, 100) : "";
      if (!identita || !e || e.length > 600 || typeof r.pagina !== "number" || !Number.isSafeInteger(r.pagina) ||
          r.pagina < 1 || r.pagina > 9999 || (r.metodo !== "testo" && r.metodo !== "ocr")) return [];
      return [{ ...identita, pagina: r.pagina, estratto: e, metodo: r.metodo, ...(fase ? { fase } : {}) }];
    });
    return fonti.length ? [[k, fonti]] : [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function testoIndicazioniEmergenza(fonti: IndicazioneEmergenzaPsc[]): string {
  return fonti.map(f => f.fase ? `${f.fase} — ${f.estratto}` : f.estratto).join("\n");
}

export function fontiEmergenzeDaRiesaminare(fonti: FontiEmergenzePsc | undefined, piano: PianoEmergenzePos | undefined, corrente?: IdentitaPscSchedaPos) {
  return campi.filter(k => {
    const estratti = fonti?.[k];
    return !!estratti?.length && (
      estratti.some(f => pscSchedaDaRiesaminare(f, corrente)) ||
      (estratti.length > 1 && estratti.some(f => !f.fase)) ||
      testoUnito(piano?.[k] ?? "") !== testoUnito(testoIndicazioniEmergenza(estratti))
    );
  });
}

const ARGOMENTI: Record<CampoEmergenzePos, RegExp> = {
  raccolta: /punt[oi] (?:di )?(?:ritrovo|raccolta|raduno)|luog[oh]i? sicur[oi] (?:estern[oi] )?(?:di raccolta|per il raduno)/i,
  esodo: /vi[ae] (?:di |d['’])?(?:esodo|fuga)|percors[oi] (?:di |d['’])?(?:esodo|evacuazione)|uscit[ae] (?:di |d['’])?emergenza/i,
  primo_soccorso: /cassett[ae] (?:di |del )?(?:pronto|primo) soccorso|presid[io]+ (?:di |del )?(?:pronto|primo) soccorso|pacchett[oi] di medicazione/i,
  antincendio: /\bestintor[ei]\b|\bidrant[ei]\b|presid[io]+ antincendio/i,
  accesso_soccorsi: /(?:mezz[oi]|veicol[oi]) (?:di |del )?(?:soccorso|emergenza)|accesso (?:per |de[il] )?(?:i )?soccors[oi]|\bambulan[sz][ae]\b/i,
  allarme: /\ballarme\b|chiamat[ae] (?:al |dei )?(?:soccorsi|112|118|115)|numero unico di emergenza/i,
  planimetria: /planimetri[ae] (?:di |delle |del )?(?:cantiere|emergenz[ae]|evacuazione|esodo)|layout (?:di |del )cantiere|tavol[ae] (?:di |delle )?(?:evacuazione|emergenz[ae]|esodo)/i,
};
const OPERATIVO: Record<CampoEmergenzePos, RegExp> = {
  raccolta: /presso |accanto |davanti |in via |cancello|cortile|piazzal|parcheggi|ingress[oi]|portineria|lato (?:nord|sud|est|ovest)|area (?:nord|sud|est|ovest)/i,
  esodo: /presso |attraverso |porta |cancello|scala|corridoio|rampa|verso |imbocc|lato (?:nord|sud|est|ovest)/i,
  primo_soccorso: /presso |accanto |baracca|infermeria|portineria|ubicat|collocat|installat|deposito|locale/i,
  antincendio: /presso |accanto |baracca|portineria|ubicat|collocat|installat|deposito|locale|uscita|cancello/i,
  accesso_soccorsi: /(?:da|dal|dalla|attraverso|tramite|via) |cancello|sbarra|varco|ingresso/i,
  allarme: /azion|attiv|avvis|contatt|telefon|chiama|comunica|avvert|sirena|segnale|\b(?:112|115|118)\b/i,
  planimetria: /allegat[oa]|\brevisione\b|rif[.]?\s|\b(?:tav|tab)[.]?\s|\b[A-Z]{1,5}[-– ]?\d{1,4}\b/i,
};
const PROVVISORIO = /\[[^\]]*(?:illeggibile|da inserire)[^\]]*\]|da (?:definire|indicare|individuare|concordare|completare|stabilire)|segnaposto|fac[ -]?simile|da compilare|\.\s*\.\s*\./i;

/** Riprende solo testo presente nella pagina. Quando il PSC ha indicazioni diverse, le lascia come alternative. */
export function proponiEmergenzeDalPsc(psc: PscPerPos): PropostaEmergenzaPsc[] {
  const { id, revisione, sha256 } = psc.riferimento;
  const risultati = new Map<CampoEmergenzePos, PropostaEmergenzaPsc[]>();
  for (const pagina of psc.pagine) {
    const righe = pagina.testo.split(/\r?\n/).map(testoUnito).filter(Boolean);
    for (const [indice, riga] of righe.entries()) {
      for (const campo of campi) {
        if (!ARGOMENTI[campo].test(riga)) continue;
        const dopo = righe[indice + 1];
        const puoContinuare = dopo && !campi.some(k => ARGOMENTI[k].test(dopo)) &&
          !/[.!?;]$/.test(riga) && (riga.endsWith(":") || !OPERATIVO[campo].test(riga));
        const precedente = righe[indice - 1];
        const riportaRinvio = campo === "planimetria" && precedente && ARGOMENTI.raccolta.test(precedente) &&
          /(?:individuat|indicat|riportat|rimand)/i.test(precedente) && !/[.!?;]$/.test(precedente);
        const estratto = (riportaRinvio ? precedente + " " + riga : puoContinuare ? riga + " " + dopo : riga).trim();
        if (campo === "raccolta" && ARGOMENTI.planimetria.test(estratto) &&
          /(?:individuat|indicat|riportat|rimand).{0,80}(?:layout|planimetri|tavol)/i.test(estratto)) continue;
        if (estratto.length < 26 || estratto.length > 600 || PROVVISORIO.test(estratto) || !OPERATIVO[campo].test(estratto)) continue;
        const alternative = risultati.get(campo) ?? [];
        if (alternative.length >= LIMITE_ESTRATTI_EMERGENZA || alternative.some(r => r.estratto === estratto)) continue;
        const fase = /^(Fase\s+(?:\d{1,3}|[A-Z]))\s*[.·:–-]\s/i.exec(riga)?.[1];
        alternative.push({ campo, id, revisione, sha256, pagina: pagina.pagina, estratto, metodo: pagina.metodo === "ocr" ? "ocr" : "testo", ...(fase ? { fase } : {}) });
        risultati.set(campo, alternative);
      }
    }
  }
  return campi.flatMap(campo => risultati.get(campo) ?? []);
}
