/**
 * Il rapporto marketing del mattino, nella forma voluta dal titolare (21/09/2026).
 *
 * Prima le tre cose da fare oggi (e com'è andata con quelle di ieri), poi una
 * scheda per brand sempre con le stesse sezioni — campagne lead generation,
 * awareness e interazione, gestione commerciale, risultati, azione consigliata
 * —, i clienti in pausa in fondo e il riepilogo economico.
 *
 * I numeri li prepara mkt_rapporto_mattino; qui si decide solo la forma, con
 * regole fisse e niente AI: ogni mattina le frasi devono essere affidabili e
 * confrontabili con quelle del giorno prima.
 *
 * Definizioni concordate col titolare il 21/09/2026:
 *   - CAC = spesa lead generation del mese ÷ contratti vinti nel mese;
 *   - ROAS = valore dei contratti vinti nel mese ÷ spesa lead generation del mese;
 *   - tasso di chiusura = contratti vinti ÷ sopralluoghi, sugli ultimi 30 giorni;
 *   - stato del brand (una parola colorata, niente icone): CRITICO se ha un
 *     allarme grave aperto o se Meta manca o è scaduto; DA GUARDARE se ha altri
 *     allarmi aperti, la spesa non leggibile, il CPL sopra il target o nessun
 *     contratto nel mese; OK altrimenti. Il semaforo
 *     del motore non serve a questo: basta un componente rosso, e il 21/09
 *     l'esecuzione lo era per tutti;
 *   - un dato che manca si scrive «non disponibile» col motivo, mai un trattino.
 *
 * Nessun import (lo provano i test in src/test/logic/rapportoMarketingMattino.test.ts):
 * il motivo per cui manca la spesa arriva già calcolato da chi chiama.
 */

export interface ClienteRapporto {
  service_client_id: string;
  cliente_nome: string;
  stato_cliente: string;
  lead_grezzi_giorno: number;
  lead_grezzi_7g: number;
  lead_validi_7g: number;
  spesa_giorno: number;
  spesa_7g: number;
  spesa_mese: number;
  spesa_aw_giorno?: number | null;
  spesa_aw_7g?: number | null;
  spesa_aw_mese?: number | null;
  spesa_lead_giorno?: number | null;
  spesa_lead_7g?: number | null;
  spesa_lead_mese?: number | null;
  campagne_aw?: Array<{ nome: string | null; obiettivo: string | null; spesa: number }> | null;
  obiettivi_noti?: boolean | null;
  cpl_valido_7g: number | null;
  cpl_target: number | null;
  costo_appuntamento_14g: number | null;
  lead_fermi: number;
  lead_fermo_piu_vecchio_ore: number;
  mediana_primo_contatto_min_7g: number | null;
  appuntamenti_14g: number;
  sopralluoghi_30g?: number | null;
  tasso_presenza_30g?: number | null;
  opp_mese?: number | null;
  opp_senza_esito_mese?: number | null;
  preventivi_sospesi?: number | null;
  lead_dichiarati_7g?: number | null;
  vendite_ieri?: number | null;
  venduto_ieri?: number | null;
  vendite_mese: number;
  venduto_mese: number;
  vendite_30g?: number | null;
  /** Giorni distinti in cui sono state registrate le vendite del mese. */
  giorni_vendite_mese?: number | null;
  provvigione_mese: number;
  indice_esecuzione: number | null;
  giorni_dall_ultimo_accesso: number | null;
  giorni_senza_lead?: number | null;
  spesa_disponibile: boolean;
  meta_stato?: string | null;
  meta_account?: boolean | null;
  allarme_max?: string | null;
  data_fine_contratto?: string | null;
  giorni_alla_fine_contratto?: number | null;
  /** Aggiunto da chi chiama (motivoSenzaSpesa): perché la spesa non si legge. */
  motivo_spesa?: { breve: string; cosaFare: string } | null;
}

export interface AzioneRapporto {
  id: string;
  service_client_id: string;
  cliente_nome: string;
  regola: string;
  gravita: string;
  titolo: string;
  azione: string;
  proprietario: string;
  scadenza: string | null;
  aperto_il?: string | null;
  dettaglio?: Record<string, unknown> | null;
}

export interface PrioritaIeri {
  posizione: number;
  cliente: string | null;
  titolo: string;
  chiave: string;
  allarme_chiuso: boolean;
  esito: string | null;
  giorni_aperta: number | null;
}

export interface DatiRapporto {
  giorno: string;
  clienti: ClienteRapporto[];
  azioni: AzioneRapporto[];
  da_guardare?: AzioneRapporto[];
  priorita_ieri?: PrioritaIeri[];
  denaro: { provvigioni_mese: number; fatture_scadute: Array<{ cliente: string; importo: number; scaduta_da_giorni: number }> };
}

export type Colore = "rosso" | "arancione" | "verde" | "pausa";

/** Una priorità del giorno, pronta per l'email e per mkt_rapporto_priorita. */
export interface Priorita {
  chiave: string;
  allarme_id: string | null;
  service_client_id: string;
  cliente_nome: string;
  titolo: string;
  impatto: string;
  azione: string;
  responsabile: string;
  scadenza: string;
  aperta_da_giorni: number | null;
}

// ─── Numeri ────────────────────────────────────────────────────────────────

const num = (v: unknown): number => Number(v ?? 0) || 0;
const haValore = (v: unknown): v is number => v != null && Number.isFinite(Number(v));

/**
 * «1.099», «16.230,75»: il punto delle migliaia SEMPRE. La formattazione
 * italiana di sistema lo omette sotto le cinque cifre («1099 €»), e il
 * rapporto del titolare li scrive tutti col punto.
 */
export function numero(v: number, decimali = 0): string {
  const [interi, dec] = Math.abs(v).toFixed(decimali).split(".");
  const conPunti = interi.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 && Number(Math.abs(v).toFixed(decimali)) !== 0 ? "-" : ""}${conPunti}${dec ? `,${dec}` : ""}`;
}

export function euro(v: number, decimali = 0): string {
  return `${numero(v, decimali)} €`;
}

const intero = (v: number) => numero(Math.round(v));
const unDecimale = (v: number) => numero(v, 1);

/** «l'80%», «il 23%»: l'articolo davanti a una percentuale. */
export function articoloPercentuale(p: number): string {
  const n = Math.round(p);
  return n === 1 || n === 11 || String(n).startsWith("8") ? `l'${numero(n)}%` : `il ${numero(n)}%`;
}

const plurale = (n: number, uno: string, tanti: string) => `${numero(n)} ${n === 1 ? uno : tanti}`;

/** «39 ore», «7 ore», «45 minuti»: il tempo di prima risposta. */
export function durata(minuti: number): string {
  if (minuti < 60) return `${Math.round(minuti)} minuti`;
  const ore = Math.round(minuti / 60);
  return ore === 1 ? "1 ora" : `${ore} ore`;
}

function accesso(giorni: number | null): string {
  if (giorni == null) return "mai";
  if (giorni <= 0) return "oggi";
  if (giorni === 1) return "ieri";
  return `${giorni} giorni fa`;
}

/** Spesa lead generation: quella separata se il sync conosce gli obiettivi, altrimenti tutto l'account. */
function spesaLead(c: ClienteRapporto, periodo: "giorno" | "7g" | "mese"): number {
  const separata = periodo === "giorno" ? c.spesa_lead_giorno : periodo === "7g" ? c.spesa_lead_7g : c.spesa_lead_mese;
  const totale = periodo === "giorno" ? c.spesa_giorno : periodo === "7g" ? c.spesa_7g : c.spesa_mese;
  return haValore(separata) ? num(separata) : num(totale);
}

/** La separazione lead/awareness vale solo se il sync ha già letto gli obiettivi delle campagne. */
const spesaSeparata = (c: ClienteRapporto) => c.obiettivi_noti === true;

export interface Indicatori {
  cpl: number | null;
  scostamentoCpl: number | null;
  cac: number | null;
  roas: number | null;
  valoreMedio: number | null;
  tassoChiusura: number | null;
  sincronizzazione: number | null;
}

export function indicatori(c: ClienteRapporto): Indicatori {
  const cpl = haValore(c.cpl_valido_7g) ? num(c.cpl_valido_7g) : null;
  const target = haValore(c.cpl_target) && num(c.cpl_target) > 0 ? num(c.cpl_target) : null;
  const spesaMese = c.spesa_disponibile ? spesaLead(c, "mese") : 0;
  const vendite = num(c.vendite_mese);
  const venduto = num(c.venduto_mese);
  const sopralluoghi = num(c.sopralluoghi_30g);
  const dichiarati = num(c.lead_dichiarati_7g);
  return {
    cpl,
    scostamentoCpl: cpl != null && target != null ? ((cpl - target) / target) * 100 : null,
    cac: spesaMese > 0 && vendite > 0 ? spesaMese / vendite : null,
    roas: spesaMese > 0 && venduto > 0 ? venduto / spesaMese : null,
    valoreMedio: vendite > 0 && venduto > 0 ? venduto / vendite : null,
    tassoChiusura: sopralluoghi > 0 ? (num(c.vendite_30g) / sopralluoghi) * 100 : null,
    sincronizzazione: dichiarati > 0 ? (num(c.lead_grezzi_7g) / dichiarati) * 100 : null,
  };
}

// ─── Colore, sintesi, azione ────────────────────────────────────────────────

/** Meta mancante o scaduto: non si misura niente, ed è sempre rosso. */
export function problemaMeta(c: ClienteRapporto): "mancante" | "scaduto" | null {
  if (!c.meta_stato) return "mancante";
  if (c.meta_stato !== "connected") return "scaduto";
  return null;
}

export function coloreBrand(c: ClienteRapporto): Colore {
  if (c.stato_cliente !== "attivo") return "pausa";
  if (c.allarme_max === "grave" || problemaMeta(c)) return "rosso";
  const ind = indicatori(c);
  if (
    c.allarme_max === "rosso" || c.allarme_max === "giallo" || !c.spesa_disponibile ||
    (ind.scostamentoCpl != null && ind.scostamentoCpl > 0) || num(c.vendite_mese) === 0
  ) return "arancione";
  return "verde";
}

// Niente icone nelle email (founder, 25/09/2026): lo stato è una parola colorata.
const ETICHETTA_STATO: Record<Colore, [string, string]> = {
  rosso: ["CRITICO", "#b91c1c"], arancione: ["DA GUARDARE", "#c2410c"], verde: ["OK", "#047857"], pausa: ["IN PAUSA", "#6b7280"],
};
const etichettaStato = (c: Colore) =>
  `<span style="color:${ETICHETTA_STATO[c][1]};font-size:12px;letter-spacing:0.04em;">${ETICHETTA_STATO[c][0]}</span>`;
const ORDINE: Record<Colore, number> = { rosso: 0, arancione: 1, verde: 2, pausa: 3 };

/** Lavorazione commerciale insufficiente: tanti lead fermi o indice di esecuzione basso. */
const gestioneCritica = (c: ClienteRapporto) => num(c.lead_fermi) >= 10 || (haValore(c.indice_esecuzione) && num(c.indice_esecuzione) < 30);

export function sintesi(c: ClienteRapporto): string {
  const meta = problemaMeta(c);
  const silenzio = haValore(c.giorni_senza_lead) && num(c.giorni_senza_lead) > 3 ? num(c.giorni_senza_lead) : null;
  const accessoLontano = haValore(c.giorni_dall_ultimo_accesso) && num(c.giorni_dall_ultimo_accesso) >= 7 ? num(c.giorni_dall_ultimo_accesso) : null;
  if (meta) {
    const parti = [meta === "mancante" ? "Meta non collegato" : "collegamento Meta scaduto"];
    if (silenzio) parti.push(`nessun lead da ${silenzio} giorni`);
    if (accessoLontano) parti.push(`nessun accesso da ${accessoLontano} giorni`);
    const frase = parti.length > 1 ? `${parti.slice(0, -1).join(", ")} e ${parti[parti.length - 1]}` : parti[0];
    return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}: le performance pubblicitarie non si possono valutare.`;
  }
  if (!c.spesa_disponibile) {
    return `Le performance pubblicitarie non sono valutabili: ${c.motivo_spesa?.breve ?? "la spesa non è disponibile"}.`;
  }
  const ind = indicatori(c);
  const sopra = ind.scostamentoCpl != null && ind.scostamentoCpl > 0;
  const vicino = ind.scostamentoCpl != null && ind.scostamentoCpl <= 0 && ind.scostamentoCpl > -15;
  const vendite = num(c.vendite_mese);
  if (sopra && vendite > 0) {
    return "Il CPL supera il target, ma il brand registra contratti vinti: prima di intervenire sulle campagne bisogna verificare CAC e ROAS.";
  }
  if (sopra) return "Il CPL supera il target e nel mese non risultano contratti vinti: le campagne vanno riviste.";
  if (gestioneCritica(c)) {
    return vicino
      ? "Le campagne sono vicine al target, ma la gestione commerciale è critica."
      : "Le campagne generano lead a un costo sostenibile, ma la lavorazione commerciale è insufficiente.";
  }
  if (vendite === 0) return "Il costo dei lead è sotto controllo, ma non risultano contratti vinti registrati.";
  return "Campagne nel target e lavorazione commerciale regolare.";
}

export function azioneConsigliata(c: ClienteRapporto): string {
  const meta = problemaMeta(c);
  if (meta === "mancante") return "Collegare Meta e verificare se i contratti vinti sono attribuibili alle campagne marketing.";
  if (meta === "scaduto") return "Ripristinare il collegamento Meta e verificare se esistono campagne Lead Generation attive.";
  if (!c.spesa_disponibile) {
    const presenza = haValore(c.tasso_presenza_30g) ? num(c.tasso_presenza_30g) : null;
    const breve = c.motivo_spesa?.breve ?? "";
    const base = breve.includes("non scelto")
      ? "Scegliere l'account pubblicitario del brand in Pubblicità → Impostazioni"
      : breve.includes("nessuna spesa")
        ? "Verificare l'account pubblicitario selezionato: Meta non vi registra spesa"
        : "Verificare il collegamento dell'account pubblicitario";
    return presenza != null && presenza < 0.5
      ? `${base}, poi analizzare il basso tasso di presenza agli appuntamenti (${intero(presenza * 100)}%).`
      : `${base}.`;
  }
  const fermi = num(c.lead_fermi);
  if (fermi >= 10 && num(c.lead_fermo_piu_vecchio_ore) >= 240) {
    return "Chiamare il titolare e definire un piano operativo per lavorare tutti i lead entro 48 ore.";
  }
  if (fermi >= 10) {
    return `Recuperare oggi i ${fermi} lead fermi e assegnare un responsabile con un tempo massimo di prima risposta.`;
  }
  const risposta = haValore(c.mediana_primo_contatto_min_7g) ? num(c.mediana_primo_contatto_min_7g) : null;
  const ind = indicatori(c);
  if (risposta != null && risposta > 24 * 60) {
    const base = `Ridurre il tempo di prima risposta: oggi la metà dei lead aspetta più di ${durata(risposta)}.`;
    return ind.scostamentoCpl != null && ind.scostamentoCpl > 0 && num(c.vendite_mese) > 0
      ? `${base} Poi verificare attribuzione e sincronizzazione prima di modificare le campagne.`
      : base;
  }
  if (ind.scostamentoCpl != null && ind.scostamentoCpl > 0 && num(c.vendite_mese) > 0) {
    return "Verificare attribuzione e sincronizzazione prima di modificare le campagne: il CPL è alto, ma il risultato economico potrebbe essere positivo.";
  }
  if (ind.scostamentoCpl != null && ind.scostamentoCpl > 0) {
    return "Rivedere creatività e pubblico delle campagne: il costo per lead è sopra il target e non porta contratti.";
  }
  if (num(c.vendite_mese) === 0) {
    return "Verificare se le vendite non vengono chiuse oppure se i contratti vinti non vengono registrati nel CRM.";
  }
  return "Nessun intervento: continuare a monitorare.";
}

// ─── Priorità ────────────────────────────────────────────────────────────────

const REGOLE_LEAD_FERMI = new Set(["R1", "R2", "R3"]);
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** «12 set»: una data breve, nell'ora di Roma. */
export function dataBreve(iso: string): string {
  const [a, m, g] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso)).split("-");
  void a;
  return `${Number(g)} ${MESI[Number(m) - 1]}`;
}

function responsabile(proprietario: string): string {
  if (!proprietario || proprietario === "noi") return "Flo";
  if (proprietario === "cliente") return "il cliente";
  if (proprietario === "sistema") return "automatico";
  return proprietario.charAt(0).toUpperCase() + proprietario.slice(1);
}

function scadenza(iso: string | null, oggi: string): string {
  if (!iso) return "senza scadenza";
  const giorno = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(iso));
  if (giorno < oggi) return `oggi (era prevista per il ${dataBreve(iso)})`;
  if (giorno === oggi) return "oggi";
  return dataBreve(iso);
}

const senzaScript = (s: string) => s.replace(/\s*\(script \d+\)/gi, "").trim();
const minuscola = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const conPunto = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** Titolo, impatto e azione di una priorità, scritti per chi legge l'email. */
function scriviPriorita(a: AzioneRapporto, c: ClienteRapporto | undefined): { titolo: string; impatto: string; azione: string } {
  const d = a.dettaglio ?? {};
  if (REGOLE_LEAD_FERMI.has(a.regola)) {
    const fermi = num(d.lead_fermi ?? c?.lead_fermi);
    const ore = num(d.fermo_ore ?? c?.lead_fermo_piu_vecchio_ore);
    const opp = num(c?.opp_mese);
    const senzaEsito = num(c?.opp_senza_esito_mese);
    const quota = opp > 0 && senzaEsito > 0 ? Math.round((senzaEsito / opp) * 100) : null;
    const titolo = fermi === 1 ? "un lead non lavorato" : `${fermi} lead non lavorati`;
    if (ore >= 240) {
      return {
        titolo,
        impatto: `il lead più vecchio è fermo da ${intero(ore)} ore${quota != null ? ` e ${articoloPercentuale(quota)} dei lead del mese non ha un esito` : ""}.`,
        azione: "chiamare il titolare e ridefinire tempi e responsabilità commerciali.",
      };
    }
    return {
      titolo,
      impatto: "lead già pagati rischiano di non essere convertiti.",
      azione: a.regola === "R3"
        ? "contattare il titolare e attivare oggi un piano di recupero."
        : "chiamare il referente e far lavorare il lead oggi.",
    };
  }
  if (a.regola === "R19") {
    return {
      titolo: "collegamento Meta scaduto",
      impatto: "spesa e lead potrebbero non essere aggiornati.",
      azione: "ripristinare il collegamento Meta e verificare la sincronizzazione.",
    };
  }
  if (a.regola === "R24" || a.regola === "R25") {
    const giorni = num(d.giorni_senza_accesso ?? c?.giorni_dall_ultimo_accesso);
    return {
      titolo: `nessun accesso da ${giorni} giorni`,
      impatto: "è il primo segnale di abbandono del servizio.",
      azione: "chiamare il titolare.",
    };
  }
  if (a.regola === "R6" || a.regola === "R8") {
    return {
      titolo: `${euro(num(d.spesa_senza_lead))} spesi senza lead`,
      impatto: `budget che non porta richieste: ${unDecimale(num(d.rapporto_zero))} volte il costo normale di un lead.`,
      azione: conPunto(minuscola(senzaScript(a.azione))),
    };
  }
  if (a.regola === "R9" || a.regola === "R10") {
    return {
      titolo: `CPL a ${euro(num(d.cpl_valido_7g ?? c?.cpl_valido_7g), 2)} contro ${euro(num(d.cpl_target ?? c?.cpl_target), 2)}`,
      impatto: "ogni lead costa molto più del target.",
      azione: conPunto(minuscola(senzaScript(a.azione))),
    };
  }
  if (a.regola === "R20") {
    return {
      titolo: "lead dichiarati da Meta che non arrivano nel CRM",
      impatto: "lead già pagati che nessuno vede.",
      azione: conPunto(minuscola(senzaScript(a.azione))),
    };
  }
  if (a.regola === "R28") {
    return {
      titolo: "nessuna vendita in 30 giorni",
      impatto: "vendite assenti o non registrate: il risultato del servizio non si vede.",
      azione: "verificare con il titolare se i contratti vinti vengono registrati nel CRM.",
    };
  }
  return {
    titolo: minuscola(a.titolo),
    impatto: conPunto(minuscola(a.titolo)),
    azione: conPunto(minuscola(senzaScript(a.azione))),
  };
}

/**
 * Le tre priorità di oggi. Un brand rosso col contratto in scadenza entro 30
 * giorni passa davanti a tutto; poi gli allarmi nell'ordine del motore (già
 * per gravità), uno per brand.
 */
export function prioritaDelGiorno(r: DatiRapporto, max = 3): Priorita[] {
  const oggi = r.giorno;
  const clienti = new Map(r.clienti.map((c) => [c.service_client_id, c]));
  const scelte: Priorita[] = [];
  const brandPresi = new Set<string>();

  for (const c of r.clienti) {
    const giorni = c.giorni_alla_fine_contratto;
    if (coloreBrand(c) !== "rosso" || !haValore(giorni) || giorni < 0 || giorni > 30 || !c.data_fine_contratto) continue;
    scelte.push({
      chiave: `rinnovo:${c.service_client_id}`,
      allarme_id: null,
      service_client_id: c.service_client_id,
      cliente_nome: c.cliente_nome,
      titolo: `contratto in scadenza il ${dataBreve(c.data_fine_contratto)}`,
      impatto: `brand in difficoltà a ${giorni} ${giorni === 1 ? "giorno" : "giorni"} dal rinnovo.`,
      azione: "fissare oggi una call di rinnovo con il titolare, con i numeri del mese.",
      responsabile: "Flo",
      scadenza: "oggi",
      aperta_da_giorni: null,
    });
    brandPresi.add(c.service_client_id);
  }

  for (const a of [...(r.azioni ?? []), ...(r.da_guardare ?? []).filter((x) => x.gravita !== "nota")]) {
    if (scelte.length >= max) break;
    if (brandPresi.has(a.service_client_id)) continue;
    const c = clienti.get(a.service_client_id);
    if (c && c.stato_cliente !== "attivo") continue;
    const testo = scriviPriorita(a, c);
    const apertoIl = a.aperto_il ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(a.aperto_il)) : null;
    scelte.push({
      chiave: a.id,
      allarme_id: a.id,
      service_client_id: a.service_client_id,
      cliente_nome: a.cliente_nome,
      titolo: testo.titolo,
      impatto: testo.impatto,
      azione: testo.azione,
      responsabile: responsabile(a.proprietario),
      scadenza: scadenza(a.scadenza, oggi),
      aperta_da_giorni: apertoIl ? Math.max(0, Math.round((Date.parse(oggi) - Date.parse(apertoIl)) / 86_400_000)) : null,
    });
    brandPresi.add(a.service_client_id);
  }
  return scelte.slice(0, max);
}

/** Com'è andata con ognuna delle priorità di ieri. */
export function esitoPrioritaIeri(ieri: PrioritaIeri[], oggi: Priorita[]): Array<{ cliente: string; titolo: string; stato: string; risolta: boolean }> {
  const chiaviOggi = new Set(oggi.map((p) => p.chiave));
  return ieri.map((p) => {
    const cliente = p.cliente ?? "";
    if (p.chiave.startsWith("rinnovo:")) {
      return chiaviOggi.has(p.chiave)
        ? { cliente, titolo: p.titolo, stato: "ancora da fare", risolta: false }
        : { cliente, titolo: p.titolo, stato: "non più urgente", risolta: true };
    }
    if (p.allarme_chiuso) {
      return { cliente, titolo: p.titolo, stato: p.esito ? `risolta (${p.esito})` : "risolta", risolta: true };
    }
    const giorno = p.giorni_aperta != null ? ` — aperta da ${p.giorni_aperta} ${p.giorni_aperta === 1 ? "giorno" : "giorni"}` : "";
    return chiaviOggi.has(p.chiave)
      ? { cliente, titolo: p.titolo, stato: `ancora aperta${giorno}`, risolta: false }
      : { cliente, titolo: p.titolo, stato: `ancora aperta, non più tra le prime tre${giorno}`, risolta: false };
  });
}

// ─── HTML ────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch));

const OBIETTIVI: Record<string, string> = {
  OUTCOME_AWARENESS: "Notorietà", BRAND_AWARENESS: "Notorietà", LOCAL_AWARENESS: "Notorietà", REACH: "Copertura",
  VIDEO_VIEWS: "Visualizzazioni video", OUTCOME_ENGAGEMENT: "Interazione", POST_ENGAGEMENT: "Interazione",
  PAGE_LIKES: "Mi piace alla pagina", EVENT_RESPONSES: "Risposte a eventi",
  OUTCOME_TRAFFIC: "Traffico", LINK_CLICKS: "Traffico",
};

const riga = (etichetta: string, valore: string) =>
  `<li style="margin:2px 0;">${esc(etichetta)}: <strong>${valore}</strong></li>`;
const rigaDebole = (testo: string) => `<li style="margin:2px 0;color:#6b7280;">${testo}</li>`;
const titoletto = (s: string) =>
  `<p style="margin:12px 0 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;">${esc(s)}</p>`;
const elenco = (righe: string[]) => `<ul style="margin:0;padding-left:18px;">${righe.join("")}</ul>`;
const separatore = `<hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0;">`;

function sezioneCampagne(c: ClienteRapporto): string {
  const r: string[] = [];
  const separata = spesaSeparata(c);
  const etichettaSpesa = separata ? "Spesa Lead Generation" : "Spesa (tutto l'account)";
  r.push(riga("Lead ieri", intero(num(c.lead_grezzi_giorno))));
  r.push(riga("Lead ultimi 7 giorni", intero(num(c.lead_grezzi_7g))));
  if (!c.spesa_disponibile) {
    r.push(riga("Spesa", "non disponibile"));
    r.push(riga("CPL", "non calcolabile"));
    r.push(riga("Problema", esc(c.motivo_spesa?.breve ?? "spesa non leggibile")));
    return titoletto("Campagne Lead Generation") + elenco(r);
  }
  r.push(riga(`${etichettaSpesa} ieri`, euro(spesaLead(c, "giorno"))));
  r.push(riga(`${etichettaSpesa} ultimi 7 giorni`, euro(spesaLead(c, "7g"))));
  const ind = indicatori(c);
  if (ind.cpl != null) {
    r.push(riga("CPL ultimi 7 giorni", euro(ind.cpl, 2)));
    if (haValore(c.cpl_target)) r.push(riga("Target CPL", euro(num(c.cpl_target), 2)));
    if (ind.scostamentoCpl != null) {
      const x = Math.abs(ind.scostamentoCpl);
      const colore = ind.scostamentoCpl > 0 ? "#b91c1c" : "#047857";
      r.push(`<li style="margin:2px 0;">Risultato: <strong style="color:${colore};">${unDecimale(x)}% ${ind.scostamentoCpl > 0 ? "sopra" : "sotto"} il target</strong></li>`);
    }
  } else {
    r.push(riga("CPL", "non calcolabile (nessun lead valido negli ultimi 7 giorni)"));
  }
  if (haValore(c.costo_appuntamento_14g)) {
    r.push(riga("Costo per sopralluogo (14 giorni)", euro(num(c.costo_appuntamento_14g), 2)));
  }
  return titoletto("Campagne Lead Generation") + elenco(r);
}

function sezioneAwareness(c: ClienteRapporto): string {
  if (!c.spesa_disponibile) return titoletto("Awareness e interazione") + elenco([rigaDebole("Dati non disponibili")]);
  if (!spesaSeparata(c)) {
    return titoletto("Awareness e interazione") + elenco([rigaDebole(
      "Non ancora separata dalla spesa lead: arriva con il prossimo aggiornamento da Meta.",
    )]);
  }
  const campagne = c.campagne_aw ?? [];
  if (!campagne.length && num(c.spesa_aw_7g) === 0) {
    return titoletto("Awareness e interazione") + elenco([rigaDebole("Nessuna campagna di awareness o interazione negli ultimi 7 giorni.")]);
  }
  const tipi = [...new Set(campagne.map((k) => OBIETTIVI[String(k.obiettivo ?? "").toUpperCase()] ?? "Altro"))];
  const r = [
    riga("Spesa ieri", euro(num(c.spesa_aw_giorno))),
    riga("Spesa ultimi 7 giorni", euro(num(c.spesa_aw_7g))),
  ];
  if (tipi.length) r.push(riga("Campagne attive", esc(tipi.join(", "))));
  r.push(rigaDebole("Questa spesa non è inclusa nel CPL."));
  return titoletto("Awareness e interazione") + elenco(r);
}

function sezioneGestione(c: ClienteRapporto): string {
  const r: string[] = [];
  r.push(riga("Lead fermi", intero(num(c.lead_fermi))));
  if (num(c.lead_fermi) > 0) r.push(riga("Lead più vecchio", `${intero(num(c.lead_fermo_piu_vecchio_ore))} ore`));
  if (haValore(c.mediana_primo_contatto_min_7g)) {
    const m = num(c.mediana_primo_contatto_min_7g);
    const colore = m > 24 * 60 ? "#b91c1c" : m > 4 * 60 ? "#b45309" : "#047857";
    r.push(`<li style="margin:2px 0;">Prima risposta ai lead (mediana 7 giorni): <strong style="color:${colore};">${durata(m)}</strong></li>`);
  }
  r.push(riga("Sopralluoghi ultimi 14 giorni", intero(num(c.appuntamenti_14g))));
  if (haValore(c.tasso_presenza_30g)) r.push(riga("Presenza agli appuntamenti (30 giorni)", `${intero(num(c.tasso_presenza_30g) * 100)}%`));
  if (haValore(c.opp_mese) && num(c.opp_mese) > 0) {
    r.push(riga("Lead senza esito nel mese", `${intero(num(c.opp_senza_esito_mese))} su ${intero(num(c.opp_mese))}`));
  }
  if (num(c.preventivi_sospesi) > 0) r.push(riga("Preventivi fermi da oltre 10 giorni", intero(num(c.preventivi_sospesi))));
  if (haValore(c.giorni_senza_lead) && num(c.giorni_senza_lead) > 3) {
    r.push(`<li style="margin:2px 0;color:#b91c1c;">Nessun lead da <strong>${intero(num(c.giorni_senza_lead))} giorni</strong></li>`);
  }
  r.push(riga("Ultimo accesso", accesso(c.giorni_dall_ultimo_accesso)));
  if (haValore(c.indice_esecuzione)) r.push(riga("Indice di esecuzione", `${intero(num(c.indice_esecuzione))}/100`));
  return titoletto("Gestione commerciale") + elenco(r);
}

function sezioneRisultati(c: ClienteRapporto): string {
  const ind = indicatori(c);
  const vendite = num(c.vendite_mese);
  const r: string[] = [];
  r.push(riga("Contratti vinti ieri", intero(num(c.vendite_ieri))));
  r.push(riga("Contratti vinti nel mese", intero(vendite)));
  if (vendite > 0 && num(c.venduto_mese) === 0) {
    r.push(riga("Valore contratti vinti", "non disponibile (contratti senza importo nel CRM)"));
  } else {
    r.push(riga("Valore contratti vinti", euro(num(c.venduto_mese))));
  }
  if (ind.valoreMedio != null && vendite >= 2) r.push(riga("Valore medio", euro(ind.valoreMedio, 2)));
  const contratti30 = plurale(num(c.vendite_30g), "contratto", "contratti");
  const sopralluoghi30 = plurale(num(c.sopralluoghi_30g), "sopralluogo", "sopralluoghi");
  if (ind.tassoChiusura == null) {
    r.push(riga("Tasso di chiusura", "non calcolabile (nessun sopralluogo registrato in 30 giorni)"));
  } else if (ind.tassoChiusura > 100) {
    r.push(riga("Tasso di chiusura", `non affidabile (${contratti30} su ${sopralluoghi30} registrati: i sopralluoghi non vengono segnati nel CRM)`));
  } else {
    r.push(riga("Tasso di chiusura (30 giorni)", `${intero(ind.tassoChiusura)}% · ${contratti30} su ${sopralluoghi30}`));
  }
  const motivoSpesa = !c.spesa_disponibile ? "spesa non disponibile" : "nessun contratto vinto nel mese";
  r.push(riga("CAC", ind.cac != null ? euro(ind.cac) : `non calcolabile (${motivoSpesa})`));
  r.push(riga("ROAS", ind.roas != null ? unDecimale(ind.roas) : `non calcolabile (${!c.spesa_disponibile ? "spesa non disponibile" : "nessun valore vinto nel mese"})`));
  r.push(riga("Provvigione maturata", euro(num(c.provvigione_mese))));
  // Contratti registrati tutti insieme: CAC e ROAS dicono quando si è cliccato
  // «vinto», non cosa hanno prodotto le campagne del mese.
  if (vendite >= 4 && num(c.giorni_vendite_mese) === 1) {
    r.push(`<li style="margin:2px 0;color:#b45309;">I ${intero(vendite)} contratti del mese sono stati registrati tutti lo stesso giorno: CAC e ROAS vanno verificati prima di usarli.</li>`);
  }
  let html = titoletto("Risultati commerciali") + elenco(r);
  if (ind.sincronizzazione != null && ind.sincronizzazione < 90 && num(c.lead_dichiarati_7g) >= 5) {
    html += titoletto("Tracciamento") + `<p style="margin:0;">Nel CRM risultano <strong>${intero(num(c.lead_grezzi_7g))}</strong> lead su <strong>${intero(num(c.lead_dichiarati_7g))}</strong> dichiarati da Meta negli ultimi 7 giorni: sincronizzazione al <strong>${intero(ind.sincronizzazione)}%</strong>.</p>`;
  }
  return html;
}

function schedaBrand(c: ClienteRapporto): string {
  const colore = coloreBrand(c);
  const nome = esc(c.cliente_nome.toUpperCase());
  const contratto = haValore(c.giorni_alla_fine_contratto) && c.data_fine_contratto && num(c.giorni_alla_fine_contratto) <= 60 && num(c.giorni_alla_fine_contratto) >= 0
    ? `<p style="margin:2px 0 0;font-size:12px;color:#b45309;">Contratto di servizio in scadenza il ${dataBreve(c.data_fine_contratto)} (tra ${intero(num(c.giorni_alla_fine_contratto))} giorni)</p>`
    : "";
  if (colore === "verde") {
    const ind = indicatori(c);
    return `<div>
      <p style="margin:0;font-size:15px;"><strong>${nome}</strong> ${etichettaStato("verde")}</p>${contratto}
      <p style="margin:4px 0 0;">Lead ieri <strong>${intero(num(c.lead_grezzi_giorno))}</strong> · CPL <strong>${ind.cpl != null ? euro(ind.cpl, 2) : "n.d."}</strong>${haValore(c.cpl_target) ? ` (target ${euro(num(c.cpl_target), 2)})` : ""} · Contratti nel mese <strong>${intero(num(c.vendite_mese))}</strong></p>
    </div>`;
  }
  return `<div>
    <p style="margin:0;font-size:15px;"><strong>${nome}</strong> ${etichettaStato(colore)}</p>${contratto}
    <p style="margin:4px 0 0;"><em>Sintesi:</em> ${esc(sintesi(c))}</p>
    ${sezioneCampagne(c)}
    ${sezioneAwareness(c)}
    ${sezioneGestione(c)}
    ${sezioneRisultati(c)}
    ${titoletto("Azione consigliata")}<p style="margin:0;"><strong>${esc(azioneConsigliata(c))}</strong></p>
  </div>`;
}

function dataLunga(giorno: string): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${giorno}T12:00:00Z`));
}

export interface RapportoCostruito {
  subject: string;
  html: string;
  /** Lo stesso contenuto senza testata né contenitore: la sezione dell'email unica del mattino. */
  corpo: string;
  priorita: Priorita[];
  critici: number;
  attivi: number;
}

export function costruisciRapporto(r: DatiRapporto, urlConsole: string): RapportoCostruito {
  const attivi = r.clienti.filter((c) => c.stato_cliente === "attivo");
  const inPausa = r.clienti.filter((c) => c.stato_cliente !== "attivo");
  const ordinati = [...attivi].sort((a, b) =>
    ORDINE[coloreBrand(a)] - ORDINE[coloreBrand(b)] || num(b.lead_grezzi_7g) - num(a.lead_grezzi_7g));
  const critici = attivi.filter((c) => coloreBrand(c) === "rosso").length;
  const daVerificare = attivi.filter((c) => problemaMeta(c) || !c.spesa_disponibile).length;
  const tuttiSeparati = attivi.filter((c) => c.spesa_disponibile).every(spesaSeparata);
  const somma = (f: (c: ClienteRapporto) => number) => attivi.reduce((t, c) => t + f(c), 0);

  const priorita = prioritaDelGiorno(r);
  const ieri = esitoPrioritaIeri(r.priorita_ieri ?? [], priorita);

  const spesaLeadIeri = somma((c) => (c.spesa_disponibile ? spesaLead(c, "giorno") : 0));
  const spesaAwIeri = somma((c) => (spesaSeparata(c) ? num(c.spesa_aw_giorno) : 0));
  const vinteMese = somma((c) => num(c.vendite_mese));
  const valoreMese = somma((c) => num(c.venduto_mese));
  const provvigioni = num(r.denaro?.provvigioni_mese);

  const riepilogo = elenco([
    `<li style="margin:2px 0;"><strong>${attivi.length}</strong> brand attivi</li>`,
    `<li style="margin:2px 0;"><strong>${intero(somma((c) => num(c.lead_grezzi_giorno)))}</strong> lead generati ieri</li>`,
    tuttiSeparati
      ? `<li style="margin:2px 0;"><strong>${euro(spesaLeadIeri)}</strong> di spesa Lead Generation ieri</li>`
      : `<li style="margin:2px 0;"><strong>${euro(spesaLeadIeri)}</strong> di spesa pubblicitaria ieri (lead e awareness non ancora separati per tutti)</li>`,
    tuttiSeparati
      ? `<li style="margin:2px 0;"><strong>${euro(spesaAwIeri)}</strong> di spesa Awareness e interazione ieri</li>`
      : "",
    `<li style="margin:2px 0;"><strong>${intero(vinteMese)}</strong> contratti vinti nel mese</li>`,
    `<li style="margin:2px 0;"><strong>${euro(valoreMese)}</strong> di valore contratti vinti</li>`,
    `<li style="margin:2px 0;"><strong>${euro(provvigioni)}</strong> di provvigioni maturate</li>`,
    `<li style="margin:2px 0;"><strong>${critici}</strong> ${critici === 1 ? "brand critico" : "brand critici"}</li>`,
    `<li style="margin:2px 0;"><strong>${daVerificare}</strong> ${daVerificare === 1 ? "collegamento da verificare" : "collegamenti da verificare"}</li>`,
  ].filter(Boolean));

  const bloccoIeri = ieri.length
    ? titoletto("Le priorità di ieri") + elenco(ieri.map((p) =>
      `<li style="margin:2px 0;"><strong>${esc(p.cliente.toUpperCase())}</strong> — ${esc(p.titolo)}: ${esc(p.stato)} ${p.risolta
        ? `<span style="color:#047857;">(risolta)</span>`
        : `<span style="color:#c2410c;">(ancora aperta)</span>`}</li>`))
    : "";

  const bloccoPriorita = priorita.length
    ? priorita.map((p, i) => `<div style="margin:0 0 14px;">
        <p style="margin:0;font-size:14px;"><strong>${i + 1}. ${esc(p.cliente_nome.toUpperCase())} — ${esc(p.titolo)}</strong></p>
        <p style="margin:4px 0 0;"><em>Impatto:</em> ${esc(p.impatto)}</p>
        <p style="margin:2px 0 0;"><em>Azione:</em> ${esc(p.azione)}</p>
        <p style="margin:2px 0 0;color:#6b7280;">Responsabile: ${esc(p.responsabile)} · Scadenza: ${esc(p.scadenza)}${p.aperta_da_giorni ? ` · aperta da ${p.aperta_da_giorni} ${p.aperta_da_giorni === 1 ? "giorno" : "giorni"}` : ""}</p>
      </div>`).join("")
    : `<p style="margin:0;color:#047857;">Nessuna priorità: non ci sono allarmi aperti sui brand attivi.</p>`;

  const bloccoPausa = inPausa.length
    ? separatore + `<p style="margin:0;font-size:15px;"><strong>CLIENTI IN PAUSA</strong></p>` +
      inPausa.map((c) => `<p style="margin:8px 0 0;"><strong>${esc(c.cliente_nome.toUpperCase())}</strong></p>` + elenco([
        riga("Stato", "in pausa"),
        riga("Lead ieri", intero(num(c.lead_grezzi_giorno))),
        riga("Contratti vinti nel mese", intero(num(c.vendite_mese))),
        rigaDebole("Nessuna azione richiesta finché il servizio rimane sospeso."),
      ])).join("")
    : "";

  const fatture = r.denaro?.fatture_scadute ?? [];
  const economico = elenco([
    tuttiSeparati
      ? riga("Spesa Lead Generation nel mese", euro(somma((c) => (c.spesa_disponibile ? spesaLead(c, "mese") : 0))))
      : riga("Spesa pubblicitaria nel mese", euro(somma((c) => (c.spesa_disponibile ? num(c.spesa_mese) : 0)))),
    tuttiSeparati ? riga("Spesa Awareness e interazione nel mese", euro(somma((c) => num(c.spesa_aw_mese)))) : "",
    riga("Contratti vinti nel mese", intero(vinteMese)),
    riga("Valore complessivo vinto", euro(valoreMese)),
    riga("Provvigioni maturate", euro(provvigioni)),
    fatture.length
      ? `<li style="margin:2px 0;color:#b91c1c;">Fatture scadute dei clienti: ${fatture.map((f) => `<strong>${esc(f.cliente)}</strong> ${euro(num(f.importo))}, scaduta da ${intero(num(f.scaduta_da_giorni))} giorni`).join(" · ")}</li>`
      : rigaDebole("Nessuna fattura scaduta dei clienti."),
  ].filter(Boolean));

  const data = dataLunga(r.giorno);
  const subject = `Report marketing — ${dataBreve(`${r.giorno}T12:00:00Z`)} · ${priorita.length} priorità · ${critici} ${critici === 1 ? "brand critico" : "brand critici"}`;

  const corpo = `${titoletto("Riepilogo generale")}
    ${riepilogo}

    ${separatore}
    <p style="margin:0 0 10px;font-size:15px;"><strong>${priorita.length === 1 ? "LA PRIORITÀ" : priorita.length ? `LE ${priorita.length} PRIORITÀ` : "LE PRIORITÀ"} DI OGGI</strong></p>
    ${bloccoIeri ? `${bloccoIeri}<div style="height:10px;"></div>` : ""}
    ${bloccoPriorita}

    ${ordinati.map((c) => separatore + schedaBrand(c)).join("")}
    ${bloccoPausa}

    ${separatore}
    ${titoletto("Riepilogo economico")}
    ${economico}

    <p style="margin:18px 0 0;"><a href="${esc(urlConsole)}" style="color:#2563eb;font-weight:600;">Apri la console completa</a></p>
    <p style="margin:14px 0 0;font-size:11px;color:#9ca3af;">Ogni mattina alle 06:00, sui dati fino a ieri. CPL e CAC contano solo la spesa delle campagne Lead Generation: le campagne di notorietà, interazione e traffico che non portano lead sono a parte. CAC = spesa lead del mese ÷ contratti vinti nel mese. ROAS = valore vinto nel mese ÷ spesa lead del mese. Tasso di chiusura = contratti vinti ÷ sopralluoghi, ultimi 30 giorni.</p>`;

  const html = `<div style="max-width:640px;margin:0 auto;padding:20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.5;">
    <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;">Report marketing</p>
    <h1 style="margin:2px 0 14px;font-size:20px;color:#111827;">${esc(data.charAt(0).toUpperCase() + data.slice(1))}</h1>

    ${corpo}
  </div>`;

  return { subject, html, corpo, priorita, critici, attivi: attivi.length };
}
