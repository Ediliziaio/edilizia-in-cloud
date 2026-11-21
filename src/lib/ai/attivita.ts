import { idAttivitaValido, type AttivitaAi, type FaseAi, type FlussoAi, type StatoAi } from "../../../shared/aiAttivita";

export const FLUSSI_AI: Record<FlussoAi, string> = {
  whatsapp: "WhatsApp",
  silvio: "Silvio",
  assistente: "Assistenti in chat",
  preventivo: "Preventivi",
  riconciliazione: "Riconciliazione",
  ddt: "Lettura bolle",
};

type Tratto = 0 | 1 | 2;
export const FASI_AI: Record<FaseAi, { testo: string; tratto: Tratto }> = {
  messaggio_ricevuto: { testo: "Messaggio ricevuto", tratto: 0 },
  foto_ricevuta: { testo: "Foto ricevuta", tratto: 0 },
  vocale_ricevuto: { testo: "Vocale ricevuto", tratto: 0 },
  richiesta_ricevuta: { testo: "Richiesta ricevuta", tratto: 0 },
  allegato_salvato: { testo: "Allegato salvato", tratto: 0 },
  prepara_documento: { testo: "Prepara gli allegati della bolla", tratto: 0 },
  documento_in_lettura: { testo: "Legge le righe della bolla", tratto: 1 },
  riconosce_allegato: { testo: "Riconosce il tipo di allegato", tratto: 1 },
  trascrizione: { testo: "Trascrive il vocale", tratto: 1 },
  traduzione: { testo: "Traduce in italiano", tratto: 1 },
  smistamento: { testo: "Individua la destinazione", tratto: 1 },
  bolla_accodata: { testo: "Bolla in coda per la lettura", tratto: 1 },
  bolla_registrata: { testo: "DDT registrato in ufficio", tratto: 2 },
  scontrino_letto: { testo: "Dati dello scontrino letti", tratto: 1 },
  memoria: { testo: "Carica contesto e memoria", tratto: 1 },
  elaborazione: { testo: "Elabora la richiesta", tratto: 1 },
  strumenti: { testo: "Usa gli strumenti del gestionale", tratto: 1 },
  controllo_incassi: { testo: "Confronta le fonti degli incassi", tratto: 1 },
  listino: { testo: "Cerca nel listino", tratto: 1 },
  voci_preventivo: { testo: "Prepara le voci del preventivo", tratto: 1 },
  prezzi_preventivo: { testo: "Abbina prezzi e tariffe", tratto: 1 },
  confronto_documenti: { testo: "Confronta fattura, bolle e ordini", tratto: 1 },
  confronto_ai: { testo: "Analizza le righe in dubbio", tratto: 1 },
  salvataggio: { testo: "Salva il risultato", tratto: 2 },
  invio_risposta: { testo: "Invia la risposta", tratto: 2 },
  risposta_inviata: { testo: "Risposta inviata a WhatsApp", tratto: 2 },
  risposta_salvata: { testo: "Risposta salvata in chat", tratto: 2 },
  conferma_whatsapp: { testo: "Scelta richiesta in chat", tratto: 2 },
  destinazione_ddt: { testo: "Bolla salvata, destinazione al messaggio successivo", tratto: 2 },
  da_smistare: { testo: "Allegato salvato, destinazione da scegliere", tratto: 2 },
  lettura_pronta: { testo: "Righe della bolla pronte da verificare", tratto: 2 },
  lettura_da_riprovare: { testo: "Lettura della bolla in attesa di un nuovo tentativo", tratto: 2 },
  bozza_pronta: { testo: "Voci del preventivo pronte da rivedere", tratto: 2 },
  risposta_preventivo: { testo: "Risposta disponibile nel preventivatore", tratto: 2 },
  proposta_pronta: { testo: "Proposta pronta da confermare", tratto: 2 },
  analisi_salvata: { testo: "Analisi salvata per la verifica", tratto: 2 },
  analisi_riusata: { testo: "Analisi già disponibile", tratto: 2 },
  prossimo_lotto: { testo: "In attesa del prossimo lotto", tratto: 1 },
  ticket_aperto: { testo: "Ticket aperto in Assistenza", tratto: 2 },
  problema_mezzo_salvato: { testo: "Problema registrato sulla scheda del mezzo", tratto: 2 },
  scontrino_registrato: { testo: "Scontrino registrato nel gestionale", tratto: 2 },
  rapportino_salvato: { testo: "Rapportino registrato", tratto: 2 },
  preventivo_salvato: { testo: "Bozza di preventivo salvata", tratto: 2 },
  pdf_in_preparazione: { testo: "Prepara il PDF", tratto: 1 },
  compone_pdf: { testo: "Compone il PDF", tratto: 1 },
  pdf_pronto: { testo: "PDF del preventivo pronto", tratto: 2 },
  pdf_inviato: { testo: "PDF inviato a WhatsApp", tratto: 2 },
  terminata: { testo: "Elaborazione conclusa", tratto: 2 },
  errore: { testo: "Operazione da verificare", tratto: 2 },
};

export type StatoAttivita = StatoAi | "interrotta" | "in_coda";

export const STATI_AI: Record<StatoAttivita, string> = {
  in_corso: "In corso",
  in_coda: "In attesa",
  in_attesa: "Da verificare",
  completata: "Completata",
  errore: "Problema",
  interrotta: "Aggiornamenti interrotti",
};

export function statoAttivita(riga: AttivitaAi, adesso: number): StatoAttivita {
  if (riga.stato === "in_attesa" && riga.fase === "prossimo_lotto") return "in_coda";
  return riga.stato === "in_corso" && adesso - Date.parse(riga.updated_at) > 8 * 60_000
    ? "interrotta"
    : riga.stato;
}

export function nomeAttivita(riga: AttivitaAi) {
  if (riga.flusso === "assistente" && riga.assistente) return riga.assistente;
  if (riga.flusso === "ddt" && riga.bolla_id) return riga.assistente === "WhatsApp" ? "Bolla da WhatsApp" : "Lettura bolla";
  if (riga.richiesta?.tipo === "preventivo") return riga.assistente === "WhatsApp" ? "Preventivo da WhatsApp" : "Preventivo";
  const flusso = FLUSSI_AI[riga.flusso];
  return riga.assistente === "WhatsApp" && riga.flusso !== "whatsapp" ? `${flusso} · WhatsApp` : flusso;
}

type AttivitaRaggruppata = AttivitaAi & {
  idPassaggi: string[];
  flussi: FlussoAi[];
  ultimoAggiornamento: string;
};

export type StatoBollaMonitor = { id: string; status: string; updated_at: string };
export type StatoPreventivoMonitor = { id: string; ai_richiesta_id: string | null; ai_richiesta_salvata_il: string | null };

export function azioneAttivita(riga?: AttivitaAi) {
  if (!riga) return undefined;
  if (idAttivitaValido(riga.bolla_id)) return {
    tipo: "ddt" as const, titolo: "Apri bolla", to: `/azienda/ordini?tab=ddt&ddt_documento=${riga.bolla_id}`,
  };
  const rifer = riga.richiesta;
  if (!rifer || !idAttivitaValido(rifer.risorsa_id)) return undefined;
  if (rifer.tipo === "preventivo") return {
    tipo: "preventivo" as const, titolo: "Apri preventivo", to: `/azienda/marketing/preventivi/${rifer.risorsa_id}`,
  };
  const analisi = idAttivitaValido(rifer.esito_id) ? `&analisi=${rifer.esito_id}` : "";
  return {
    tipo: "riconciliazione" as const, titolo: "Apri confronto fattura",
    to: `/azienda/documenti/fatture-ricevute?fattura=${rifer.risorsa_id}&confronto=1${analisi}`,
  };
}

export function raggruppaAttivita(
  righe: AttivitaAi[], adesso: number,
  esiti: { bolle?: StatoBollaMonitor[]; preventivi?: StatoPreventivoMonitor[] } = {},
): AttivitaRaggruppata[] {
  const gruppi = new Map<string, AttivitaAi[]>();
  const statoBolle = new Map(esiti.bolle?.map(b => [b.id, b]));
  const preventiviSalvati = new Map<string, StatoPreventivoMonitor>();
  for (const p of esiti.preventivi ?? []) {
    if (p.ai_richiesta_id && !preventiviSalvati.has(p.ai_richiesta_id)) preventiviSalvati.set(p.ai_richiesta_id, p);
  }
  for (const riga of righe) {
    const r = riga.richiesta;
    const chiave = riga.bolla_id ? `bolla:${riga.company_id}:${riga.bolla_id}`
      : r?.tipo === "riconciliazione" ? `riconciliazione:${riga.company_id}:${riga.actor_user_id}:${r.risorsa_id}:${r.id}`
      : r ? `preventivo:${riga.company_id}:${r.id}` : riga.id;
    const gruppo = gruppi.get(chiave);
    if (gruppo) gruppo.push(riga);
    else gruppi.set(chiave, [riga]);
  }
  return Array.from(gruppi, ([id, gruppo]): AttivitaRaggruppata => {
    const recente = [...gruppo].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    const ultima = recente[0];
    const info = { idPassaggi: recente.map(r => r.id), ultimoAggiornamento: ultima.updated_at };
    if (!ultima.bolla_id && !ultima.richiesta) return { ...ultima, ...info, flussi: [ultima.flusso] };

    const lettura = recente.find(r => r.flusso === "ddt");
    const ultimoMessaggio = recente.find(r => r.flusso === "whatsapp");
    const attiva = recente.find(r => statoAttivita(r, adesso) === "in_corso");
    const problema = [lettura, ultimoMessaggio].find(r => {
      if (!r) return false;
      const stato = statoAttivita(r, adesso);
      return stato === "errore" || stato === "interrotta";
    });
    const pdf = ultima.richiesta?.tipo === "preventivo"
      ? recente.find(r => r.flusso === "preventivo" &&
          r.passaggi.some(p => p.fase === "pdf_in_preparazione" || p.fase === "pdf_inviato"))
      : undefined;
    const corrente = attiva ?? pdf ?? (ultima.bolla_id ? problema ?? lettura : undefined) ?? ultima;
    const prima = recente.reduce((a, b) => Date.parse(a.started_at) <= Date.parse(b.started_at) ? a : b);
    const daWhatsApp = recente.some(r => r.flusso === "whatsapp" || r.assistente === "WhatsApp");
    const flusso = ultima.bolla_id ? "ddt" : ultima.richiesta!.tipo;
    const riferimento = recente.find(r => r.richiesta?.esito_id)?.richiesta
      ?? recente.find(r => r.richiesta?.risorsa_id)?.richiesta ?? ultima.richiesta;
    const risultato: AttivitaRaggruppata = {
      ...corrente, ...info, id, flusso, assistente: daWhatsApp ? "WhatsApp" : null,
      flussi: daWhatsApp ? [flusso, "whatsapp"] : [flusso],
      started_at: prima.started_at,
      finished_at: corrente.stato === "in_corso" ? null : ultima.updated_at,
      actor_user_id: prima.actor_user_id, attore: prima.attore,
      richiesta: riferimento,
      lotti: recente.reduce<AttivitaAi["lotti"]>((piuAvanti, riga) =>
        riga.lotti && (!piuAvanti || riga.lotti.completati > piuAvanti.completati) ? riga.lotti : piuAvanti, undefined),
      modello: recente.find(r => r.modello)?.modello ?? null,
      passaggi: recente.flatMap(r => r.passaggi),
    };
    const bolla = ultima.bolla_id ? statoBolle.get(ultima.bolla_id) : undefined;
    if (bolla?.status === "registered") {
      risultato.stato = "completata";
      risultato.fase = "bolla_registrata";
      risultato.finished_at = bolla.updated_at;
      risultato.passaggi.push({ fase: "bolla_registrata", at: bolla.updated_at });
      if (Date.parse(bolla.updated_at) > Date.parse(risultato.ultimoAggiornamento)) risultato.ultimoAggiornamento = bolla.updated_at;
    }
    const preventivo = riferimento?.tipo === "preventivo" ? preventiviSalvati.get(riferimento.id) : undefined;
    if (preventivo && riferimento) {
      risultato.richiesta = { ...riferimento, risorsa_id: preventivo.id };
      if (preventivo.ai_richiesta_salvata_il && !risultato.passaggi.some(p => p.fase === "preventivo_salvato")) {
        risultato.passaggi.push({ fase: "preventivo_salvato", at: preventivo.ai_richiesta_salvata_il });
      }
    }
    const bozzaSalvata = (corrente.fase === "bozza_pronta" || corrente.fase === "risposta_preventivo") && !!preventivo;
    const preventivoConfermato = corrente.fase === "risposta_inviata" && !!riferimento?.risorsa_id;
    if (flusso === "preventivo" && (bozzaSalvata || (corrente.stato === "completata" && preventivoConfermato))) {
      risultato.stato = "completata";
      risultato.fase = "preventivo_salvato";
      const salvatoIl = preventivo?.ai_richiesta_salvata_il;
      if (salvatoIl && Date.parse(salvatoIl) > Date.parse(risultato.ultimoAggiornamento)) {
        risultato.finished_at = salvatoIl;
        risultato.ultimoAggiornamento = salvatoIl;
      }
    }
    risultato.passaggi.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return risultato;
  }).sort((a, b) => Date.parse(b.ultimoAggiornamento) - Date.parse(a.ultimoAggiornamento));
}

export function nomeAttore(riga: AttivitaAi) {
  return riga.attore
    || (riga.flusso === "whatsapp" || riga.assistente === "WhatsApp" ? "Mittente WhatsApp" : null)
    || (riga.actor_user_id ? "Utente del gestionale" : "Avvio automatico");
}

export function faseAttivita(fase: FaseAi) {
  return FASI_AI[fase] ?? { testo: "Aggiornamento attività", tratto: 1 as const };
}

export function durataAttivita(riga: AttivitaAi, adesso: number) {
  const fine = Date.parse(riga.finished_at ?? riga.updated_at);
  const ms = (riga.finished_at || statoAttivita(riga, adesso) === "interrotta" ? fine : adesso) - Date.parse(riga.started_at);
  const secondi = Math.max(0, Math.floor(ms / 1000));
  if (secondi < 1) return "< 1 s";
  if (secondi < 60) return `${secondi} s`;
  const minuti = Math.floor(secondi / 60);
  if (minuti < 60) return `${minuti} min ${secondi % 60} s`;
  return `${Math.floor(minuti / 60)} h ${minuti % 60} min`;
}

export function durataPassaggio(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} s`;
  const secondi = Math.floor(ms / 1000);
  return `${Math.floor(secondi / 60)} min ${secondi % 60} s`;
}

const orario = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const oraAttivita = (iso: string) => orario.format(Date.parse(iso));
