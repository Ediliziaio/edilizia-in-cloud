import type { PersonaRequisiti, QualificaContesto } from "./requisitiAddetti";

export interface RiesameProprioPos {
  versione: 1;
  company_id: string;
  order_id: string;
  id: string;
  revisione: number;
  dal: string;
  al: string;
  fase_id: string | null;
  attivita: string;
  responsabile: string;
  ruolo_responsabile: string;
  registrato_il: string;
  impronta: string;
  persone: PersonaRequisiti[];
  criteri: Array<{ profilo_id: string; requisito: { id: string } }>;
  riscontri: Array<{
    persona_id: string;
    nominativo: string;
    mansione: string | null;
    profilo_id: string;
    profilo_nome: string;
    profilo_versione: number;
    requisito_id: string;
    titolo: string;
    esito: "riesaminata" | "non_applicabile";
    motivazione: string;
    qualifica: (QualificaContesto & { fonte_id: string }) | null;
  }>;
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const hash = (v: unknown) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const day = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Validate the response boundary; never silently accept an external roster or open row. */
export function leggiRiesameProprioPos(
  v: unknown,
  company: string,
  ordine: string,
  id: string,
): RiesameProprioPos {
  const a = object(v),
    persone = a.persone,
    righe = a.riscontri,
    requisiti = a.criteri;
  const invalid = () => {
    throw new Error(
      "Dati della propria impresa non pertinenti o incompleti: rileggi il riesame",
    );
  };
  if (
    a.versione !== 1 ||
    a.company_id !== company ||
    a.order_id !== ordine ||
    a.id !== id ||
    !hash(a.impronta) ||
    !Number.isInteger(a.revisione) ||
    Number(a.revisione) < 1 ||
    !day(a.dal) ||
    !day(a.al) ||
    String(a.al) < String(a.dal) ||
    (a.fase_id !== null && !uuid(a.fase_id)) ||
    !text(a.attivita) ||
    !text(a.responsabile) ||
    !text(a.ruolo_responsabile) ||
    !text(a.registrato_il) ||
    !Array.isArray(persone) ||
    persone.length < 1 ||
    persone.length > 100 ||
    !Array.isArray(righe) ||
    righe.length < 1 ||
    righe.length > 500 ||
    !Array.isArray(requisiti) ||
    requisiti.length < 1 ||
    requisiti.length > 50
  )
    return invalid();
  const ids = new Set<string>();
  for (const v of persone) {
    const p = object(v);
    if (
      p.tipo !== "hr" ||
      !uuid(p.id) ||
      p.attivo !== true ||
      ids.has(String(p.id)) ||
      "subappaltatore_id" in p ||
      "impresa" in p
    )
      return invalid();
    if (
      !Array.isArray(p.periodi) ||
      !p.periodi.length ||
      p.periodi.some((v) => {
        const periodo = object(v);
        return (
          !day(periodo.dal) ||
          !day(periodo.al) ||
          String(periodo.al) < String(periodo.dal) ||
          String(periodo.dal) < String(a.dal) ||
          String(periodo.al) > String(a.al) ||
          typeof periodo.senza_date !== "boolean"
        );
      })
    )
      return invalid();
    ids.add(String(p.id));
  }
  const chiavi = new Set<string>(),
    criteri = new Set<string>();
  for (const v of requisiti) {
    const r = object(v),
      requisito = object(r.requisito);
    const key = `${r.profilo_id}:${requisito.id}`;
    if (!uuid(r.profilo_id) || !uuid(requisito.id) || criteri.has(key))
      return invalid();
    criteri.add(key);
  }
  for (const v of righe) {
    const r = object(v),
      q = object(r.qualifica),
      dati = object(q.dati);
    const criterio = `${r.profilo_id}:${r.requisito_id}`,
      chiave = `${r.persona_id}:${criterio}`;
    if (
      !ids.has(String(r.persona_id)) ||
      !uuid(r.profilo_id) ||
      !uuid(r.requisito_id) ||
      !text(r.nominativo) ||
      !text(r.titolo) ||
      !text(r.motivazione) ||
      !text(r.profilo_nome) ||
      !Number.isInteger(r.profilo_versione) ||
      Number(r.profilo_versione) < 1 ||
      chiavi.has(chiave) ||
      !criteri.has(criterio) ||
      !["riesaminata", "non_applicabile"].includes(String(r.esito))
    )
      return invalid();
    chiavi.add(chiave);
    if (r.esito === "non_applicabile") {
      if (r.qualifica !== null) return invalid();
    } else if (
      q.persona_tipo !== "hr" ||
      q.persona_id !== r.persona_id ||
      q.stato !== "riesaminata" ||
      q.fonte_corrente !== true ||
      !uuid(q.id) ||
      !uuid(q.fonte_id) ||
      !hash(q.fonte_impronta) ||
      !text(dati.titolo) ||
      !day(dati.validita_dal)
    )
      return invalid();
  }
  if (chiavi.size !== ids.size * criteri.size) return invalid();
  return v as RiesameProprioPos;
}
