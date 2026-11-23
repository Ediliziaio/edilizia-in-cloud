/**
 * Come entrano nella bozza del POS le righe organizzative e le indicazioni di emergenza dal PSC. Un posto solo,
 * usato dalla traccia «Organizzazione e turni», da «Cerca indicazioni nel PSC» e da «Leggi PSC e contratto».
 */
import { CAMPI_EMERGENZE_POS, type CampoEmergenzePos } from "../../../supabase/functions/_shared/posEvidenzeOperative";
import { normalizzaFontiEmergenzePsc, testoIndicazioniEmergenza, type PropostaEmergenzaPsc } from "../../../supabase/functions/_shared/posEmergenzePsc";
import { pscSchedaDaRiesaminare } from "../../../supabase/functions/_shared/posFontiScheda";
import type { PosContenuto } from "../../../supabase/functions/_shared/posModello";

/** Aggiunge in fondo alle modalità organizzative le righe che non ci sono già. */
export function aggiungiRigheOrganizzazione(x: PosContenuto, righe: string[]): number {
  const precedenti = x.opera.modalita_organizzative.trim();
  const esistenti = new Set(precedenti.split("\n").map(riga => riga.trim()));
  const nuove = [...new Set(righe.map(r => r.trim()).filter(r => r && !esistenti.has(r)))];
  if (nuove.length) x.opera.modalita_organizzative = [precedenti, ...nuove].filter(Boolean).join("\n");
  return nuove.length;
}

/**
 * Le indicazioni di emergenza scelte sostituiscono il testo dei campi interessati, con le loro fonti.
 * Non fa nulla se il POS non ha più quel PSC: le citazioni sarebbero di un documento diverso.
 */
export function applicaEmergenzeDalPsc(x: PosContenuto, proposte: PropostaEmergenzaPsc[]): boolean {
  const psc = x.procedure_psc.documento;
  if (!proposte.length || !x.procedure_psc.psc_presente || proposte.some(p => pscSchedaDaRiesaminare(p, psc))) return false;
  const raggruppate = normalizzaFontiEmergenzePsc(Object.fromEntries(
    Object.keys(CAMPI_EMERGENZE_POS).map(k => [k, proposte.filter(p => p.campo === k)]),
  ));
  for (const [k, fonti] of Object.entries(raggruppate ?? {})) {
    const campo = k as CampoEmergenzePos;
    (x.emergenze.piano ??= {})[campo] = testoIndicazioniEmergenza(fonti);
    (x.emergenze.fonti_psc ??= {})[campo] = fonti;
  }
  return true;
}
