/**
 * Il documento del giornale dei lavori in HTML, pronto da stampare: lo usano
 * l'esportazione (`generate-giornale-pdf`) e il link alla direzione lavori
 * (`giornale-dl-documento`). Modulo puro: i dati li legge `datiDocumentoGiornale.ts`.
 *
 * Il numero di pagina lo scrive la stampa del browser (@page, margini con counter):
 * è l'unico che conosce i fogli veri. Sullo schermo resta «Giornata N di M».
 */
import { eventiPerTipo, oraBreve, problemaAperto, type EventoGiornale } from "./eventiGiornale.ts";
import { vesteHtml } from "./vesteHtml.ts";
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

const TITOLETTO = "font-size:8pt;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;";

const blocco = (titolo: string, corpo: string) => `<div style="margin-bottom:8px;">
            <div style="${TITOLETTO}">${titolo}</div>
            ${corpo}
          </div>`;

const oreTesto = (ore: number) => (ore > 0 ? ` (${(Math.round(ore * 100) / 100).toLocaleString("it-IT")} h)` : "");

export const firmata = (g: Pick<GiornataDocumento, "stato">) => g.stato === "firmata";

function statoHtml(g: GiornataDocumento): string {
  if (!firmata(g)) {
    return `<div style="margin-bottom:10px;padding:6px 10px;border:1px solid #f59e0b;border-radius:4px;background:#fffbeb;font-size:9.5pt;font-weight:700;color:#92400e;">Bozza, non firmata</div>`;
  }
  const impronta = (g.pm_signature_hash ?? "").slice(0, 12);
  return `<div style="margin-bottom:10px;padding:6px 10px;border:1px solid #86efac;border-radius:4px;background:#f0fdf4;font-size:9pt;color:#166534;">
            <strong>Firmata</strong> il ${escHtml(fmtDataOra(g.pm_signed_at))}${g.firmatario ? ` da <strong>${escHtml(g.firmatario)}</strong>` : ""}${impronta ? ` · impronta <code>${escHtml(impronta)}</code>` : ""}
          </div>`;
}

function eventiHtml(eventi: EventoGiornale[]): string {
  const gruppi = eventiPerTipo(eventi);
  if (!gruppi.length) return "";
  const corpo = gruppi.map((g) => `<div style="margin-bottom:4px;">
              <div style="font-size:9pt;font-weight:700;color:#334155;">${escHtml(g.etichetta)}</div>
              ${g.eventi.map((e) => {
    const ora = oraBreve(e.ora);
    const stato = e.tipo !== "problema"
      ? ""
      : problemaAperto(e)
      ? ` <strong style="color:#b91c1c;">[Aperto]</strong>`
      : ` <strong style="color:#166534;">[Chiuso il ${escHtml(fmtDataOra(e.chiuso_il))}]</strong>${e.nota_chiusura ? ` ${escHtml(e.nota_chiusura)}` : ""}`;
    return `<div style="font-size:9.5pt;color:#1e293b;white-space:pre-wrap;">${ora ? `${escHtml(ora)} · ` : ""}${escHtml(e.testo)}${stato}</div>`;
  }).join("")}
            </div>`).join("");
  return blocco("Eventi della giornata", corpo);
}

function fotoHtml(link: string[]): string {
  if (!link.length) return "";
  const altre = link.length - MAX_FOTO_PER_GIORNATA;
  return blocco(`Foto (${link.length})`, `<div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${link.slice(0, MAX_FOTO_PER_GIORNATA).map((u) => `<img src="${escHtml(u)}" alt="Foto del cantiere" style="width:110px;height:110px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0;" />`).join("")}
              ${altre > 0 ? `<span style="font-size:8.5pt;color:#64748b;align-self:center;">+${altre} nel gestionale</span>` : ""}
            </div>`);
}

function annotazioniHtml(annotazioni: AnnotazioneDocumento[]): string {
  if (!annotazioni.length) return "";
  return `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #cbd5e1;">
            <div style="${TITOLETTO}">Annotazioni successive alla firma</div>
            ${annotazioni.map((a) => `<div style="margin-bottom:6px;">
              <div style="font-size:8pt;color:#64748b;">${escHtml(fmtDataOra(a.created_at))}${a.autore ? ` · ${escHtml(a.autore)}` : ""}</div>
              <div style="font-size:9.5pt;color:#1e293b;white-space:pre-wrap;">${escHtml(a.testo)}</div>
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
  // A4 meno 1,5 cm per lato, i margini di @page.
  const veste = vesteHtml(companyId, 210 - 30);
  const colore = azienda.colore_primario || "#0ea5e9";
  const title = order
    ? `Giornale dei Lavori — ${order.order_code ? `#${order.order_code} ` : ""}${order.description}`
    : "Giornale dei Lavori";
  const inBozza = entries.filter((e) => !firmata(e)).length;

  const entriesHtml = entries.map((e, i) => {
    const persone = e.persone ?? [];
    return `
    <div style="margin-bottom:24px;page-break-inside:avoid;">
      <div style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"};border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        <div style="background:${colore};color:white;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:700;font-size:10pt;">${fmtData(e.data_lavori)} <span style="font-weight:400;font-size:8.5pt;">· Giornata ${i + 1} di ${entries.length}</span></span>
          <span style="font-size:9pt;">${e.avanzamento_percentuale != null ? `Avanzamento: ${e.avanzamento_percentuale}%` : ""}</span>
        </div>
        <div style="padding:12px;">
          ${statoHtml(e)}
          <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px;font-size:8.5pt;color:#475569;">
            ${e.condizioni_meteo ? `<span>${METEO_LABEL[e.condizioni_meteo] || escHtml(e.condizioni_meteo)}</span>` : ""}
            ${e.temperatura ? `<span>Temperatura: ${escHtml(e.temperatura)}</span>` : ""}
            ${e.personale_presente != null ? `<span>${e.personale_presente} ${e.personale_presente === 1 ? "operaio" : "operai"}</span>` : ""}
          </div>
          ${persone.length ? blocco("Presenti", `<div style="font-size:9.5pt;color:#1e293b;">${persone.map((p) => `${escHtml(p.nome)}${oreTesto(p.ore)}`).join(", ")}</div>`) : ""}
          ${e.lavorazioni_eseguite ? blocco("Lavorazioni eseguite", `<div style="font-size:9.5pt;color:#1e293b;white-space:pre-wrap;line-height:1.5;">${escHtml(e.lavorazioni_eseguite)}</div>`) : ""}
          ${e.materiali_utilizzati ? blocco("Materiali utilizzati", `<div style="font-size:9.5pt;color:#1e293b;white-space:pre-wrap;">${escHtml(e.materiali_utilizzati)}</div>`) : ""}
          ${eventiHtml(e.eventi ?? [])}
          ${e.note ? blocco("Note", `<div style="font-size:9pt;color:#475569;font-style:italic;white-space:pre-wrap;">${escHtml(e.note)}</div>`) : ""}
          ${fotoHtml((e.foto_link ?? []).filter(Boolean))}
          ${e.firmato_da ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;font-size:8.5pt;color:#475569;">
            ${escHtml(e.firmato_da_ruolo?.trim() || "Firma")}: <strong>${escHtml(e.firmato_da)}</strong>${e.firmato_il ? ` — ${fmtData(e.firmato_il)}` : ""}
          </div>` : ""}
          ${annotazioniHtml(e.annotazioni ?? [])}
        </div>
      </div>
    </div>`;
  }).join("");

  const indirizzo = [azienda.indirizzo, azienda.cap, azienda.citta].filter(Boolean).join(", ");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e293b; background: white; }
    @page {
      size: A4;
      margin: 1.5cm 1.5cm 2cm;
      @bottom-center { content: "Pagina " counter(page) " di " counter(pages); font-family: Arial, sans-serif; font-size: 8pt; color: #64748b; }
    }
    @media print {
      body { margin: 0; }
      .page { padding: 0 !important; max-width: none !important; }
    }
    .page { max-width: 794px; margin: 0 auto; padding: 32px; }${veste.css}
  </style>
</head>
<body>
${veste.apri}<div class="page">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid ${colore};">
    <div>
      <div style="font-size:14pt;font-weight:700;color:${colore};">${escHtml(azienda.ragione_sociale)}</div>
      ${azienda.partita_iva ? `<div style="font-size:8pt;color:#64748b;">P.IVA ${escHtml(azienda.partita_iva)}</div>` : ""}
      ${indirizzo ? `<div style="font-size:8pt;color:#64748b;">${escHtml(indirizzo)}</div>` : ""}
      ${azienda.telefono ? `<div style="font-size:8pt;color:#64748b;">Tel. ${escHtml(azienda.telefono)}</div>` : ""}
      ${azienda.email ? `<div style="font-size:8pt;color:#64748b;">${escHtml(azienda.email)}</div>` : ""}
    </div>
    ${azienda.logo_url ? `<img src="${escHtml(azienda.logo_url)}" alt="Logo azienda" style="${veste.stileLogo ?? "max-height:60px;max-width:180px;object-fit:contain;"}" />` : ""}
  </div>

  <div style="text-align:center;margin-bottom:24px;">
    <div style="font-size:16pt;font-weight:700;color:#0f172a;letter-spacing:-0.5px;">GIORNALE DEI LAVORI</div>
    ${order
      ? `<div style="font-size:10pt;color:#475569;margin-top:4px;">${order.order_code ? `Cantiere #${escHtml(order.order_code)} — ` : ""}${escHtml(order.description)}</div>`
      : '<div style="font-size:10pt;color:#475569;margin-top:4px;">Tutti i cantieri</div>'}
    <div style="font-size:8pt;color:#94a3b8;margin-top:4px;">
      ${entries.length} ${entries.length === 1 ? "giornata" : "giornate"} —
      Generato il ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "long", year: "numeric" })}
    </div>
    ${inBozza > 0 ? `<div style="font-size:9pt;font-weight:700;color:#92400e;margin-top:6px;">${inBozza === entries.length ? "Bozza, non firmata" : `Contiene ${inBozza} ${inBozza === 1 ? "pagina" : "pagine"} in bozza, non firmate`}</div>` : ""}
  </div>

  ${entries.length > 0
    ? `<div style="background:#f1f5f9;border-radius:6px;padding:10px 14px;margin-bottom:20px;display:flex;gap:24px;font-size:8.5pt;color:#475569;">
    <span>Dal <strong>${fmtData(entries[entries.length - 1].data_lavori)}</strong> al <strong>${fmtData(entries[0].data_lavori)}</strong></span>
    <span>Tot. operai: <strong>${entries.reduce((s, e) => s + (e.personale_presente ?? 0), 0)}</strong> giornate</span>
    ${entries[0].avanzamento_percentuale != null ? `<span>Ultimo avanzamento: <strong>${entries[0].avanzamento_percentuale}%</strong></span>` : ""}
  </div>`
    : ""}

  ${entriesHtml}

  ${entries.length === 0 ? `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:10pt;">Nessun report disponibile per i parametri selezionati.</div>` : ""}

  <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:7pt;color:#94a3b8;">
    <div>${veste.attiva ? "" : `${escHtml(azienda.ragione_sociale)}${azienda.partita_iva ? ` — P.IVA ${escHtml(azienda.partita_iva)}` : ""}`}</div>
    <div style="color:${colore};">${escHtml(brandFooter || "Edilizia in Cloud")}</div>
  </div>
</div>
${veste.chiudi}</body>
</html>`;
}

