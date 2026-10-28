import type { DatiQualifica, TipoPersonaQualifica } from "./qualificheAddetti";
import type { ProfiloRequisiti, RequisitoProfilo } from "./profiliRequisiti";
import { voceCatalogo } from "./catalogoDocumenti";
import type { MezzoFontePos } from "../../../supabase/functions/_shared/posMezzi";
export interface PersonaRequisiti {
  tipo: TipoPersonaQualifica;
  id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
  attivo: boolean;
  subappaltatore_id?: string;
  impresa?: string;
  periodi: Array<{
    fonte: string;
    fonte_id: string;
    fase_id: string | null;
    dal: string;
    al: string;
    senza_date: boolean;
  }>;
}
export interface QualificaContesto {
  id: string;
  famiglia_id: string;
  versione: number;
  persona_tipo: TipoPersonaQualifica;
  persona_id: string;
  stato: "riesaminata" | "revocata";
  dati: DatiQualifica;
  fonte_corrente: boolean;
  fonte_impronta: string;
  contesto_originale: {
    order_id: string | null;
    fase_id: string | null;
    dal: string | null;
    al: string | null;
  };
}
export interface QuadroAddetti {
  company_id: string;
  order_id: string;
  dal: string;
  al: string;
  fase_id: string | null;
  impronta: string;
  persone: PersonaRequisiti[];
  da_collegare: Array<{
    chiave: string;
    fonte: string;
    fonte_id: string;
    nome: string | null;
    cognome: string | null;
    motivo: string;
  }>;
  qualifiche: QualificaContesto[];
}
export interface SelezioneRequisito {
  profilo_id: string;
  requisito_id: string;
}
export interface RiscontroAddetto extends SelezioneRequisito {
  persona_tipo: TipoPersonaQualifica;
  persona_id: string;
  esito: "da_verificare" | "mancante" | "riesaminata" | "non_applicabile";
  qualifica_id: string | null;
  motivazione: string;
  confermata: boolean;
}
export interface DatiRiesameAddetti {
  attivita: string;
  responsabile: string;
  ruolo_responsabile: string;
  requisiti: SelezioneRequisito[];
  righe: RiscontroAddetto[];
  requisiti_definiti: boolean;
  conferma_assegnazioni: boolean;
  attrezzatura: MezzoFontePos | null;
}
export interface RegistroRiesameAddetti {
  id: string;
  company_id: string;
  order_id: string;
  fase_id: string | null;
  famiglia_id: string;
  versione: number;
  precedente_id: string | null;
  dal: string;
  al: string;
  stato: "parziale" | "da_integrare" | "riscontri_registrati";
  dati: Omit<DatiRiesameAddetti, "righe">;
  impronta: string;
  registrato_il: string;
  registrato_da: string;
  riscontri: number;
  non_collegati: number;
}
export const chiaveRequisito = (r: SelezioneRequisito) =>
  `${r.profilo_id}:${r.requisito_id}`;
export const chiavePersona = (p: { tipo: TipoPersonaQualifica; id: string }) =>
  `${p.tipo}:${p.id}`;
export function requisitoPerAddetti(r: RequisitoProfilo) {
  if (!r.catalogo_id) return true;
  const c = voceCatalogo(r.catalogo_id, r.catalogo_versione);
  return c?.destinazione === "sicurezza" && c.ambito === "persona_o_incarico";
}
export function criteriSelezionabili(profili: readonly ProfiloRequisiti[]) {
  return profili
    .filter((p) => !p.archiviato)
    .flatMap((p) =>
      p.criteri.filter(requisitoPerAddetti).map((r) => ({
        profilo: p,
        requisito: r,
        selezione: { profilo_id: p.id, requisito_id: r.id },
      })),
    );
}
export function preparaRiscontri(
  q: QuadroAddetti,
  requisiti: SelezioneRequisito[],
): RiscontroAddetto[] {
  if (
    !requisiti.length ||
    requisiti.length > 50 ||
    q.persone.length * requisiti.length > 500
  )
    throw new Error(
      "Seleziona da 1 a 50 requisiti; massimo 500 riscontri. Restringi fase o periodo.",
    );
  if (new Set(requisiti.map(chiaveRequisito)).size !== requisiti.length)
    throw new Error("Requisiti duplicati");
  return q.persone.flatMap((p) =>
    requisiti.map<RiscontroAddetto>((r) => ({
      ...r,
      persona_tipo: p.tipo,
      persona_id: p.id,
      esito: "da_verificare",
      qualifica_id: null,
      motivazione: "",
      confermata: false,
    })),
  );
}
export function motivoQualifica(
  q: QuadroAddetti,
  p: PersonaRequisiti,
  f: QualificaContesto,
  confermaAssegnazioni: boolean,
): string | null {
  if (f.persona_id !== p.id || f.persona_tipo !== p.tipo)
    return "Evidenza di un altro addetto";
  if (f.stato !== "riesaminata") return "Qualifica revocata";
  if (!f.fonte_corrente) return "Originale cambiato o non disponibile";
  if (!p.periodi.length) return "Periodo di impiego non definito";
  const dal = p.periodi.map((x) => x.dal).sort()[0],
    al = p.periodi
      .map((x) => x.al)
      .sort()
      .at(-1)!;
  if (
    f.dati.validita_dal > dal ||
    (f.dati.validita_al && f.dati.validita_al < al)
  )
    return "La qualifica non copre il periodo assegnato";
  if (p.periodi.some((x) => x.senza_date) && !confermaAssegnazioni)
    return "Periodo dell’assegnazione da confermare";
  const c = f.contesto_originale;
  if (
    (c.order_id && c.order_id !== q.order_id) ||
    (c.fase_id &&
      c.fase_id !== q.fase_id &&
      p.periodi.some((x) => x.fase_id !== c.fase_id)) ||
    (c.dal && c.dal > dal) ||
    (c.al && c.al < al)
  )
    return "Originale limitato a un altro cantiere, fase o periodo";
  return null;
}
export function cambiaRiscontro(
  r: RiscontroAddetto,
  patch: Partial<
    Pick<RiscontroAddetto, "esito" | "qualifica_id" | "motivazione">
  >,
): RiscontroAddetto {
  const n = { ...r, ...patch, confermata: false };
  if (n.esito !== "riesaminata") n.qualifica_id = null;
  return n;
}
export function erroreRiesame(
  q: QuadroAddetti,
  d: DatiRiesameAddetti,
): string | null {
  if (
    !d.attivita.trim() ||
    !d.responsabile.trim() ||
    !d.ruolo_responsabile.trim()
  )
    return "Indica attività, responsabile e ruolo del riesame";
  if (!q.persone.length && !q.da_collegare.length)
    return "Nessun addetto assegnato nel contesto";
  const attesi = preparaRiscontri(q, d.requisiti),
    keys = (r: RiscontroAddetto) =>
      `${r.persona_tipo}:${r.persona_id}:${chiaveRequisito(r)}`;
  if (
    d.righe.length !== attesi.length ||
    new Set(d.righe.map(keys)).size !== attesi.length ||
    d.righe.some((r) => !attesi.some((a) => keys(a) === keys(r)))
  )
    return "Un riscontro per ogni addetto e requisito selezionato";
  for (const r of d.righe) {
    if (r.esito === "riesaminata") {
      const p = q.persone.find(
          (p) => p.tipo === r.persona_tipo && p.id === r.persona_id,
        ),
        f = q.qualifiche.find((f) => f.id === r.qualifica_id);
      if (!p || !f) return "Seleziona l’evidenza dell’addetto";
      const motivo = motivoQualifica(q, p, f, d.conferma_assegnazioni);
      if (motivo) return motivo;
      if (!r.confermata || !r.motivazione.trim())
        return "Motiva e conferma la pertinenza dell’evidenza al requisito";
    } else if (
      r.esito === "non_applicabile" &&
      (!r.confermata || !r.motivazione.trim() || r.qualifica_id)
    )
      return "Motiva e conferma la non applicabilità";
    else if (
      (r.esito === "da_verificare" || r.esito === "mancante") &&
      (r.qualifica_id ||
        r.confermata ||
        (r.esito === "mancante" && !r.motivazione.trim()))
    )
      return "Un requisito aperto non conserva evidenze o conferme precedenti";
  }
  return null;
}
