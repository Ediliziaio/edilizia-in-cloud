export interface VoceComputoPos {
  id: string;
  codice: string;
  titolo: string;
  capitolo: string;
  quantita?: number;
  unita?: string;
}
export interface IdentitaPscSchedaPos {
  id: string;
  revisione: string;
  sha256: string;
}
export interface FontePscSchedaPos extends IdentitaPscSchedaPos {
  estratti: Array<{ pagina: number; testo: string; metodo?: "ocr"; confermato?: boolean }>;
}

export interface FontiSchedaPos {
  standard?: { id: string; versione: number };
  computo?: { id: string; titolo: string; voci: VoceComputoPos[] };
  psc?: FontePscSchedaPos;
  quesiti?: Array<{ domanda: string; risposta: string }>;
}

export const chiaveFasePos = (faseId: string) => `fase:${faseId}`;
export const chiaveVoceComputoPos = (computoId: string, voceId: string) => `computo:${computoId}:${voceId}`;

export function chiaviFontiLavorazionePos({ fase_id, fonti_scheda }: { fase_id?: string | null; fonti_scheda?: FontiSchedaPos }) {
  const computo = fonti_scheda?.computo;
  return [
    ...(fase_id ? [chiaveFasePos(fase_id)] : []),
    ...(computo?.voci.map(voce => chiaveVoceComputoPos(computo.id, voce.id)) ?? []),
  ];
}

const oggetto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const testo = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
const array = (v: unknown, max: number) => Array.isArray(v) ? v.slice(0, max).map(oggetto) : [];

export function normalizzaIdentitaPscSchedaPos(v: unknown): IdentitaPscSchedaPos | undefined {
  const o = oggetto(v);
  const id = testo(o.id, 64), revisione = testo(o.revisione, 80), sha256 = testo(o.sha256, 64).toLowerCase();
  return id && revisione && /^[a-f0-9]{64}$/.test(sha256) ? { id, revisione, sha256 } : undefined;
}

export function normalizzaFontiSchedaPos(value: unknown): FontiSchedaPos | undefined {
  const o = oggetto(value);
  const standard = oggetto(o.standard);
  const computo = oggetto(o.computo);
  const psc = oggetto(o.psc);
  const idStandard = testo(standard.id, 64);
  const versione = standard.versione;
  const idComputo = testo(computo.id, 64);
  const identitaPsc = normalizzaIdentitaPscSchedaPos(psc);
  const voci = array(computo.voci, 20).flatMap(v => {
    const id = testo(v.id, 80);
    const titolo = testo(v.titolo, 320);
    if (!id || !titolo) return [];
    return [{
      id, titolo, codice: testo(v.codice, 80), capitolo: testo(v.capitolo, 180),
      ...(typeof v.quantita === "number" && Number.isFinite(v.quantita) ? { quantita: v.quantita } : {}),
      ...(typeof v.unita === "string" ? { unita: testo(v.unita, 24) } : {}),
    }];
  });
  const estratti = array(psc.estratti, 8).flatMap(p => {
    const estratto = testo(p.testo, 450);
    return typeof p.pagina === "number" && Number.isInteger(p.pagina) && p.pagina > 0 && estratto
      ? [{ pagina: p.pagina, testo: estratto, ...(p.metodo === "ocr" ? { metodo: "ocr" as const, confermato: p.confermato === true } : {}) }] : [];
  });
  const quesiti = array(o.quesiti, 8).flatMap(q => {
    const domanda = testo(q.domanda, 260);
    return domanda ? [{ domanda, risposta: testo(q.risposta, 1500) }] : [];
  });
  const fonti: FontiSchedaPos = {
    ...(idStandard && typeof versione === "number" && Number.isSafeInteger(versione) && versione > 0
      ? { standard: { id: idStandard, versione } } : {}),
    ...(idComputo && voci.length ? { computo: { id: idComputo, titolo: testo(computo.titolo, 200), voci } } : {}),
    ...(identitaPsc && estratti.length ? { psc: { ...identitaPsc, estratti } } : {}),
    ...(quesiti.length ? { quesiti } : {}),
  };
  return Object.keys(fonti).length ? fonti : undefined;
}

export function pscSchedaDaRiesaminare(fonte: IdentitaPscSchedaPos | undefined, corrente?: IdentitaPscSchedaPos | null) {
  return !!fonte && (fonte.id !== corrente?.id || fonte.revisione !== corrente.revisione || fonte.sha256 !== corrente.sha256);
}

export const ocrPscDaConfermare = (fonte?: FontePscSchedaPos) =>
  !!fonte?.estratti.some(r => r.metodo === "ocr" && !r.confermato);
