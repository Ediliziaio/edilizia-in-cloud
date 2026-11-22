import { daCompletare, type Lavorazione } from "../../../supabase/functions/_shared/posModello";
import { chiaviFontiLavorazionePos } from "../../../supabase/functions/_shared/posFontiScheda";
import { SCHEDE_STANDARD_POS, suggerisciSchedePos, testoRicercaSchedePos } from "../../../supabase/functions/_shared/posSchedeStandard";

export const CAMPI_TESTO_LAVORAZIONE = [
  { id: "descrizione", titolo: "Descrizione della lavorazione" },
  { id: "modalita", titolo: "Modalità e organizzazione della fase di lavoro" },
] as const;

type Testi = Pick<Lavorazione, typeof CAMPI_TESTO_LAVORAZIONE[number]["id"]>;

export function modelloSuggeritoPos(titolo: string, standardId?: string) {
  if (standardId) {
    const giaScelto = SCHEDE_STANDARD_POS.find(s => s.id === standardId);
    if (giaScelto) return giaScelto;
  }
  const proposte = suggerisciSchedePos(titolo);
  return proposte.length === 1 ? proposte[0] : undefined;
}

export function testiMancantiDaProposta(destinazione: Testi, proposta: Testi) {
  return CAMPI_TESTO_LAVORAZIONE.flatMap(campo =>
    !destinazione[campo.id].trim() && !daCompletare(proposta[campo.id])
      ? [{ ...campo, testo: proposta[campo.id].trim() }] : [],
  );
}

type IdentitaLavorazione = Pick<Lavorazione, "titolo" | "descrizione" | "fase_id" | "fonti_scheda">;

export function stessaLavorazionePos(proposta: IdentitaLavorazione, esistente: IdentitaLavorazione) {
  if (proposta.fase_id && esistente.fase_id && proposta.fase_id !== esistente.fase_id) return false;
  const fonti = chiaviFontiLavorazionePos(proposta).filter(k => k.startsWith("computo:"));
  const precedenti = chiaviFontiLavorazionePos(esistente).filter(k => k.startsWith("computo:"));
  if (fonti.length && precedenti.length) return precedenti.some(k => fonti.includes(k));
  const titolo = testoRicercaSchedePos(proposta.titolo || proposta.descrizione);
  return !!titolo && titolo === testoRicercaSchedePos(esistente.titolo || esistente.descrizione);
}

export function inserisciTestiLavorazione(destinazione: Lavorazione, proposta: Lavorazione, origine: "modello" | "ai") {
  const testi = testiMancantiDaProposta(destinazione, proposta);
  if (!testi.length) return false;
  for (const { id, testo } of testi) destinazione[id] = testo;
  const precedenti = destinazione.fonti_scheda;
  const fonti = proposta.fonti_scheda;
  if (fonti) {
    const quesiti = precedenti?.quesiti ?? [];
    const nuove = (fonti.quesiti ?? []).filter(q => !quesiti.some(esistente => esistente.domanda === q.domanda));
    destinazione.fonti_scheda = {
      ...fonti,
      ...precedenti,
      quesiti: [...quesiti, ...nuove.map(q => ({ domanda: q.domanda, risposta: "" }))].slice(0, 8),
    };
  }
  destinazione.origine = origine;
  destinazione.verificata = false;
  if (destinazione.tecnica) destinazione.tecnica.riesaminata = false;
  return true;
}
