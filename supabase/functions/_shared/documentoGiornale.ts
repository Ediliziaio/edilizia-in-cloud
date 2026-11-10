/**
 * Il documento del giornale dei lavori in HTML, pronto da stampare: lo usano
 * l'esportazione (`generate-giornale-pdf`) e il link alla direzione lavori
 * (`giornale-dl-documento`). Modulo puro: i dati li legge `datiDocumentoGiornale.ts`.
 *
 * Il numero di pagina lo scrive la stampa del browser (@page, margini con counter):
 * è l'unico che conosce i fogli veri. Sullo schermo resta «Giornata N di M».
 *
 * La grafica è quella dello stile unico dei documenti (stileDocumenti.ts, 10/11/2026): testata col logo a sinistra
 * su bianco e il titolo a destra, filetto d'accento, riquadri e etichette tenui, dati societari nel piè.
 */
import { eventiPerTipo, oraBreve, problemaAperto, type EventoGiornale } from "./eventiGiornale.ts";
import { accentoHtml, piedeSocietarioCss, vesteHtml } from "./vesteHtml.ts";
import { cssDocumento, pagina, testata } from "./stileDocumenti.ts";
import { senzaEmoji } from "./senzaEmoji.ts";

/** Oltre, il documento diventa un album: il giornale le conta e ne mostra le prime. */
export const MAX_FOTO_PER_GIORNATA = 12;

export function escHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined || s === "") return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function fmtData(d: string | null | undefined): string {
  if (!d) return "—";
  const parti = d.slice(0, 10).split("-");
  if (parti.length !== 3) return d;
  const [y, m, g] = parti;
  return `${g}/${m}/${y}`;
}

/** Data e ora a Roma: il server gira in UTC. */
export function fmtDataOra(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d).replace(",", "");
}

export interface PersonaDocumento {
  nome: string;
  ore: number;
}

export interface AnnotazioneDocumento {
  testo: string;
  created_at: string;
  autore: string;
}

export interface GiornataDocumento {
  id: string;
  data_lavori: string;
  stato?: string | null;
  condizioni_meteo: string | null;
  lavorazioni_eseguite: string | null;
  materiali_utilizzati: string | null;
  personale_presente: number | null;
  note: string | null;
  avanzamento_percentuale: number | null;
  temperatura: string | null;
  firmato_da: string | null;
  firmato_il: string | null;
  pm_signed_at?: string | null;
  pm_signature_hash?: string | null;
  /** Nome di chi ha firmato la pagina. */
  firmatario?: string;
  /** Il ruolo di chi ha firmato in fondo alla pagina (`firmato_da`), dalla sua scheda dipendente; assente = «Firma». */
  firmato_da_ruolo?: string | null;
  /** Indirizzi firmati ("" = non leggibile, si salta). */
  foto_link?: string[];
  eventi?: EventoGiornale[];
  annotazioni?: AnnotazioneDocumento[];
  persone?: PersonaDocumento[];
}

export interface CommessaDocumento {
  description: string;
  order_code: string | null;
}

export interface AziendaDocumentoGiornale {
  ragione_sociale: string;
  partita_iva: string | null;
  colore_primario: string | null;
  /** Il colore del marchio scelto in «Brand & Azienda» (coloreMarchioAzienda), se l'anagrafica non ne ha uno. */
  colore_marchio?: string | null;
  logo_url: string | null;
  indirizzo?: string | null;
  citta?: string | null;
  cap?: string | null;
  telefono?: string | null;
  email?: string | null;
}

// Senza emoji (10/11/2026): in stampa non escono, e su un documento di cantiere non stanno bene.
const METEO_LABEL: Record<string, string> = {
  soleggiato: "Soleggiato",
  nuvoloso: "Nuvoloso",
  pioggia: "Pioggia",
  neve: "Neve",
  "vento forte": "Vento forte",
};

const blocco = (titolo: string, corpo: string) => `<div style="margin-bottom:8pt;">
            <div class="titoletto">${titolo}</div>
            ${corpo}
          </div>`;

const oreTesto = (ore: number) => (ore > 0 ? ` (${(Math.round(ore * 100) / 100).toLocaleString("it-IT")} h)` : "");

export const firmata = (g: Pick<GiornataDocumento, "stato">) => g.stato === "firmata";

function statoHtml(g: GiornataDocumento): string {
  if (!firmata(g)) {
    return `<div style="margin-bottom:8pt;"><span class="doc-etichetta">Bozza, non firmata</span></div>`;
  }
  const impronta = (g.pm_signature_hash ?? "").slice(0, 12);
  return `<div class="nota" style="margin-bottom:8pt;">
            <span class="doc-etichetta ok">Firmata</span> il ${escHtml(fmtDataOra(g.pm_signed_at))}${g.firmatario ? ` da <strong>${escHtml(g.firmatario)}</strong>` : ""}${impronta ? ` · impronta <code>${escHtml(impronta)}</code>` : ""}
          </div>`;
}

function eventiHtml(eventi: EventoGiornale[]): string {
  const gruppi = eventiPerTipo(eventi);
  if (!gruppi.length) return "";
  const corpo = gruppi.map((g) => `<div style="margin-bottom:4px;">
              <div style="font-weight:700;">${escHtml(g.etichetta)}</div>
              ${g.eventi.map((e) => {
    const ora = oraBreve(e.ora);
    const stato = e.tipo !== "problema"
      ? ""
      : problemaAperto(e)
      ? ` <strong style="color:var(--warn);">[Aperto]</strong>`
      : ` <strong style="color:var(--ok);">[Chiuso il ${escHtml(fmtDataOra(e.chiuso_il))}]</strong>${e.nota_chiusura ? ` ${escHtml(e.nota_chiusura)}` : ""}`;
    return `<div style="white-space:pre-wrap;">${ora ? `${escHtml(ora)} · ` : ""}${escHtml(e.testo)}${stato}</div>`;
  }).join("")}
            </div>`).join("");
  return blocco("Eventi della giornata", corpo);
}

function fotoHtml(link: string[]): string {
  if (!link.length) return "";
  const altre = link.length - MAX_FOTO_PER_GIORNATA;
  return blocco(`Foto (${link.length})`, `<div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${link.slice(0, MAX_FOTO_PER_GIORNATA).map((u) => `<img src="${escHtml(u)}" alt="Foto del cantiere" style="width:110px;height:110px;object-fit:cover;border-radius:3pt;border:.75pt solid var(--line);" />`).join("")}
              ${altre > 0 ? `<span class="nota" style="align-self:center;">+${altre} nel gestionale</span>` : ""}
            </div>`);
}

function annotazioniHtml(annotazioni: AnnotazioneDocumento[]): string {
  if (!annotazioni.length) return "";
  return `<div style="margin-top:8pt;padding-top:8pt;border-top:.75pt solid var(--line);">
            <div class="titoletto">Annotazioni successive alla firma</div>
            ${annotazioni.map((a) => `<div style="margin-bottom:6pt;">
              <div class="nota">${escHtml(fmtDataOra(a.created_at))}${a.autore ? ` · ${escHtml(a.autore)}` : ""}</div>
              <div style="white-space:pre-wrap;">${escHtml(a.testo)}</div>
            </div>`).join("")}
          </div>`;
}

/**
 * `companyId`: per la veste propria dell'azienda (logo grande e piè, vesteHtml). Il documento esce senza emoji:
 * nemmeno quelle scritte nel testo delle giornate (meteo, lavorazioni, note).
 */
export function buildGiornaleHtml(
  entries: GiornataDocumento[],
  order: CommessaDocumento | null,
  azienda: AziendaDocumentoGiornale,
  brandFooter?: string,
  companyId?: string | null,
): string {
  return senzaEmoji(htmlGiornale(entries, order, azienda, brandFooter, companyId));
}

function htmlGiornale(
  entries: GiornataDocumento[],
  order: CommessaDocumento | null,
  azienda: AziendaDocumentoGiornale,
  brandFooter: string | undefined,
  companyId: string | null | undefined,
): string {
  // A4 meno i margini laterali dello stile unico.
  const veste = vesteHtml(companyId, 210 - (2 * pagina.margineLaterale * 25.4) / 72);
  // L'accento dello stile unico (10/11/2026): il colore della veste, poi quello dell'azienda, poi il predefinito.
  const colore = accentoHtml(companyId, azienda.colore_primario, azienda.colore_marchio);
  const title = order
    ? `Giornale dei Lavori — ${order.order_code ? `#${order.order_code} ` : ""}${order.description}`
    : "Giornale dei Lavori";
  const inBozza = entries.filter((e) => !firmata(e)).length;

  const entriesHtml = entries.map((e, i) => {
    const persone = e.persone ?? [];
    return `
    <div class="giornata">
      <div class="giornata-testa">
        <span>${fmtData(e.data_lavori)} <span style="font-weight:400;color:var(--muted);">· Giornata ${i + 1} di ${entries.length}</span></span>
        <span style="font-weight:400;">${e.avanzamento_percentuale != null ? `Avanzamento: ${e.avanzamento_percentuale}%` : ""}</span>
      </div>
      <div class="giornata-corpo">
          ${statoHtml(e)}
          <div class="nota" style="display:flex;flex-wrap:wrap;gap:16pt;margin-bottom:8pt;">
            ${e.condizioni_meteo ? `<span>${METEO_LABEL[e.condizioni_meteo] || escHtml(e.condizioni_meteo)}</span>` : ""}
            ${e.temperatura ? `<span>Temperatura: ${escHtml(e.temperatura)}</span>` : ""}
            ${e.personale_presente != null ? `<span>${e.personale_presente} ${e.personale_presente === 1 ? "operaio" : "operai"}</span>` : ""}
          </div>
          ${persone.length ? blocco("Presenti", `<div>${persone.map((p) => `${escHtml(p.nome)}${oreTesto(p.ore)}`).join(", ")}</div>`) : ""}
          ${e.lavorazioni_eseguite ? blocco("Lavorazioni eseguite", `<div style="white-space:pre-wrap;">${escHtml(e.lavorazioni_eseguite)}</div>`) : ""}
          ${e.materiali_utilizzati ? blocco("Materiali utilizzati", `<div style="white-space:pre-wrap;">${escHtml(e.materiali_utilizzati)}</div>`) : ""}
          ${eventiHtml(e.eventi ?? [])}
          ${e.note ? blocco("Note", `<div style="white-space:pre-wrap;">${escHtml(e.note)}</div>`) : ""}
          ${fotoHtml((e.foto_link ?? []).filter(Boolean))}
          ${e.firmato_da ? `<div style="margin-top:8pt;padding-top:6pt;border-top:.5pt solid var(--line);">
            ${escHtml(e.firmato_da_ruolo?.trim() || "Firma")}: <strong>${escHtml(e.firmato_da)}</strong>${e.firmato_il ? ` — ${fmtData(e.firmato_il)}` : ""}
          </div>` : ""}
          ${annotazioniHtml(e.annotazioni ?? [])}
      </div>
    </div>`;
  }).join("");

  const indirizzo = [azienda.indirizzo, azienda.cap, azienda.citta].filter(Boolean).join(", ");

  // Il piè dello stile unico per chi non ha una veste: i dati societari, che con il logo non stanno più nella testata.
  const piede = veste.attiva ? "" : piedeSocietarioCss([
    [azienda.ragione_sociale, azienda.partita_iva ? `P.IVA ${azienda.partita_iva}` : ""].filter(Boolean).join(" — "),
    [indirizzo, azienda.telefono ? `Tel. ${azienda.telefono}` : "", azienda.email ?? ""].filter(Boolean).join(" · "),
  ]);
  const logo = azienda.logo_url
    ? `<img src="${escHtml(azienda.logo_url)}" alt="Logo azienda" style="${veste.stileLogo ?? `height:${testata.logoAltezza}pt;width:auto;max-width:${testata.logoLarghezzaMax}pt;`}" />`
    : `<div class="ragione">${escHtml(azienda.ragione_sociale)}</div>`;
  const generato = new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "long", year: "numeric" });

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Helvetica, "Helvetica Neue", Arial, sans-serif; font-size: ${pagina.corpo}pt; line-height: ${pagina.interlinea}; color: var(--ink); background: white; }
    @page { size: A4; margin: ${pagina.margineAlto}pt ${pagina.margineLaterale}pt; }
    @media print {
      body { margin: 0; }
      .page { padding: 0 !important; max-width: none !important; }
    }
    .page { max-width: 794px; margin: 0 auto; padding: 32px; }
    .nota { font-size: ${pagina.nota}pt; color: var(--muted); }
    .titoletto { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .5pt; color: var(--muted); margin-bottom: 2pt; }
    .giornata { margin-bottom: 14pt; page-break-inside: avoid; border: .75pt solid var(--line); border-radius: 3pt; overflow: hidden; }
    .giornata-testa { background: var(--soft); border-bottom: .75pt solid var(--line); padding: 6pt 10pt; display: flex; justify-content: space-between; align-items: center; font-weight: 700; }
    .giornata-corpo { padding: 10pt; }
    .riferimenti { margin-top: 24pt; font-size: 6.5pt; color: var(--muted); }
    ${cssDocumento(colore)}
    .doc-testata .logo { flex-shrink: 0; }${piede}${veste.css}
  </style>
</head>
<body>
${veste.apri}<div class="page">
  <div class="doc-testata">
    <div class="logo">${logo}</div>
    <div class="titolo">
      <h1>Giornale dei lavori</h1>
      ${order
      ? `<div class="sotto">${order.order_code ? `Cantiere #${escHtml(order.order_code)} — ` : ""}${escHtml(order.description)}</div>`
      : '<div class="sotto">Tutti i cantieri</div>'}
      <div class="sotto">${entries.length} ${entries.length === 1 ? "giornata" : "giornate"}</div>
      ${inBozza > 0 ? `<div style="margin-top:4pt;"><span class="doc-etichetta">${inBozza === entries.length ? "Bozza, non firmata" : `Contiene ${inBozza} ${inBozza === 1 ? "pagina" : "pagine"} in bozza, non firmate`}</span></div>` : ""}
    </div>
  </div>

  ${entries.length > 0
    ? `<div class="doc-riquadro" style="margin-bottom:14pt;display:flex;flex-wrap:wrap;gap:24pt;">
    <span>Dal <strong>${fmtData(entries[entries.length - 1].data_lavori)}</strong> al <strong>${fmtData(entries[0].data_lavori)}</strong></span>
    <span>Tot. operai: <strong>${entries.reduce((s, e) => s + (e.personale_presente ?? 0), 0)}</strong> giornate</span>
    ${entries[0].avanzamento_percentuale != null ? `<span>Ultimo avanzamento: <strong>${entries[0].avanzamento_percentuale}%</strong></span>` : ""}
  </div>`
    : ""}

  ${entriesHtml}

  ${entries.length === 0 ? `<div class="nota" style="text-align:center;padding:40px;">Nessun report disponibile per i parametri selezionati.</div>` : ""}

  <!-- Riferimenti tecnici: una riga sopra il piè -->
  <div class="riferimenti">Generato il ${generato} · ${escHtml(brandFooter || "Edilizia in Cloud")}</div>
</div>
${veste.chiudi}</body>
</html>`;
}
