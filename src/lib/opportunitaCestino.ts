/**
 * Cestino delle opportunità (17/09/2026): «Elimina» porta qui, sempre, e il
 * cestino non si svuota da solo. Qui la parte pura: com'è fatta una riga e la
 * ricerca.
 */

/** Quante se ne caricano, dalla più recente. */
export const LIMITE_CESTINO = 500;

/** Come arriva dal database, con contatto, pipeline e fase. */
export interface RigaCestinoGrezza {
  id: string;
  name: string | null;
  value: number | string | null;
  deleted_at: string;
  deleted_by: string | null;
  marketing_contacts?: { first_name: string | null; last_name: string | null; company_name: string | null } | null;
  marketing_pipelines?: { name: string | null } | null;
  marketing_pipeline_stages?: { name: string | null } | null;
}

export interface OpportunitaNelCestino {
  id: string;
  nome: string;
  contatto: string | null;
  pipeline: string | null;
  fase: string | null;
  valore: number | null;
  eliminataIl: string;
  /** Nome di chi l'ha eliminata; «un utente» se il nome non si legge, null se non si sa. */
  eliminataDa: string | null;
}

function pulito(testo: string | null | undefined): string {
  return (testo ?? "").trim();
}

export function rigaCestino(riga: RigaCestinoGrezza, autori: Record<string, string>): OpportunitaNelCestino {
  const c = riga.marketing_contacts;
  const persona = [pulito(c?.first_name), pulito(c?.last_name)].filter(Boolean).join(" ");
  const contatto = persona || pulito(c?.company_name) || null;
  const valore = riga.value === null || riga.value === "" ? NaN : Number(riga.value);
  return {
    id: riga.id,
    nome: pulito(riga.name) || contatto || "Opportunità senza nome",
    contatto,
    pipeline: pulito(riga.marketing_pipelines?.name) || null,
    fase: pulito(riga.marketing_pipeline_stages?.name) || null,
    valore: Number.isFinite(valore) && valore !== 0 ? valore : null,
    eliminataIl: riga.deleted_at,
    eliminataDa: riga.deleted_by ? autori[riga.deleted_by] ?? "un utente" : null,
  };
}

function normalizza(testo: string): string {
  return testo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Ogni parola cercata deve comparire in nome, contatto, pipeline, fase o autore. */
export function filtraCestino(righe: OpportunitaNelCestino[], cerca: string): OpportunitaNelCestino[] {
  const parole = normalizza(cerca).split(/\s+/).filter(Boolean);
  if (parole.length === 0) return righe;
  return righe.filter((r) => {
    const testo = normalizza([r.nome, r.contatto, r.pipeline, r.fase, r.eliminataDa].filter(Boolean).join(" "));
    return parole.every((p) => testo.includes(p));
  });
}
