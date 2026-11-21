import type { ConfermaAttesa, OpzionePersonaRapportino } from "../_shared/botOperativoConferme.ts";
import { buildInteractivePayload, idRispostaInterattiva } from "./interactive.ts";
import { workHoursIssue } from "../_shared/operationalDraftValidation.ts";
import { normalizzaNomeRapportino, oreDettateRapportino, type OrePersona } from "./tools/operaio/rapportinoSquadra.ts";

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

type CorrezioneOre = { nome: string; ore: number; esplicita: boolean };

export function leggiCorrezioneOre(testo: string): CorrezioneOre | null {
  const pulito = testo.trim().replace(/[.!]+$/, "").replace(/^(?:no|ok)[,]\s*/i, "");
  const m = pulito.match(/^(?:(correggi|rettifica|modifica)\s+)?(riga\s+\d{1,2}|[\p{L}][\p{L}\p{M}'’. -]{0,100}?)\s*:?\s+(?:a\s+)?(\d{1,3}(?:[.,]\d{1,2})?|[\p{L}]+)\s+or[ae]$/iu);
  const ore = m ? oreDettateRapportino(m[3]) : null;
  return m && ore !== null ? { nome: normalizzaNomeRapportino(m[2]), ore, esplicita: !!m[1] } : null;
}

export function correggiOreNelRiepilogo(pending: ConfermaAttesa, correzione: CorrezioneOre, dipendente: string | null):
  { parametri: Record<string, unknown>; orePrima?: number[] } | { messaggio: string } {
  const dati = pending.parametri ?? {};
  const persone = Array.isArray(dati.persone) ? dati.persone as OrePersona[] : [];
  const sueOre = ["io", "me", "me stesso", "le mie ore"].includes(correzione.nome);
  if (!persone.length) {
    if (!sueOre) return { messaggio: "Il riepilogo contiene le tue ore personali. Per correggerle, scrivi «Io 7 ore»." };
    const problema = workHoursIssue(correzione.ore, dati.ore_straordinario, 14);
    return problema ? { messaggio: problema } : { parametri: { ...dati, ore_lavorate: correzione.ore } };
  }
  if (correzione.ore > 24) return { messaggio: "Indica da 0 a 24 ore per la persona." };
  const riga = correzione.nome.match(/^riga (\d{1,2})$/);
  const candidati = persone.flatMap((persona, i) => {
    const detto = normalizzaNomeRapportino(persona.nome);
    const nome = normalizzaNomeRapportino(pending.rapportino?.nomi?.[i] ?? persona.nome);
    const coincide = riga ? Number(riga[1]) === i + 1
      : sueOre ? (dipendente != null && pending.rapportino?.identificativi[i] === dipendente) || ["io", "me", "me stesso"].includes(detto)
      : (nome + " ").startsWith(correzione.nome + " ") || detto === correzione.nome;
    return coincide ? [i] : [];
  });
  if (!candidati.length) return { messaggio: "Non trovo quella persona nel riepilogo. Usa il nome che compare lì, oppure scrivi «Riga 2: 7 ore»." };
  if (candidati.length > 1) return { messaggio: "Ci sono più persone con quel nome. Indica nome e cognome oppure il numero della riga, per esempio «Riga 2: 7 ore»." };
  return {
    parametri: { ...dati, persone: persone.map((p, i) => i === candidati[0] ? { ...p, ore: correzione.ore } : p) },
    orePrima: pending.rapportino?.orePrima ?? persone.map(p => p.ore),
  };
}
