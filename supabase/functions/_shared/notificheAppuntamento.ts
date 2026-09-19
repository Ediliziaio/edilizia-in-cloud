/**
 * notificheAppuntamento — i testi delle email automatiche degli appuntamenti
 * fissati dall'azienda (vedi la funzione appuntamenti-notifiche).
 *
 * Solo composizione: niente database e niente invio, così i testi si provano e
 * si fanno leggere prima di mandarli a qualcuno. Le regole vengono dalla
 * richiesta di Il Bagno Group (18/09/2026): in italiano (con GoHighLevel
 * arrivava tutto in inglese), e al cliente mai le note, che sono del
 * consulente.
 */

import {
  blocchettoContatti, blocchettoNote, bottoneGestione, creaIcs, dataBreve, dataEstesa, esc, minutiDa,
} from "./appuntamentiPubblici.ts";
import { dataOraItaliana } from "./oraItaliana.ts";

/** Quello che restituisce la RPC `appuntamento_da_notificare`. */
export interface AppuntamentoDaNotificare {
  id: string;
  company_id: string;
  data: string;               // yyyy-MM-dd, ora italiana
  ora: string | null;         // HH:mm
  ora_fine: string | null;
  inizio: string;             // istante
  tipo: string;
  stato: string;
  bloccato: boolean;
  pubblico: boolean;
  creato_il: string;
  titolo: string | null;
  descrizione: string | null;
  note_interne: string | null;
  link_video: string | null;
  indirizzo: string | null;
  indirizzo_via: string | null;
  indirizzo_citta: string | null;
  fuori_sede: boolean;
  azienda: { nome: string | null; piva: string | null; email: string | null; telefono: string | null; notifiche_dal: string | null } | null;
  consulente: { id: string; nome: string | null; cognome: string | null; email: string | null; telefono: string | null } | null;
  sede: { nome: string; via: string | null; cap: string | null; citta: string | null; prov: string | null } | null;
  cliente: { id: string; nome: string | null; cognome: string | null; email: string | null; telefono: string | null; indirizzo: string | null } | null;
  creato_da: string | null;
}

export type TipoNotifica =
  | "cliente_conferma" | "cliente_spostamento" | "cliente_annullamento" | "cliente_promemoria"
  | "consulente_nuovo" | "consulente_spostamento" | "consulente_annullamento";

export interface EmailComposta {
  oggetto: string;
  html: string;
  testo: string;
}

export const STATI_ANNULLATI = new Set(["annullato", "cancellato", "cancelled"]);
export const STATI_ATTIVI = new Set(["confermato", "in_attesa"]);

// ── Cosa, chi, dove ─────────────────────────────────────────────────────────

interface Cosa { nome: string; femminile: boolean; conArticolo: string }

const COSE: Record<string, Cosa> = {
  rilievo_tecnico: { nome: "Rilievo tecnico", femminile: false, conArticolo: "il rilievo tecnico" },
  misurazione:     { nome: "Misurazione", femminile: true, conArticolo: "la misurazione" },
  assistenza:      { nome: "Intervento di assistenza", femminile: false, conArticolo: "l'intervento di assistenza" },
  manutenzione:    { nome: "Intervento di manutenzione", femminile: false, conArticolo: "l'intervento di manutenzione" },
  consegna:        { nome: "Consegna", femminile: true, conArticolo: "la consegna" },
  videocall:       { nome: "Videochiamata", femminile: true, conArticolo: "la videochiamata" },
};
const APPUNTAMENTO: Cosa = { nome: "Appuntamento", femminile: false, conArticolo: "l'appuntamento" };

export function cosaE(tipo: string): Cosa {
  return COSE[tipo] ?? APPUNTAMENTO;
}

/** «confermato» → «confermata» quando serve. */
function accorda(parola: string, femminile: boolean): string {
  return femminile ? parola.replace(/o$/, "a") : parola;
}

/** Le etichette della schermata appuntamento, per l'email al consulente. */
const TIPI: Record<string, string> = {
  sopralluogo_preventivo: "Sopralluogo preventivo", rilievo_tecnico: "Rilievo tecnico", misurazione: "Misurazione",
  conferma_ordine: "Conferma ordine", verifica_cantiere: "Verifica cantiere", inizio_lavori: "Inizio lavori",
  fine_lavori: "Fine lavori", posa_prova: "Posa di prova", consegna: "Consegna", collaudo: "Collaudo",
  assistenza: "Assistenza post-vendita", manutenzione: "Manutenzione", ispezione: "Ispezione tecnica",
  sopralluogo: "Sopralluogo", riunione: "Riunione", cliente: "Appuntamento cliente", videocall: "Videochiamata",
};

export function nomeCompleto(p: { nome?: string | null; cognome?: string | null } | null | undefined): string {
  return [p?.nome, p?.cognome].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
}

export interface Luogo {
  /** «Show-room di Lissone», «Videochiamata», oppure l'indirizzo. */
  etichetta: string;
  /** La riga sotto l'etichetta (l'indirizzo dello showroom). */
  indirizzo: string | null;
  link: string | null;
  linkTesto: string | null;
  /** Come si dice nella frase: «nel nostro show-room di Lissone». */
  frase: string;
  /** Cosa conta per capire se il luogo è cambiato davvero. */
  chiave: string;
}

const mappa = (indirizzo: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzo)}`;

/**
 * Dove si svolge, con le regole del titolo automatico: lo showroom del
 * consulente; l'indirizzo scritto nell'appuntamento per chi lavora fuori
 * (Vincenzo) e per rilievi, consegne, assistenza; per quelli, se l'indirizzo
 * manca, quello del cliente. Senza niente di tutto questo, nessuna riga
 * «Dove»: meglio niente che un luogo inventato.
 */
export function luogoAppuntamento(a: AppuntamentoDaNotificare): Luogo | null {
  if (a.tipo === "videocall" || (a.link_video && !a.fuori_sede)) {
    return {
      etichetta: "Videochiamata",
      indirizzo: null,
      link: a.link_video,
      linkTesto: a.link_video ? "Entra nella videochiamata" : null,
      frase: a.tipo === "videocall" ? "" : "in videochiamata",
      chiave: "video",
    };
  }
  if (a.sede) {
    const citta = [a.sede.cap, a.sede.citta].filter(Boolean).join(" ") + (a.sede.prov ? ` (${a.sede.prov})` : "");
    const indirizzo = [a.sede.via, citta.trim()].filter((x) => x && x.trim()).join(", ") || null;
    return {
      etichetta: `Show-room di ${a.sede.nome}`,
      indirizzo,
      link: indirizzo ? mappa(indirizzo) : null,
      linkTesto: indirizzo ? "Apri in Google Maps" : null,
      frase: `nel nostro show-room di ${a.sede.nome}`,
      chiave: `sede:${a.sede.nome}`,
    };
  }
  if (a.indirizzo) {
    return {
      etichetta: a.indirizzo,
      indirizzo: null,
      link: mappa(a.indirizzo),
      linkTesto: "Apri in Google Maps",
      frase: `in ${a.indirizzo}`,
      chiave: `ind:${String(a.indirizzo_via ?? "").trim().toLowerCase()}|${String(a.indirizzo_citta ?? "").trim().toLowerCase()}`,
    };
  }
  if (a.fuori_sede && a.cliente?.indirizzo) {
    return {
      etichetta: a.cliente.indirizzo,
      indirizzo: null,
      link: mappa(a.cliente.indirizzo),
      linkTesto: "Apri in Google Maps",
      frase: `a casa tua, in ${a.cliente.indirizzo}`,
      chiave: "cliente",
    };
  }
  return null;
}

/**
 * La fotografia di ciò che si dice al cliente: giorno, ora, consulente, luogo.
 * Se cambia, il cliente riceve i dettagli nuovi; se no, non riceve niente.
 */
export function chiaveAppuntamento(a: AppuntamentoDaNotificare, luogo: Luogo | null): string {
  return [a.data, a.ora ?? "", a.consulente?.id ?? "", luogo?.chiave ?? ""].join("|");
}

/** Le chiavi registrate portano in coda «#n» (quante volte era stato annullato). */
export function baseDellaChiave(chiave: string): string {
  return chiave.split("#")[0];
}

/** Giorno e ora scritti in una chiave registrata. */
export function quandoDallaChiave(chiave: string): { data: string; ora: string | null } | null {
  const [data, ora] = baseDellaChiave(chiave).split("|");
  return /^\d{4}-\d{2}-\d{2}$/.test(data ?? "") ? { data, ora: ora || null } : null;
}

// ── Date ────────────────────────────────────────────────────────────────────

function senzaAnno(dataIso: string): string {
  return dataEstesa(dataIso).replace(/ \d{4}$/, "");
}

/** «giovedì 25 settembre 2026 alle 10:00». */
export function quando(a: { data: string; ora: string | null }): string {
  return `${dataEstesa(a.data)}${a.ora ? ` alle ${a.ora}` : ""}`;
}

/** «giovedì 25 settembre alle 10:00», per l'oggetto. */
export function quandoBreve(a: { data: string; ora: string | null }): string {
  return `${senzaAnno(a.data)}${a.ora ? ` alle ${a.ora}` : ""}`;
}

/** «oggi», «domani» oppure null, in ora italiana. */
export function giornoRelativo(dataIso: string, adesso: Date): "oggi" | "domani" | null {
  const oggi = dataOraItaliana(adesso.toISOString())?.data;
  if (!oggi) return null;
  if (dataIso === oggi) return "oggi";
  const [y, m, d] = oggi.split("-").map(Number);
  const domani = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return dataIso === domani ? "domani" : null;
}

// ── Pezzi di HTML ───────────────────────────────────────────────────────────

const CORNICE = "font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;color:#0f172a;font-size:15px;line-height:1.5";

function riga(etichetta: string, valoreHtml: string): string {
  return `<tr><td style="padding:4px 14px 4px 0;color:#64748b;vertical-align:top;white-space:nowrap">${esc(etichetta)}</td><td style="padding:4px 0">${valoreHtml}</td></tr>`;
}

function htmlLuogo(luogo: Luogo): string {
  const parti = [esc(luogo.etichetta)];
  if (luogo.indirizzo) parti.push(esc(luogo.indirizzo));
  if (luogo.link && luogo.linkTesto) {
    parti.push(`<a href="${esc(luogo.link)}" style="color:#2563eb">${esc(luogo.linkTesto)}</a>`);
  }
  return parti.join("<br>");
}

function testoLuogo(luogo: Luogo): string {
  return [luogo.etichetta, luogo.indirizzo, luogo.link].filter(Boolean).join("\n       ");
}

function tabella(righe: string[]): string {
  return `<table style="border-collapse:collapse;margin:16px 0;font-size:15px">${righe.join("")}</table>`;
}

function dettagliCliente(a: AppuntamentoDaNotificare, luogo: Luogo | null): { html: string; testo: string } {
  const righe = [riga("Quando", `<strong>${esc(quando(a))}</strong>`)];
  const testo = [`Quando: ${quando(a)}`];
  if (luogo) {
    righe.push(riga("Dove", htmlLuogo(luogo)));
    testo.push(`Dove:  ${testoLuogo(luogo)}`);
  }
  const consulente = nomeCompleto(a.consulente);
  if (consulente) {
    righe.push(riga("Con", esc(consulente)));
    testo.push(`Con:   ${consulente}`);
  }
  return { html: tabella(righe), testo: testo.join("\n") };
}

function saluto(a: AppuntamentoDaNotificare): string {
  const nome = String(a.cliente?.nome ?? "").trim() || nomeCompleto(a.cliente);
  return nome ? `Ciao ${nome},` : "Buongiorno,";
}

function firma(a: AppuntamentoDaNotificare): { html: string; testo: string } {
  const righe = [nomeCompleto(a.consulente), String(a.azienda?.nome ?? "").trim()].filter(Boolean);
  return {
    html: `<p style="margin:20px 0 0">A presto,<br>${righe.map(esc).join("<br>")}</p>`,
    testo: ["A presto,", ...righe].join("\n"),
  };
}

/** Ragione sociale e P.IVA; senza P.IVA niente: il nome è già nella firma. */
function piede(a: AppuntamentoDaNotificare): { html: string; testo: string } {
  const nome = String(a.azienda?.nome ?? "").trim();
  if (!nome || !a.azienda?.piva) return { html: "", testo: "" };
  const riga = `${nome} — P.IVA ${a.azienda.piva}`;
  return {
    html: `<p style="margin:28px 0 0;padding-top:12px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px">${esc(riga)}</p>`,
    testo: `\n--\n${riga}`,
  };
}

function paragrafo(testo: string): string {
  return `<p style="margin:0 0 12px">${esc(testo)}</p>`;
}

function componi(a: AppuntamentoDaNotificare, oggetto: string, paragrafiPrima: string[], dettagli: { html: string; testo: string } | null, paragrafiDopo: string[]): EmailComposta {
  const f = firma(a);
  const p = piede(a);
  const html = `<div style="${CORNICE}">
      ${paragrafo(saluto(a))}
      ${paragrafiPrima.map(paragrafo).join("\n      ")}
      ${dettagli?.html ?? ""}
      ${paragrafiDopo.map(paragrafo).join("\n      ")}
      ${f.html}
      ${p.html}
    </div>`;
  const testo = [saluto(a), ...paragrafiPrima, dettagli?.testo ?? "", ...paragrafiDopo, f.testo, p.testo]
    .filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return { oggetto, html, testo };
}

// ── Al cliente ──────────────────────────────────────────────────────────────

const PER_CAMBIARE = "Se hai un imprevisto, rispondi a questa email: troviamo insieme un altro orario.";
const ALLEGATO = "In allegato trovi il file per aggiungerlo al tuo calendario.";

function lineaFuoriSede(a: AppuntamentoDaNotificare, luogo: Luogo | null): string[] {
  return a.fuori_sede && luogo && luogo.chiave !== "video"
    ? ["Ti chiediamo solo di farti trovare all'indirizzo indicato all'ora concordata."]
    : [];
}

export function emailConferma(a: AppuntamentoDaNotificare, luogo: Luogo | null): EmailComposta {
  const cosa = cosaE(a.tipo);
  const dove = luogo?.frase ? ` ${luogo.frase}` : "";
  return componi(
    a,
    `${cosa.nome} ${accorda("confermato", cosa.femminile)}: ${quandoBreve(a)}`,
    [`ti confermiamo ${cosa.conArticolo}${dove}.`],
    dettagliCliente(a, luogo),
    [...lineaFuoriSede(a, luogo), PER_CAMBIARE, ...(a.ora ? [ALLEGATO] : [])],
  );
}

export function emailSpostamento(a: AppuntamentoDaNotificare, luogo: Luogo | null, prima: { data: string; ora: string | null } | null): EmailComposta {
  const cosa = cosaE(a.tipo);
  const spostato = Boolean(prima && (prima.data !== a.data || (prima.ora ?? null) !== (a.ora ?? null)));
  const stato = accorda("stato", cosa.femminile);
  const apertura = spostato
    ? `${cosa.conArticolo} è ${stato} ${accorda("spostato", cosa.femminile)}: prima era ${quando(prima!)}. Ecco i dettagli aggiornati.`
    : `abbiamo aggiornato i dettagli per ${cosa.conArticolo}.`;
  return componi(
    a,
    `${cosa.nome} ${accorda(spostato ? "spostato" : "aggiornato", cosa.femminile)}: ${quandoBreve(a)}`,
    [apertura],
    dettagliCliente(a, luogo),
    [...lineaFuoriSede(a, luogo), PER_CAMBIARE, ...(a.ora ? ["In allegato trovi il file aggiornato per il tuo calendario."] : [])],
  );
}

export function emailAnnullamento(a: AppuntamentoDaNotificare, luogo: Luogo | null): EmailComposta {
  const cosa = cosaE(a.tipo);
  const dove = luogo?.frase ? ` ${luogo.frase}` : "";
  const stato = accorda("stato", cosa.femminile);
  return componi(
    a,
    `${cosa.nome} ${accorda("annullato", cosa.femminile)}: ${quandoBreve(a)}`,
    [`${cosa.conArticolo} di ${quando(a)}${dove} è ${stato} ${accorda("annullato", cosa.femminile)}.`],
    null,
    ["Se vuoi fissare una nuova data, rispondi a questa email."],
  );
}

export function emailPromemoria(a: AppuntamentoDaNotificare, luogo: Luogo | null, adesso: Date): EmailComposta {
  const cosa = cosaE(a.tipo);
  const rel = giornoRelativo(a.data, adesso);
  const giorno = rel ? `${rel}, ${senzaAnno(a.data)},` : `${senzaAnno(a.data)}`;
  const alle = a.ora ? ` alle ${a.ora}` : "";
  const oggetto = a.sede && a.tipo !== "videocall"
    ? `Ci vediamo ${rel ?? senzaAnno(a.data)}${alle}`
    : `${cosa.nome} ${rel ?? senzaAnno(a.data)}${alle}`;
  return componi(
    a,
    oggetto,
    [`ti ricordiamo ${cosa.conArticolo} di ${giorno}${alle}`.replace(/,$/, "") + "."],
    dettagliCliente(a, luogo),
    [...lineaFuoriSede(a, luogo), "Se non riesci più, rispondi a questa email e troviamo un altro orario."],
  );
}

/** Il file .ics per il calendario del cliente. Senza ora non c'è. */
export function icsCliente(a: AppuntamentoDaNotificare, luogo: Luogo | null, opz: { annullato?: boolean; sequenza: number }): string | null {
  if (!a.ora) return null;
  const durata = a.ora_fine ? minutiDa(a.ora_fine) - minutiDa(a.ora) : 60;
  const consulente = nomeCompleto(a.consulente);
  const azienda = String(a.azienda?.nome ?? "").trim();
  return creaIcs({
    uid: `${a.id}@ediliziaincloud.com`,
    titolo: azienda ? `${cosaE(a.tipo).nome} — ${azienda}` : cosaE(a.tipo).nome,
    descrizione: consulente ? `Con ${consulente}` : null,
    luogo: luogo ? (luogo.indirizzo ?? (luogo.chiave === "video" ? luogo.link : luogo.etichetta)) : null,
    dataIso: a.data,
    ora: a.ora,
    durataMin: durata > 0 ? durata : 60,
    partecipante: a.cliente?.email ?? null,
    annullato: opz.annullato,
    sequenza: opz.sequenza,
  });
}

// ── Al consulente ───────────────────────────────────────────────────────────

export interface ContestoConsulente {
  /** Nome di chi ha fissato, spostato o annullato. */
  autore: string | null;
  prima: { data: string; ora: string | null } | null;
  /** true: il cliente ha avuto l'email; false: non ce l'ha; null: non si dice. */
  clienteAvvisato: boolean | null;
  linkCalendario: string;
}

export function emailConsulente(
  tipo: "consulente_nuovo" | "consulente_spostamento" | "consulente_annullamento",
  a: AppuntamentoDaNotificare,
  luogo: Luogo | null,
  ctx: ContestoConsulente,
): EmailComposta {
  const intestazione = tipo === "consulente_nuovo" ? "Nuovo appuntamento"
    : tipo === "consulente_spostamento" ? "Appuntamento spostato" : "Appuntamento annullato";
  const chi = nomeCompleto(a.cliente) || String(a.titolo ?? "").trim() || "Appuntamento";
  const quandoCorto = a.ora ? dataBreve(a.data, a.ora) : senzaAnno(a.data);

  const fatto = tipo === "consulente_nuovo"
    ? (ctx.autore ? `Fissato da ${ctx.autore}.` : "")
    : tipo === "consulente_spostamento"
      ? `${ctx.autore ?? "Qualcuno"} l'ha spostato${ctx.prima ? `: prima era ${quandoBreve(ctx.prima)}` : ""}.`
      : `${ctx.autore ?? "Qualcuno"} l'ha annullato.`;

  const righe = [riga("Quando", `<strong>${esc(quando(a))}</strong>`)];
  const testo = [`Quando: ${quando(a)}`];
  if (luogo) {
    righe.push(riga("Dove", htmlLuogo(luogo)));
    testo.push(`Dove:  ${testoLuogo(luogo)}`);
  }
  const etichettaTipo = TIPI[a.tipo];
  if (etichettaTipo) {
    righe.push(riga("Tipo", esc(etichettaTipo)));
    testo.push(`Tipo:  ${etichettaTipo}`);
  }

  const note = [a.descrizione, a.note_interne].filter(Boolean).join("\n\n") || null;

  const avviso = ctx.clienteAvvisato === null ? ""
    : !a.cliente ? "All'appuntamento non è collegato nessun cliente."
    : ctx.clienteAvvisato
      ? (tipo === "consulente_annullamento" ? "Il cliente ha ricevuto l'avviso via email."
        : tipo === "consulente_spostamento" ? "Il cliente ha ricevuto i nuovi dettagli via email."
        : "Il cliente ha ricevuto la conferma via email.")
      : "Il cliente non ha un indirizzo email: avvisalo tu.";

  const html = `<div style="${CORNICE}">
      <p style="margin:0 0 2px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#64748b">${esc(intestazione)}</p>
      <h1 style="margin:0 0 6px;font-size:21px;line-height:1.25;font-weight:700">${esc(chi)}</h1>
      ${fatto ? `<p style="margin:0 0 4px;color:#475569">${esc(fatto)}</p>` : ""}
      ${tabella(righe)}
      ${blocchettoContatti(a.cliente?.email ?? null, a.cliente?.telefono ?? null)}
      ${blocchettoNote(note)}
      ${avviso ? `<p style="margin:0 0 12px;color:#475569">${esc(avviso)}</p>` : ""}
      ${bottoneGestione(ctx.linkCalendario, "Apri il calendario")}
    </div>`;

  const contatti = [a.cliente?.email && `Email: ${a.cliente.email}`, a.cliente?.telefono && `Telefono: ${a.cliente.telefono}`].filter(Boolean);
  const testoCompleto = [
    `${intestazione}: ${chi}`,
    fatto,
    "",
    ...testo,
    ...(contatti.length ? ["", ...contatti] : []),
    ...(note ? ["", `Note: ${note}`] : []),
    ...(avviso ? ["", avviso] : []),
    "",
    `Apri il calendario: ${ctx.linkCalendario}`,
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return { oggetto: `${intestazione}: ${chi} — ${quandoCorto}`, html, testo: testoCompleto };
}
