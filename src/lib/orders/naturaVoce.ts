/**
 * Cos'è una voce di contratto, preventivo o computo (17/11/2026, standard operativo §1): un lavoro, un
 * materiale, un materiale con la sua posa, o un servizio/onere. Solo i materiali (con o senza posa) si
 * comprano e diventano articoli della commessa; lavori e servizi restano nelle fasi.
 *
 * Prima ogni riga letta diventava un articolo «da ordinare»: dal computo di un cantiere ecobonus anche
 * «Oneri per la cantierizzazione», «Riunioni di formazione», il bagno chimico a noleggio.
 *
 * La regola legge le parole del documento, senza AI: chi carica vede la colonna «Cos'è» e corregge.
 */

export type NaturaVoce = "lavorazione" | "fornitura" | "fornitura_e_posa" | "servizio" | "sconto";

export const ETICHETTA_NATURA: Record<NaturaVoce, string> = {
  lavorazione: "Lavoro",
  fornitura: "Materiale",
  fornitura_e_posa: "Materiale + posa",
  servizio: "Servizio, onere",
  sconto: "Sconto",
};

export const NATURE: readonly NaturaVoce[] = ["lavorazione", "fornitura", "fornitura_e_posa", "servizio", "sconto"];

export function eNatura(v: unknown): v is NaturaVoce {
  return typeof v === "string" && (NATURE as readonly string[]).includes(v);
}

/** Si compra: materiale, da solo o con la posa. */
export function siCompra(n: NaturaVoce | null | undefined): boolean {
  return n === "fornitura" || n === "fornitura_e_posa";
}

// Sconti e detrazioni del documento: riducono il prezzo, non si comprano.
const SCONTO = /^(sconto|a detrarre|detrazione|detrarre|ribasso|abbuono)\b/i;

// Servizi e oneri: trasporti, smaltimento, noli, cantiere, sicurezza, formazione, verifiche, pratiche.
const SERVIZIO =
  /^(oneri?\b|nolo\b|noleggio|trasport|carico\b|carico e trasporto|conferimento|compenso alle discariche|smaltimento|riunion|formazione|corso\b|verifica|collaudo|analisi\b|prove?\b|assistenza (tecnica|al collaudo)|montaggio e smontaggio|ponteggio|piattaforma|autogru|gru\b|bagno chimico|prefabbricato|baracca|recinzione (provvisoria|di cantiere)|cartell[oi]|segnaletica di cantiere|pratica|pratiche|spese\b|tiro in alto|calo in basso|movimentazione|struttura provvisoria|protezion[ei] provvisori|opere provvisionali)|costo di utilizzo|per ogni mese|\bmensile\b|al mese\b|a nolo\b|\bnolo a caldo\b|\bnolo a freddo\b/i;

// Solo lavoro: demolire, rimuovere, smontare, pulire, preparare, posare materiale non fornito.
const LAVORAZIONE =
  /^(demolizion|rimozion|smontaggio|smantellament|spicconatura|scrostamento|pulitura|pulizia|lavaggio|raschiatura|scarriolatura|sgombero|taglio|scavo|rinterro|sbruffatura|rasatura|carteggiatura|stuccatura|sola posa|solo posa|posa in opera di (materiale|pavimento|rivestimento) (fornito|del committente)|preparazione|assistenza muraria|assistenze murarie|tracce\b|apertura di tracce|carotaggio|allacciament|svuotamento|rimontaggio|riposizionamento|messa in servizio|messa in funzione|attivazione|manodopera|operaio|ora di|installatore \d|elettricista|idraulico|muratore)/i;

const SOLA_POSA = /\b(sola posa|solo posa|esclusa (la )?fornitura|fornito dal committente|fornitura a carico del committente)\b/i;
const SOLA_FORNITURA = /^(sola fornitura|solo fornitura|fornitura(?! e posa| in opera| e messa in opera| e montaggio| e installazione| compresa la posa))\b/i;
const FORNITURA_E_POSA = /fornitura e posa|fornitura in opera|fornitura e messa in opera|fornitura e montaggio|fornitura e installazione|\bf\.?\s?p\.?\s?o\.?\b|\bf\.?\s?e\.?\s?p\.?\b|dat[oa] in opera|post[oa] in opera|montat[oi] in opera|in opera\b/i;

/**
 * La natura di una voce dalle sue parole. `sicurezza`: la voce sta negli oneri della sicurezza del computo
 * (noli, DPI, recinzioni, cartelli, riunioni): un costo del cantiere, non un materiale dell'opera.
 */
export function naturaVoce(
  descrizione: string | null | undefined,
  opts: { sicurezza?: boolean; capitolo?: string | null; detrazione?: boolean } = {},
): NaturaVoce {
  const d = (descrizione ?? "").replace(/\s+/g, " ").trim();
  if (opts.detrazione || SCONTO.test(d)) return "sconto";
  if (opts.sicurezza || /oneri (della |per la )?sicurezza|apprestamenti/i.test(opts.capitolo ?? "")) return "servizio";
  if (SOLA_POSA.test(d)) return "lavorazione";
  if (SERVIZIO.test(d)) return "servizio";
  if (LAVORAZIONE.test(d)) return "lavorazione";
  // «Posa rivestimenti», «Posa in opera di…» senza la fornitura: la sola manodopera.
  if (/^pos[ae]\b/i.test(d) && !/fornitur|fornit[oa] e post/i.test(d)) return "lavorazione";
  if (SOLA_FORNITURA.test(d)) return "fornitura";
  if (FORNITURA_E_POSA.test(d)) return "fornitura_e_posa";
  // Una voce che descrive una cosa (un serramento, un cappotto, una caldaia, una pittura) in un computo o un
  // preventivo è un lavoro compiuto: il materiale e la sua posa.
  return "fornitura_e_posa";
}
