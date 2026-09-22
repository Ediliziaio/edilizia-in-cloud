/**
 * A quale brand ha risposto questa persona? (18/09/2026)
 *
 * Tre servizi scrivono alle stesse aziende — Edilizia in Cloud, Marketing
 * Edile, ThermoDMR — e lo stesso contatto può essere iscritto a tutti e tre
 * (gli incroci sono voluti). Finché l'avviso «Risposta email da X» pescava la
 * PRIMA iscrizione attiva del contatto, poteva nominare il brand sbagliato:
 * su 9 risposte, 2 dicevano ThermoDMR mentre la mail era arrivata a una
 * casella di Marketing Edile / Edilizia in Cloud.
 *
 * Qui si sceglie l'invio VERO a cui la persona ha risposto, in quest'ordine:
 *   1. gli header In-Reply-To/References citano il Message-ID di una nostra
 *      email — è la prova, non un indizio;
 *   2. l'ultima email partita da QUESTA casella verso quel contatto;
 *   3. l'ultima email del brand della casella;
 *   4. l'ultima email in assoluto.
 * Se non c'è nessun invio, la risposta non è collegata a un invito: va detto
 * nell'avviso invece di inventare un brand.
 *
 * Modulo puro (nessuna query) così si prova davvero: vedi
 * src/test/logic/outreachRispostaBrand.test.ts.
 */

export interface InvioFatto {
  /** La riga di outreach_send_queue: serve a rimandare proprio quell'email. */
  id?: string | null;
  enrollment_id: string | null;
  brand_id: string | null;
  sender_account_id: string | null;
  message_id: string | null;
  sent_at: string | null;
}

export type MotivoScelta = "header" | "casella" | "brand" | "ultimo";

export interface SceltaInvio {
  invio: InvioFatto;
  motivo: MotivoScelta;
}

/** Un Message-ID confrontabile: senza <>, senza spazi, minuscolo. */
function chiave(id: string | null | undefined): string {
  return String(id ?? "").trim().replace(/^<|>$/g, "").trim().toLowerCase();
}

/** I Message-ID delle nostre email citati dalla risposta (In-Reply-To + References). */
export function idsCitati(
  inReplyTo: string | null | undefined,
  references: string[] | null | undefined,
): string[] {
  const tutti = [
    ...String(inReplyTo ?? "").split(/\s+/),
    ...(references ?? []).flatMap((r) => String(r ?? "").split(/\s+/)),
  ].map(chiave).filter(Boolean);
  return [...new Set(tutti)];
}

/** Dal più recente al più vecchio; le righe senza data in fondo. */
function perData(a: InvioFatto, b: InvioFatto): number {
  const ta = a.sent_at ? Date.parse(a.sent_at) : 0;
  const tb = b.sent_at ? Date.parse(b.sent_at) : 0;
  return tb - ta;
}

/**
 * L'invio a cui la risposta si riferisce. `invii` sono le email già partite a
 * quel contatto (status 'sent'), in qualunque ordine.
 */
export function scegliInvio(
  invii: InvioFatto[],
  opzioni: { casellaId?: string | null; brandCasella?: string | null; citati?: string[] } = {},
): SceltaInvio | null {
  const ordinati = [...(invii ?? [])].sort(perData);
  if (ordinati.length === 0) return null;

  const citati = new Set((opzioni.citati ?? []).map(chiave).filter(Boolean));
  if (citati.size) {
    const perHeader = ordinati.find((i) => i.message_id && citati.has(chiave(i.message_id)));
    if (perHeader) return { invio: perHeader, motivo: "header" };
  }
  if (opzioni.casellaId) {
    const perCasella = ordinati.find((i) => i.sender_account_id === opzioni.casellaId);
    if (perCasella) return { invio: perCasella, motivo: "casella" };
  }
  if (opzioni.brandCasella) {
    const perBrand = ordinati.find((i) => i.brand_id === opzioni.brandCasella);
    if (perBrand) return { invio: perBrand, motivo: "brand" };
  }
  return { invio: ordinati[0], motivo: "ultimo" };
}

/**
 * Ripiego quando di quel contatto non risulta nessun invio (coda ripulita,
 * risposta inoltrata a mano): fra le sue iscrizioni vive si prende quella del
 * brand della casella, altrimenti la più recente.
 */
export function scegliIscrizione(
  iscrizioni: Array<{ id: string; brandId: string | null; iscrittoIl?: string | null }>,
  brandCasella?: string | null,
): { id: string; brandId: string | null } | null {
  const vive = [...(iscrizioni ?? [])].sort((a, b) =>
    (b.iscrittoIl ? Date.parse(b.iscrittoIl) : 0) - (a.iscrittoIl ? Date.parse(a.iscrittoIl) : 0)
  );
  if (vive.length === 0) return null;
  const delBrand = brandCasella ? vive.find((i) => i.brandId === brandCasella) : undefined;
  const scelta = delBrand ?? vive[0];
  return { id: scelta.id, brandId: scelta.brandId ?? null };
}

/** Data in italiano (fuso di Roma) per le righe dell'avviso. */
function giorno(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
}

/**
 * La riga «Invitata» dell'avviso: risponde alla domanda vera — a questo
 * indirizzo ci abbiamo scritto davvero, e da dove?
 */
export function testoInvito(
  scelta: SceltaInvio | null,
  casellaRicevente: string | null | undefined,
): string {
  if (!scelta) return "⚠ nessuna email risulta inviata a questo indirizzo";
  const quando = giorno(scelta.invio.sent_at);
  const dataTesto = quando ? ` il ${quando}` : "";
  if (scelta.motivo === "header") return `sì, risponde alla nostra email${dataTesto}`;
  if (scelta.motivo === "casella") return `sì, scritta${dataTesto} da ${casellaRicevente ?? "questa casella"}`;
  if (scelta.motivo === "brand") return `sì, scritta${dataTesto} da un'altra casella dello stesso brand`;
  return `⚠ l'ultima email a questo indirizzo${dataTesto} è partita da un altro brand`;
}

/**
 * Quali iscrizioni fermare dopo una risposta (18/09/2026, decisione del
 * titolare: «non deve fermarsi anche negli altri brand, sono distinti»).
 *
 * Chi risponde a ThermoDMR non deve sparire da Marketing Edile e da Edilizia
 * in Cloud: sono tre servizi diversi, mandati da indirizzi diversi. Si ferma
 * solo il brand a cui ha risposto — più l'iscrizione da cui è arrivata la
 * risposta, sempre.
 * L'unica eccezione è «cancellatemi»: quella vale per tutti, e si passa
 * `tutte`.
 */
export function iscrizioniDaFermare(
  iscrizioni: Array<{ id: string; brandId: string | null }>,
  opzioni: { brandRisposta?: string | null; iscrizioneScelta?: string | null; tutte?: boolean } = {},
): string[] {
  const vive = iscrizioni ?? [];
  const scelta = opzioni.iscrizioneScelta ?? null;
  if (opzioni.tutte) {
    const tutte = vive.map((i) => i.id);
    return scelta && !tutte.includes(scelta) ? [...tutte, scelta] : tutte;
  }
  // Brand ignoto: si ferma solo l'iscrizione da cui è arrivata la risposta.
  // Se non si sa nemmeno quella, meglio fermare tutto che continuare a
  // scrivere a chi ha appena risposto.
  if (!opzioni.brandRisposta) {
    if (scelta) return [scelta];
    return vive.map((i) => i.id);
  }
  const ids = vive.filter((i) => i.brandId === opzioni.brandRisposta).map((i) => i.id);
  return scelta && !ids.includes(scelta) ? [...ids, scelta] : ids;
}
