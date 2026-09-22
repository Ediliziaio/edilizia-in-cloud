/**
 * I messaggi al cliente legati all'appuntamento (22/09/2026): conferma,
 * spostamento, promemoria del giorno prima, di un'ora prima e dei 5 minuti.
 * Email e WhatsApp.
 *
 * Gli stessi testi per ogni azienda (vengono dal «Flusso Appuntamenti» di
 * Edilizia in Cloud, resi validi per qualunque calendario): il calendario ci
 * mette il nome, il link della videochiamata, la firma e cosa preparare.
 * Nessun prezzo, mai: la cifra si dice in chiamata.
 *
 * Funzioni pure, provate in src/test/logic/messaggiAppuntamento.test.ts.
 */

import { dataEstesa, esc, romaVersoUtc } from "./appuntamentiPubblici.ts";

export interface DatiMessaggio {
  /** Nome del cliente ("" se non si sa). */
  nome: string;
  /** Nome del calendario: «Demo Edilizia in Cloud». */
  calendario: string;
  /** yyyy-MM-dd, ora italiana. */
  dataIso: string;
  /** HH:mm, ora italiana. */
  ora: string;
  durataMin: number;
  /** Link della videochiamata; senza, i testi non parlano di collegarsi. */
  linkCall?: string | null;
  /** La pagina «sposta o disdici». */
  linkGestione?: string | null;
  /** «Il team di Edilizia in Cloud». */
  firma?: string | null;
  /** Righe «cosa preparare» per la conferma, una per riga. */
  cosaPreparare?: string | null;
}

export interface EmailMessaggio {
  oggetto: string;
  html: string;
  testo: string;
}

const ciao = (nome: string) => (nome.trim() ? `Ciao ${nome.trim()}` : "Ciao");
const buongiorno = (nome: string) => (nome.trim() ? `Buongiorno ${nome.trim()}` : "Buongiorno");

/** «Martedì 22 settembre 2026». */
function giornoIntero(dataIso: string): string {
  const d = dataEstesa(dataIso);
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/** «martedì 22 settembre», senza l'anno: per l'oggetto dell'email. */
function giornoBreve(dataIso: string): string {
  return dataEstesa(dataIso).replace(/\s\d{4}$/, "");
}

function righePreparare(testo: string | null | undefined): string[] {
  return String(testo ?? "")
    .split(/\r?\n/)
    .map((r) => r.replace(/^\s*[-–•*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Il link «aggiungi a Google Calendar»: un clic e l'appuntamento è nel suo
 * calendario, col link della call come luogo. Il file .ics allegato resta per
 * Outlook e iPhone.
 */
export function linkGoogleCalendar(d: DatiMessaggio): string {
  const inizio = romaVersoUtc(d.dataIso, d.ora);
  const fine = new Date(inizio.getTime() + Math.max(1, d.durataMin) * 60_000);
  const fmt = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: d.calendario,
    dates: `${fmt(inizio)}/${fmt(fine)}`,
  });
  if (d.linkCall) {
    p.set("location", d.linkCall);
    p.set("details", `Link della videochiamata: ${d.linkCall}`);
  }
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// ─── WhatsApp ───────────────────────────────────────────────────────────────

export type MomentoWhatsapp = "conferma" | "spostato" | "promemoria_24h" | "promemoria_1h" | "promemoria_5min";

/** Il testo del WhatsApp; "" se per quel momento non c'è niente da mandare. */
export function whatsappAppuntamento(momento: MomentoWhatsapp, d: DatiMessaggio): string {
  const firma = d.firma?.trim() ? `\n\n${d.firma.trim()}` : "";
  const dettagli = [
    `📅 ${giornoIntero(d.dataIso)}`,
    `🕐 ore ${d.ora}`,
    d.linkCall ? `💻 Videochiamata di ${d.durataMin} minuti` : `⏱ ${d.durataMin} minuti`,
  ].join("\n");
  const link = d.linkCall ? `\n\nLink: ${d.linkCall}` : "";

  switch (momento) {
    case "conferma":
      return `${ciao(d.nome)}, il tuo appuntamento «${d.calendario}» è confermato!\n\n${dettagli}${link}`
        + (d.linkGestione ? `\n\nTi manderemo un promemoria prima. Se non riesci, puoi spostarlo qui:\n${d.linkGestione}` : "")
        + `\n\nRispondi OK per confermare di aver ricevuto il messaggio.${firma}`;
    case "spostato":
      return `${ciao(d.nome)}, il tuo appuntamento «${d.calendario}» è stato spostato:\n\n${dettagli}${link}`
        + (d.linkGestione ? `\n\nSe non riesci nemmeno così, puoi spostarlo qui:\n${d.linkGestione}` : "")
        + firma;
    case "promemoria_24h":
      return `${ciao(d.nome)}, ti ricordiamo l'appuntamento «${d.calendario}» di domani alle ${d.ora}.\n\nConfermi? Rispondi SÌ 👍`
        + (d.linkGestione ? `\n\nSe ti serve spostarlo:\n${d.linkGestione}` : "");
    case "promemoria_1h":
      return d.linkCall
        ? `${ciao(d.nome)}, tra un'ora ci colleghiamo, alle ${d.ora}.\n\nEcco il link:\n${d.linkCall}`
        : `${ciao(d.nome)}, ci vediamo tra un'ora, alle ${d.ora}.`;
    case "promemoria_5min":
      // Senza link non c'è niente a cui collegarsi: nessun messaggio.
      return d.linkCall ? `${ciao(d.nome)}, siamo già collegati e ti aspettiamo qui 👇\n${d.linkCall}` : "";
  }
}

// ─── Email ──────────────────────────────────────────────────────────────────

export type MomentoEmail = "conferma" | "promemoria_24h" | "promemoria_1h";

const STILE = "font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;color:#0f172a;font-size:15px;line-height:1.5";

function bottone(url: string, etichetta: string): string {
  return `<p style="margin:20px 0"><a href="${esc(url)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0f172a;color:#fff;text-decoration:none;font-weight:600">${esc(etichetta)}</a></p>`;
}

function chiusura(firma: string | null | undefined): { html: string; testo: string } {
  const f = firma?.trim() || "A presto";
  return { html: `<p>${esc(f)}</p>`, testo: f };
}

export function emailAppuntamento(momento: MomentoEmail, d: DatiMessaggio): EmailMessaggio {
  const fine = chiusura(d.firma);
  const quando = `${giornoIntero(d.dataIso)} alle ${d.ora}`;
  const comeDurata = d.linkCall ? `Videochiamata di ${d.durataMin} minuti` : `Durata: ${d.durataMin} minuti`;

  if (momento === "conferma") {
    const prep = righePreparare(d.cosaPreparare);
    const html = `<div style="${STILE}">
      <p>${esc(buongiorno(d.nome))},</p>
      <p>il tuo appuntamento «${esc(d.calendario)}» è confermato:</p>
      <p style="margin:16px 0"><strong>${esc(quando)}</strong><br>${esc(comeDurata)}</p>
      ${prep.length ? `<p>Per sfruttare bene il tempo, pensa a queste cose prima di collegarti:</p><ul style="padding-left:20px">${prep.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      ${bottone(linkGoogleCalendar(d), "Aggiungi al calendario")}
      <p style="color:#475569;font-size:13px">In allegato trovi anche il file per Outlook e iPhone.</p>
      ${d.linkCall ? `<p>Link della videochiamata: <a href="${esc(d.linkCall)}">${esc(d.linkCall)}</a></p>` : ""}
      ${d.linkGestione ? `<p>Se ti serve spostarlo: <a href="${esc(d.linkGestione)}">${esc(d.linkGestione)}</a></p>` : ""}
      ${fine.html}
    </div>`;
    const testo = [
      `${buongiorno(d.nome)},`, "",
      `il tuo appuntamento «${d.calendario}» è confermato:`, "",
      quando, comeDurata,
      ...(prep.length ? ["", "Per sfruttare bene il tempo, pensa a queste cose prima di collegarti:", ...prep.map((r) => `– ${r}`)] : []),
      ...(d.linkCall ? ["", `Link della videochiamata: ${d.linkCall}`] : []),
      ...(d.linkGestione ? [`Se ti serve spostarlo: ${d.linkGestione}`] : []),
      "", fine.testo,
    ].join("\n");
    return { oggetto: `Appuntamento confermato: ${giornoBreve(d.dataIso)} alle ${d.ora}`, html, testo };
  }

  if (momento === "promemoria_24h") {
    const html = `<div style="${STILE}">
      <p>${esc(buongiorno(d.nome))},</p>
      <p>ti ricordiamo l'appuntamento «${esc(d.calendario)}» di domani, <strong>${esc(giornoBreve(d.dataIso))}, alle ${esc(d.ora)}</strong>.</p>
      ${d.linkCall ? bottone(d.linkCall, "Collegati alla videochiamata") : ""}
      ${d.linkGestione ? `<p>Se hai un imprevisto, puoi spostarlo in un clic: <a href="${esc(d.linkGestione)}">${esc(d.linkGestione)}</a></p>` : ""}
      ${fine.html}
    </div>`;
    const testo = [
      `${buongiorno(d.nome)},`, "",
      `ti ricordiamo l'appuntamento «${d.calendario}» di domani, ${giornoBreve(d.dataIso)}, alle ${d.ora}.`,
      ...(d.linkCall ? ["", `Link della videochiamata: ${d.linkCall}`] : []),
      ...(d.linkGestione ? ["", `Se hai un imprevisto, puoi spostarlo in un clic: ${d.linkGestione}`] : []),
      "", fine.testo,
    ].join("\n");
    return { oggetto: `Promemoria: il tuo appuntamento è domani alle ${d.ora}`, html, testo };
  }

  // promemoria_1h
  const html = `<div style="${STILE}">
      <p>${esc(buongiorno(d.nome))},</p>
      <p>tra un'ora, alle <strong>${esc(d.ora)}</strong>, inizia il tuo appuntamento «${esc(d.calendario)}».</p>
      ${d.linkCall ? bottone(d.linkCall, "Collegati alla videochiamata") : ""}
      ${!d.linkCall && d.linkGestione ? bottone(d.linkGestione, "Non riesco a esserci") : ""}
      ${fine.html}
    </div>`;
  const testo = [
    `${buongiorno(d.nome)},`, "",
    `tra un'ora, alle ${d.ora}, inizia il tuo appuntamento «${d.calendario}».`,
    ...(d.linkCall ? ["", `Link della videochiamata: ${d.linkCall}`] : []),
    ...(!d.linkCall && d.linkGestione ? ["", `Se non riesci a esserci: ${d.linkGestione}`] : []),
    "", fine.testo,
  ].join("\n");
  return {
    oggetto: d.linkCall ? "Tra un'ora il tuo appuntamento: ecco il link" : `Tra un'ora: ${d.calendario}`,
    html, testo,
  };
}

// ─── Quando ─────────────────────────────────────────────────────────────────

export type MomentoPromemoria = "conferma" | "promemoria_24h" | "promemoria_1h" | "promemoria_5min";

export interface StatoAppuntamento {
  /** Adesso, in ms. */
  adesso: number;
  /** Inizio dell'appuntamento, in ms (già convertito dall'ora italiana). */
  inizio: number;
  creatoIl: number;
  /** Quando è partita l'ultima conferma (null = mai, o tolta da uno spostamento). */
  confermaInviataIl: number | null;
  /** Promemoria già mandati per questa data. */
  giaMandati: { h24: boolean; h1: boolean; m5: boolean };
  /** Se la conferma spetta a questo giro (appuntamento inserito a mano, o spostato). */
  confermaDovuta: boolean;
}

const ORA = 3_600_000;
const MINUTO = 60_000;

/**
 * Cosa mandare adesso, con le regole del «Flusso Appuntamenti»: il giorno
 * prima, un'ora prima, 5 minuti prima; chi fissa per meno di 24 ore dopo non
 * riceve quello del giorno prima, chi fissa per meno di un'ora dopo solo
 * quello dei 5 minuti. Le finestre tengono conto del giro ogni 5 minuti.
 */
export function momentiDaMandare(s: StatoAppuntamento): MomentoPromemoria[] {
  const mancano = s.inizio - s.adesso;
  if (mancano <= 0) return [];
  // Nel giro della conferma nessun promemoria: arriverebbero insieme.
  if (s.confermaDovuta && s.confermaInviataIl == null) return ["conferma"];
  // Con quanto anticipo è stato fissato così com'è: dalla creazione o
  // dall'ultima conferma (uno spostamento la rimanda).
  const anticipo = s.inizio - Math.max(s.creatoIl, s.confermaInviataIl ?? 0);
  const momenti: MomentoPromemoria[] = [];
  if (!s.giaMandati.h24 && mancano <= 24 * ORA && mancano > 23 * ORA && anticipo >= 24 * ORA) momenti.push("promemoria_24h");
  if (!s.giaMandati.h1 && mancano <= 60 * MINUTO && mancano > 45 * MINUTO && anticipo >= 60 * MINUTO) momenti.push("promemoria_1h");
  if (!s.giaMandati.m5 && mancano <= 7 * MINUTO && mancano > 2 * MINUTO) momenti.push("promemoria_5min");
  return momenti;
}
