import type { ConfermaAttesa, OpzionePersonaRapportino } from "../_shared/botOperativoConferme.ts";
import { buildInteractivePayload, idRispostaInterattiva } from "./interactive.ts";
import { normalizzaNomeRapportino, type OrePersona } from "./tools/operaio/rapportinoSquadra.ts";

// Nove persone e il pulsante Annulla occupano al massimo una lista WhatsApp.
const MAX_NOMI_IN_LISTA = 9;
const breve = (testo: string, max: number) => testo.replace(/\s+/g, " ").trim().slice(0, max);

export function elencoPersoneRapportino(pending: ConfermaAttesa) {
  const scelta = pending.rapportino!.scelta!;
  const daChiarire = (pending.parametri!.persone as OrePersona[])[scelta.indice];
  const ore = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(daChiarire.ore);
  const domanda = "Quale " + breve(daChiarire.nome, 48) + " ha lavorato " + ore + (daChiarire.ore === 1 ? " ora?" : " ore?");
  const righe = scelta.opzioni.slice(0, MAX_NOMI_IN_LISTA).map((p, i) => ({
    id: ["person", pending.id, i].join(":"),
    title: (i + 1) + ". " + breve(p.nome, 52),
    description: p.squadra ? breve(p.squadra, 34) : undefined,
  }));
  const opzioni = righe.map(r => r.title + (r.description ? " · " + r.description : ""));
  return buildInteractivePayload(
    [domanda, ...opzioni, "Scegli il nome o rispondi con il cognome, anche a voce."].join("\n"),
    [...righe, { id: "reject:" + pending.id, title: "Annulla" }],
    "Scegli persona",
  );
}

export function rispostaPersonaRapportino(pending: ConfermaAttesa, metadata: unknown, tipo: string, testo: string): OpzionePersonaRapportino | undefined {
  const opzioni = pending.rapportino?.scelta?.opzioni;
  if (!opzioni?.length) return;
  if (tipo === "interactive") {
    const id = idRispostaInterattiva(metadata);
    const [, domanda, posizione] = id?.match(/^person:([^:]+):([0-8])$/) ?? [];
    return domanda === pending.id ? opzioni[Number(posizione)] : undefined;
  }
  if (tipo !== "text" && tipo !== "audio") return;
  const risposta = normalizzaNomeRapportino(testo);
  const [, numero] = risposta.match(/^(?:il |la )?([1-9])$/) ?? [];
  if (numero) return opzioni[Number(numero) - 1];
  if (!risposta) return;
  const termini = risposta.split(" ");
  const candidati = opzioni.filter(p => {
    const parole = normalizzaNomeRapportino(p.nome).split(" ");
    return termini.every(parola => parole.includes(parola)) ||
      (!!p.squadra && risposta === normalizzaNomeRapportino(p.squadra));
  });
  return candidati.length === 1 ? candidati[0] : undefined;
}
