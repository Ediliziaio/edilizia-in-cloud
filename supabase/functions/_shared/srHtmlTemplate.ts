/**
 * srHtmlTemplate.ts — Template HTML preventivo Serramenti (4+ pagine A4).
 *
 * Stile: verde elegante #2D7D5C ispirato al PDF di riferimento.
 * Self-contained: CSS inline, niente dipendenze esterne. SVG inline per
 * grafici (cashflow + gantt).
 *
 * Pagine:
 *  1. Proposta di intervento — anagrafica + sintesi + esigenze + soluzione + perché noi
 *  2. Proposta economica + Finanziamento — totale + 2 piani + testimonianze + incluso
 *  3. Allegato tecnico — BOM serramenti + accessori + consulenza + crono
 *  4. Firma online — render, prossimi passi, link pubblico
 */

export interface SrPdfData {
  // Progetto
  code: string;
  data_emissione: string;       // ISO date

  // Cliente
  cliente_nome: string;
  cliente_cognome: string;
  cliente_indirizzo: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_citta: string | null;

  // Intervento
  cantiere_citta: string | null;
  totale_serramenti: number;
  totale_accessori: number;
  tipo_intervento: string;
  intervento_titolo: string | null;
  intervento_sintesi: string | null;
  materiale_principale: string | null;

  // Copy
  esigenze: { titolo: string; descrizione: string }[];
  soluzione: { titolo: string; descrizione: string }[];
  perche_noi: string[];
  incluso_investimento: string[];
  testimonianze: { quote: string; autore: string; citta?: string; intervento?: string }[];
  prossimi_passi: string[];
  // Condizioni contrattuali e termini legali (sr_template_pdf): pagina dedicata in coda
  condizioni_legali_testo?: string | null;
  condizioni_legali_attivo?: boolean | null;

  // Economia
  totale_min: number;
  totale_max: number;
  iva_inclusa: boolean;
  fin_anticipo_pct: number;
  fin_anticipo_eur: number;
  fin_finanziato_eur: number;
  fin_piani: { nome: string; mesi: number; tasso: number; rata_mese: number }[];

  // ROI (opzionali)
  risparmio_eur_anno: number | null;
  detrazione_aliquota: number | null;
  detrazione_eur_totale: number | null;
  detrazione_eur_anno: number | null;
  payback_anni: number | null;
  co2_risparmiata_t_anno: number | null;
  cashflow: { anno: number; flusso_anno: number; cumulato: number }[] | null;

  // BOM
  serramenti: {
    tipologia_label: string;
    materiale: string | null;
    serie: string | null;
    vetro: string | null;
    larghezza_mm: number | null;
    altezza_mm: number | null;
    quantita: number;
    // Scheda tecnica dinamica della macrocategoria: campi con show_in_pdf=true.
    // Ognuno è già una stringa formattata pronta da renderizzare nel PDF.
    specs_tecniche?: Array<{ label: string; value: string; unit: string | null }>;
  }[];
  accessori: { tipo: string; descrizione: string | null; quantita: number }[];

  // Pagine dedicate macrocategoria — storytelling premium opt-in (l'admin
  // imposta `mostra_pagina_dedicata_pdf=true` su listino_macrocategorie).
  macro_pagine_dedicate?: Array<{
    macro_id: string;
    nome: string;
    descrizione_estesa: string;
    immagine_url: string | null;
  }>;

  // Render foto-realistici dei serramenti (kind='render' in sr_progetti_media)
  renders: { url: string; caption: string | null }[];

  // Link pubblico / microsito
  public_url: string | null;

  // Consulenza
  consulenza_at: string | null;     // ISO datetime
  consulenza_luogo: string | null;
  consulente_nome: string | null;
  consulente_ruolo: string | null;
  consulente_telefono: string | null;
  consulente_email: string | null;
  consulente_foto_url: string | null;

  // Cronoprogramma
  crono_fasi: { label: string; giorno_inizio: number; giorno_fine: number; emoji: string }[];
  crono_durata_giorni: number;

  // Validità
  valido_fino_giorni: number;

  // Azienda
  azienda_nome: string;
  azienda_indirizzo: string | null;
  azienda_telefono: string | null;
  azienda_email: string | null;
  azienda_partita_iva: string | null;
  azienda_logo_url: string | null;
  colore_primario: string;
}

const SR_GREEN = "#2D7D5C";
const SR_GREEN_LIGHT = "#E8F3EE";

function fmtEur(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return "—";
  return "€ " + Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtEurRangeOrSingle(min: number | null | undefined, max: number | null | undefined, decimals = 0): string {
  const minN = Number(min ?? 0);
  const maxN = Number(max ?? 0);
  if (!minN && !maxN) return "—";
  if (!minN) return fmtEur(maxN, decimals);
  if (!maxN) return fmtEur(minN, decimals);
  if (Math.abs(minN - maxN) < 0.01) return fmtEur(maxN, decimals);
  return `${fmtEur(minN, decimals)} – ${fmtEur(maxN, decimals)}`;
}

function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const giorno = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${giorno.charAt(0).toUpperCase() + giorno.slice(1)} · Ore ${ora}`;
}

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ─── Templates ──────────────────────────────────────────────────────────────

function renderHeader(d: SrPdfData, page: number, total: number): string {
  const initial = d.azienda_nome.charAt(0).toUpperCase();
  return `
  <header class="page-header">
    <div class="logo-box">
      ${d.azienda_logo_url
        ? `<img src="${esc(d.azienda_logo_url)}" alt="logo" />`
        : `<span class="logo-letter">${esc(initial)}</span>`}
      <div class="company-block">
        <p class="company-name">${esc(d.azienda_nome)}</p>
        ${page === 1
          ? ""  // Pagina 1: niente sottotitolo cliente nel header (è nel titolo)
          : `<p class="company-sub">${esc([d.cliente_nome, d.cliente_cognome].filter(Boolean).join(" "))}${d.cliente_citta ? `, ${esc(d.cliente_citta)}` : ""}</p>`
        }
      </div>
    </div>
    <div class="stima-block">
      <p class="stima-label">STIMA N.</p>
      <p class="stima-num">${esc(d.code)}</p>
      <p class="stima-label">DATA</p>
      <p class="stima-date">${fmtDate(d.data_emissione)}</p>
    </div>
  </header>
  `;
}

function renderFooter(d: SrPdfData, page: number, total: number): string {
  return `
  <footer class="page-footer">
    <div>
      <p class="footer-name">${esc(d.azienda_nome)}</p>
      ${d.azienda_indirizzo ? `<p class="footer-text">${esc(d.azienda_indirizzo)}</p>` : ""}
      <p class="footer-text">
        ${d.azienda_telefono ? esc(d.azienda_telefono) + " · " : ""}
        ${d.azienda_email ? esc(d.azienda_email) + " · " : ""}
        ${d.azienda_partita_iva ? "P.IVA " + esc(d.azienda_partita_iva) : ""}
      </p>
    </div>
    <p class="footer-page">Pag. ${page} / ${total}</p>
  </footer>
  `;
}

function haCondizioni(d: SrPdfData): boolean {
  return d.condizioni_legali_attivo !== false && !!String(d.condizioni_legali_testo ?? "").trim();
}

/** Numero pagine dell'HTML generato (4 base + macro dedicate + condizioni). */
export function countSrPdfPages(d: SrPdfData): number { return totalPages(d); }

function totalPages(d: SrPdfData): number {
  return 4 + (d.macro_pagine_dedicate?.length ?? 0) + (haCondizioni(d) ? 1 : 0);
}

/**
 * Testo semplice/markdown → HTML: "# " e "## " titoli, "- " elenco, il resto paragrafi.
 * Il PDF scaricato dall'app stampava già questa pagina; la versione HTML
 * pubblica (quella del link che il cliente firma) la saltava.
 */
function renderPaginaCondizioni(d: SrPdfData, page: number, total: number): string {
  if (!haCondizioni(d)) return "";
  const righe = String(d.condizioni_legali_testo).replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inLista = false;
  const chiudiLista = () => { if (inLista) { html.push("</ul>"); inLista = false; } };
  for (const raw of righe) {
    const r = raw.trim();
    if (!r) { chiudiLista(); continue; }
    const h = /^(#{1,3})\s+(.+)$/.exec(r);
    if (h) { chiudiLista(); html.push(h[1].length === 1 ? `<h2 class="section-title">${esc(h[2])}</h2>` : `<h3 class="cond-sub">${esc(h[2])}</h3>`); continue; }
    const li = /^[-*]\s+(.+)$/.exec(r);
    if (li) { if (!inLista) { html.push('<ul class="cond-list">'); inLista = true; } html.push(`<li>${esc(li[1])}</li>`); continue; }
    chiudiLista(); html.push(`<p class="paragraph cond-p">${esc(r)}</p>`);
  }
  chiudiLista();
  return `
  <section class="page">
    ${renderHeader(d, page, total)}
    <main class="page-body">
      <p class="overline">CONDIZIONI</p>
      <h1 class="page-title">Condizioni contrattuali e termini legali</h1>
      <div class="cond-body">${html.join("\n")}</div>
    </main>
    ${renderFooter(d, page, total)}
  </section>
  `;
}

function renderPage1(d: SrPdfData, total = totalPages(d)): string {
  const titolo = d.intervento_titolo
    || `Per ${[d.cliente_nome].filter(Boolean).join(" ")}`;
  const sottotitolo = [
    d.cantiere_citta || d.cliente_citta,
    d.totale_serramenti ? `${d.totale_serramenti} serramenti` : null,
    d.tipo_intervento,
  ].filter(Boolean).join(" · ");

  return `
  <section class="page">
    ${renderHeader(d, 1, total)}
    <main class="page-body">
      <p class="overline">PROPOSTA DI INTERVENTO</p>
      <h1 class="page-title">${esc(titolo)}</h1>
      <p class="page-subtitle">${esc(sottotitolo)}</p>

      <h2 class="section-title">ANAGRAFICA CLIENTE</h2>
      <div class="info-grid">
        <div class="info-row"><span class="info-label">Intestatario</span><span class="info-val">${esc([d.cliente_nome, d.cliente_cognome].filter(Boolean).join(" "))}</span></div>
        ${d.cliente_indirizzo ? `<div class="info-row"><span class="info-label">Indirizzo</span><span class="info-val">${esc(d.cliente_indirizzo)}</span></div>` : ""}
        ${d.cliente_telefono ? `<div class="info-row"><span class="info-label">Telefono</span><span class="info-val">${esc(d.cliente_telefono)}</span></div>` : ""}
        ${d.cliente_email ? `<div class="info-row"><span class="info-label">Email</span><span class="info-val">${esc(d.cliente_email)}</span></div>` : ""}
      </div>

      ${d.intervento_sintesi ? `
        <h2 class="section-title">L'INTERVENTO IN SINTESI</h2>
        <p class="paragraph">${esc(d.intervento_sintesi)}</p>
      ` : ""}

      ${d.esigenze && d.esigenze.length > 0 ? `
        <h2 class="section-title">LE TUE ESIGENZE</h2>
        <div class="bullet-list">
          ${d.esigenze.filter((e) => e.titolo || e.descrizione).slice(0, 3).map((e) => `
            <div class="bullet-item">
              <h4 class="bullet-title">${esc(e.titolo)}</h4>
              <p class="bullet-text">${esc(e.descrizione)}</p>
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${d.soluzione && d.soluzione.length > 0 ? `
        <h2 class="section-title">LA SOLUZIONE PER TE</h2>
        <div class="bullet-list">
          ${d.soluzione.slice(0, 3).map((s) => `
            <div class="bullet-item">
              <h4 class="bullet-title">${esc(s.titolo)}</h4>
              <p class="bullet-text">${esc(s.descrizione)}</p>
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${d.perche_noi && d.perche_noi.length > 0 ? `
        <h2 class="section-title">PERCHÉ ${esc(d.azienda_nome.toUpperCase())}</h2>
        <ul class="check-list">
          ${d.perche_noi.slice(0, 6).map((p) => `<li>${esc(p)}</li>`).join("")}
        </ul>
      ` : ""}
    </main>
    ${renderFooter(d, 1, total)}
  </section>
  `;
}

function renderPage2(d: SrPdfData, total = totalPages(d)): string {
  return `
  <section class="page">
    ${renderHeader(d, 2, total)}
    <main class="page-body">
      <h2 class="section-title">TOTALE PREVENTIVO</h2>
      <div class="big-price-box">
        <p class="big-price">${fmtEurRangeOrSingle(d.totale_min, d.totale_max)}</p>
        <p class="big-price-note">${d.iva_inclusa ? "IVA INCLUSA" : "IVA esclusa"}</p>
      </div>
      <p class="muted small">Importo calcolato sulla composizione dell'offerta, sugli sconti applicati e sull'IVA selezionata. Eventuali varianti future saranno indicate in una nuova revisione.</p>

      ${d.risparmio_eur_anno || d.detrazione_eur_totale ? `
        <h2 class="section-title">VANTAGGIO ECONOMICO</h2>
        <div class="kpi-grid">
          ${d.risparmio_eur_anno ? `
            <div class="kpi">
              <p class="kpi-label">RISPARMIO BOLLETTA</p>
              <p class="kpi-value">${fmtEur(d.risparmio_eur_anno)}<span class="kpi-unit">/anno</span></p>
            </div>
          ` : ""}
          ${d.detrazione_eur_totale ? `
            <div class="kpi">
              <p class="kpi-label">DETRAZIONE ${fmtNum(d.detrazione_aliquota)}%</p>
              <p class="kpi-value">${fmtEur(d.detrazione_eur_totale)}</p>
              <p class="kpi-hint">${fmtEur(d.detrazione_eur_anno)}/anno × 10 anni</p>
            </div>
          ` : ""}
          ${d.payback_anni ? `
            <div class="kpi">
              <p class="kpi-label">PAYBACK</p>
              <p class="kpi-value">${fmtNum(d.payback_anni, 1)}<span class="kpi-unit">anni</span></p>
            </div>
          ` : ""}
          ${d.co2_risparmiata_t_anno ? `
            <div class="kpi">
              <p class="kpi-label">CO₂ RISPARMIATA</p>
              <p class="kpi-value">${fmtNum(d.co2_risparmiata_t_anno, 2)}<span class="kpi-unit">t/anno</span></p>
            </div>
          ` : ""}
        </div>
      ` : ""}

      ${d.fin_piani && d.fin_piani.length > 0 ? `
        <h2 class="section-title">SIMULAZIONE FINANZIAMENTO</h2>
        <div class="info-grid mb">
          <div class="info-row"><span class="info-label">Importo di riferimento</span><span class="info-val">${fmtEurRangeOrSingle(d.totale_min, d.totale_max)} <span class="muted">(totale preventivo IVA inclusa)</span></span></div>
          <div class="info-row"><span class="info-label">Anticipo</span><span class="info-val">${fmtNum(d.fin_anticipo_pct)}% · ${fmtEur(d.fin_anticipo_eur)}</span></div>
        </div>
        <div class="fin-grid">
          ${d.fin_piani.map((p) => `
            <div class="fin-box">
              <p class="fin-label">${esc(p.nome.toUpperCase())} · ${p.mesi} MESI · TASSO ${fmtNum(p.tasso, p.tasso % 1 === 0 ? 0 : 1)}%</p>
              <p class="fin-rata">${fmtEur(p.rata_mese)}<span class="fin-rata-unit"> / mese</span></p>
              <div class="fin-row">
                <span>Anticipo ${fmtEur(d.fin_anticipo_eur)}</span>
                <span>Finanziato ${fmtEur(d.fin_finanziato_eur)}</span>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${d.testimonianze && d.testimonianze.length > 0 ? `
        <h2 class="section-title">COSA DICONO I NOSTRI CLIENTI</h2>
        <div class="quotes">
          ${d.testimonianze.slice(0, 3).map((t) => `
            <div class="quote">
              <span class="quote-mark">"</span>
              <p class="quote-text">${esc(t.quote)}</p>
              <p class="quote-author">— ${esc(t.autore)}${t.citta ? " · " + esc(t.citta) : ""}${t.intervento ? " · " + esc(t.intervento) : ""}</p>
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${d.incluso_investimento && d.incluso_investimento.length > 0 ? `
        <h2 class="section-title">COSA È INCLUSO NEL PREVENTIVO</h2>
        <ul class="check-list">
          ${d.incluso_investimento.slice(0, 6).map((i) => `<li>${esc(i)}</li>`).join("")}
        </ul>
      ` : ""}

    </main>
    ${renderFooter(d, 2, total)}
  </section>
  `;
}

function renderPage3(d: SrPdfData, total = totalPages(d)): string {
  // Raggruppa serramenti per (tipologia + materiale + serie + vetro + scheda tecnica).
  // La scheda tecnica concorre alla chiave di raggruppamento perché 2 finestre
  // con Uw diverso sono prodotti diversi anche se la tipologia è la stessa.
  type Group = {
    label: string;
    materiale: string;
    dimensioni: string;
    q: number;
    specs: Array<{ label: string; value: string; unit: string | null }>;
  };
  const groups: Record<string, Group> = {};
  for (const s of d.serramenti) {
    const specs = s.specs_tecniche ?? [];
    const specsKey = specs.map((sp) => `${sp.label}=${sp.value}`).join("|");
    let dimensioni = "—";
    if (s.larghezza_mm && s.altezza_mm) {
      dimensioni = `${s.larghezza_mm} × ${s.altezza_mm} mm`;
    } else if (s.larghezza_mm) {
      dimensioni = `L ${s.larghezza_mm} mm`;
    } else if (s.altezza_mm) {
      dimensioni = `H ${s.altezza_mm} mm`;
    }
    const key = `${s.tipologia_label}__${dimensioni}__${s.materiale ?? ""}__${s.serie ?? ""}__${s.vetro ?? ""}__${specsKey}`;
    const matStr = [s.materiale, s.serie, s.vetro].filter(Boolean).join(" · ");
    if (!groups[key]) {
      groups[key] = {
        label: s.tipologia_label,
        materiale: matStr,
        dimensioni,
        q: 0,
        specs,
      };
    }
    groups[key].q += s.quantita;
  }

  // Cronoprogramma SVG
  const durataMax = Math.max(d.crono_durata_giorni, 1);
  const cronoSvg = renderGanttSvg(d.crono_fasi, durataMax);

  return `
  <section class="page">
    ${renderHeader(d, 3, total)}
    <main class="page-body">
      <h1 class="page-title">Allegato tecnico</h1>
      <p class="page-subtitle">Composizione dell'intervento e totale preventivo indicato nell'offerta.</p>

      <h2 class="section-title">COMPOSIZIONE SERRAMENTI · ${d.totale_serramenti} PEZZI</h2>
      <table class="data-table">
        <thead>
          <tr><th>Tipologia</th><th>Misure</th><th>Materiale · Vetro</th><th class="num">Q.tà</th></tr>
        </thead>
        <tbody>
          ${Object.values(groups).map((g) => {
            const specsHtml = g.specs.length > 0
              ? `<div class="specs-tech">${g.specs.map((sp) =>
                  `<span class="spec-chip"><span class="spec-label">${esc(sp.label)}:</span> <span class="spec-value">${esc(sp.value)}${sp.unit ? ` <span class="spec-unit">${esc(sp.unit)}</span>` : ""}</span></span>`,
                ).join("")}</div>`
              : "";
            return `
            <tr>
              <td>
                ${esc(g.label)}
                ${specsHtml}
              </td>
              <td><span class="strong">${esc(g.dimensioni)}</span></td>
              <td><span class="strong">${esc(g.materiale || "—")}</span></td>
              <td class="num">${g.q}</td>
            </tr>
          `;
          }).join("")}
        </tbody>
      </table>

      ${d.accessori && d.accessori.length > 0 ? `
        <h2 class="section-title">ACCESSORI E COMPLEMENTI</h2>
        <table class="data-table">
          <thead><tr><th>Voce</th><th class="num">Q.tà</th></tr></thead>
          <tbody>
            ${d.accessori.map((a) => `
              <tr>
                <td>${esc(a.descrizione || labelAccessorio(a.tipo))}</td>
                <td class="num">${a.quantita}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : ""}

      <h2 class="section-title">INVESTIMENTO STIMATO</h2>
      <div class="big-price-box">
        <p class="big-price">${fmtEur(d.totale_min)} <span class="dash">—</span> ${fmtEur(d.totale_max)}</p>
        <p class="big-price-note">${d.iva_inclusa ? "IVA INCLUSA" : "IVA esclusa"}</p>
      </div>
      <p class="muted small">Validità ${d.valido_fino_giorni} giorni dalla data di emissione. Esempi di finanziamento a scopo informativo. Condizioni contrattuali disponibili in sede.</p>

      ${d.crono_fasi && d.crono_fasi.length > 0 ? `
        <h2 class="section-title">CRONOPROGRAMMA LAVORI</h2>
        <p class="muted small">Durata totale stimata: <strong>${d.crono_durata_giorni} giorni</strong> dal primo passo al collaudo.</p>
        ${cronoSvg}
      ` : ""}

      ${d.consulenza_at ? `
        <h2 class="section-title">LA TUA CONSULENZA</h2>
        <div class="consulenza-box">
          ${d.consulente_foto_url ? `<img class="consulente-foto" src="${esc(d.consulente_foto_url)}" alt="consulente" />` : `<div class="consulente-placeholder">${esc((d.consulente_nome ?? "C").charAt(0))}</div>`}
          <div class="consulenza-info">
            <p class="consulenza-data">${fmtDateTime(d.consulenza_at)}</p>
            <p class="consulenza-luogo">${esc(d.consulenza_luogo ?? "—")}</p>
          </div>
          <div class="consulenza-contatti">
            <p class="consulente-nome">${esc(d.consulente_nome ?? d.azienda_nome)}</p>
            <p class="consulente-ruolo">${esc(d.consulente_ruolo ?? "Consulente tecnico")}</p>
            ${d.consulente_telefono ? `<p class="consulente-line">${esc(d.consulente_telefono)}</p>` : ""}
            ${d.consulente_email ? `<p class="consulente-line">${esc(d.consulente_email)}</p>` : ""}
          </div>
        </div>
      ` : ""}

    </main>
    ${renderFooter(d, 3, total)}
  </section>
  `;
}

function renderPage4(d: SrPdfData, total = totalPages(d)): string {
  const hasRenders = d.renders && d.renders.length > 0;
  const hasSteps = d.prossimi_passi && d.prossimi_passi.length > 0;
  const hasPublicLink = !!d.public_url;

  return `
  <section class="page">
    ${renderHeader(d, 4, total)}
    <main class="page-body">
      <p class="overline">CONFERMA E FIRMA</p>
      <h1 class="page-title">Cosa fare adesso</h1>
      <p class="page-subtitle">Ultimi passaggi per trasformare il preventivo in ordine operativo, senza stampare documenti.</p>

      ${hasRenders ? `
        <h2 class="section-title">ANTEPRIMA FOTO-REALISTICA</h2>
        <p class="muted small">Simulazione AI dei nuovi serramenti applicata alle foto reali del cantiere.</p>
        <div class="render-grid">
          ${d.renders.slice(0, 4).map((r) => `
            <div class="render-item">
              <img src="${esc(r.url)}" alt="${esc(r.caption ?? "render serramenti")}" />
              ${r.caption ? `<p class="render-caption">${esc(r.caption)}</p>` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${hasSteps ? `
        <h2 class="section-title">PROSSIMI PASSI</h2>
        <ol class="step-list">
          ${d.prossimi_passi.slice(0, 4).map((p) => `<li>${esc(p)}</li>`).join("")}
        </ol>
      ` : ""}

      ${hasPublicLink ? `
        <h2 class="section-title">VISUALIZZA E FIRMA ONLINE</h2>
        <div class="signature-link-box">
          <p class="signature-link-title">Apri la pagina pubblica del preventivo</p>
          <p class="signature-link-text">Consulta il preventivo da telefono o computer e confermalo digitalmente senza stampare il documento.</p>
          <p class="signature-link-url">${esc(d.public_url)}</p>
        </div>
      ` : `
        <h2 class="section-title">LINK CLIENTE NON DISPONIBILE</h2>
        <p class="paragraph">Il preventivo è stato generato, ma il link pubblico di firma non è ancora configurato. Puoi usare questo documento come anteprima interna e rigenerare il link dalla scheda PDF.</p>
      `}
    </main>
    ${renderFooter(d, 4, total)}
  </section>
  `;
}

/**
 * Pagine dedicate macrocategoria — opzionali, una per ciascuna macro con
 * `mostra_pagina_dedicata_pdf=true` presente nel BOM. Layout pulito a 2
 * colonne: foto a sx + storytelling a dx. Pagina A4 piena, niente footer
 * con numerazione perché sono "allegati" inseriti dopo la pagina 3 base.
 */
function renderPagineMacroDedicate(d: SrPdfData): string {
  const pagine = d.macro_pagine_dedicate ?? [];
  if (pagine.length === 0) return "";
  const baseTotal = totalPages(d);
  return pagine.map((p, idx) => {
    const total = pagine.length;
    // Trasforma il testo libero in paragrafi (a-capo doppi) + supporto bullet
    // "- " all'inizio della riga. Niente markdown completo per sicurezza.
    const paragrafiHtml = p.descrizione_estesa
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0)
      .map((paragrafo) => {
        const lines = paragrafo.split("\n").map((l) => l.trim()).filter(Boolean);
        const allBullets = lines.every((l) => l.startsWith("- ") || l.startsWith("• "));
        if (allBullets && lines.length > 0) {
          const items = lines.map((l) => `<li>${esc(l.replace(/^[-•]\s*/, ""))}</li>`).join("");
          return `<ul class="macro-bullets">${items}</ul>`;
        }
        return `<p>${esc(paragrafo).replace(/\n/g, "<br/>")}</p>`;
      })
      .join("");
    return `
    <section class="page macro-page">
      ${renderHeader(d, 5 + idx, baseTotal)}
      <main class="page-body">
        <div class="macro-page-meta">
          <span class="macro-page-eyebrow">Linea prodotto · ${idx + 1} di ${total}</span>
        </div>
        <h1 class="macro-page-title">${esc(p.nome)}</h1>
        <div class="macro-page-grid">
          <div class="macro-page-media">
            ${p.immagine_url
              ? `<img src="${esc(p.immagine_url)}" alt="${esc(p.nome)}" />`
              : `<div class="macro-page-media-empty">${esc(p.nome)}</div>`}
          </div>
          <div class="macro-page-body">
            ${paragrafiHtml || `<p class="muted">Nessuna descrizione estesa configurata.</p>`}
          </div>
        </div>
      </main>
      ${renderFooter(d, 5 + idx, baseTotal)}
    </section>
    `;
  }).join("");
}

function labelAccessorio(tipo: string): string {
  const map: Record<string, string> = {
    avvolgibile: "Avvolgibile",
    cassonetto: "Sostituzione cassonetto",
    zanzariera: "Zanzariera",
    persiana: "Persiana",
    scuro: "Scuro",
    tapparella: "Tapparella",
    inferriata: "Inferriata di sicurezza",
    davanzale: "Davanzale",
    controtelaio: "Controtelaio",
  };
  return map[tipo] ?? tipo;
}

function renderGanttSvg(
  fasi: SrPdfData["crono_fasi"],
  durataMax: number,
): string {
  const W = 700;
  const ROW_H = 26;
  const PAD_L = 160;
  const PAD_T = 12;
  const PAD_B = 24;
  const BAR_H = 16;
  const innerW = W - PAD_L - 40;
  const H = PAD_T + fasi.length * ROW_H + PAD_B;

  const xScale = (g: number) => PAD_L + ((g - 1) / Math.max(durataMax - 1, 1)) * innerW;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:600px;border:1px solid #e8f3ee;border-radius:6px;background:#fff;">`;
  // Grid
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    const x = PAD_L + p * innerW;
    svg += `<line x1="${x}" x2="${x}" y1="${PAD_T}" y2="${H - PAD_B + 4}" stroke="#e2e8f0" stroke-dasharray="2,3" />`;
  }
  fasi.forEach((f, idx) => {
    const y = PAD_T + idx * ROW_H;
    const x1 = xScale(f.giorno_inizio);
    const x2 = xScale(f.giorno_fine + 1);
    const w = Math.max(8, x2 - x1);
    svg += `<text x="${PAD_L - 10}" y="${y + BAR_H / 2 + 4}" font-size="10" text-anchor="end" fill="#1e293b">${esc(f.emoji)} ${esc(f.label)}</text>`;
    svg += `<rect x="${x1}" y="${y}" width="${w}" height="${BAR_H}" rx="3" ry="3" fill="${SR_GREEN}" opacity="0.85" />`;
    if (f.giorno_fine - f.giorno_inizio > 2) {
      svg += `<text x="${x1 + w / 2}" y="${y + BAR_H / 2 + 4}" font-size="9" text-anchor="middle" fill="#fff" font-weight="600">g.${f.giorno_inizio}-${f.giorno_fine}</text>`;
    }
  });
  svg += `<text x="${PAD_L}" y="${H - 6}" font-size="9" fill="#64748b">Giorno 1</text>`;
  svg += `<text x="${W - 36}" y="${H - 6}" font-size="9" text-anchor="end" fill="#64748b">Giorno ${durataMax}</text>`;
  svg += `</svg>`;
  return svg;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const css = `
:root {
  --sr-green: ${SR_GREEN};
  --sr-green-light: ${SR_GREEN_LIGHT};
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: #f5f6f8; font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; color: #1e293b; }
.print-wrap { display: flex; flex-direction: column; align-items: center; padding: 24px 0; }
.page {
  background: white;
  width: 210mm; min-height: 297mm; padding: 16mm 16mm 14mm;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  margin-bottom: 16px;
  position: relative;
  display: flex; flex-direction: column;
}
.page-body { flex: 1; min-height: 0; padding-top: 8px; }

/* Header */
.page-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 8px;
}
.logo-box { display: flex; align-items: center; gap: 10px; min-width: 0; }
.logo-box img { width: auto; max-width: 116px; height: 34px; max-height: 34px; object-fit: contain; }
.logo-letter {
  width: 32px; height: 32px; border: 1.5px solid var(--sr-green);
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 700; color: var(--sr-green); font-size: 14px;
}
.company-block { min-width: 0; }
.company-name { font-weight: 700; font-size: 13px; line-height: 1.2; max-width: 350px; overflow-wrap: anywhere; }
.company-sub { font-size: 10.5px; color: #64748b; }
.stima-block { text-align: right; }
.stima-label { font-size: 8.5px; color: #94a3b8; letter-spacing: 0.05em; }
.stima-num { font-weight: 700; color: var(--sr-green); font-size: 12px; margin-bottom: 4px; }
.stima-date { font-weight: 700; font-size: 11px; margin-bottom: 2px; }

/* Footer */
.page-footer {
  display: flex; justify-content: space-between; align-items: flex-end;
  border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 14px;
}
.footer-name { font-weight: 700; font-size: 10px; }
.footer-text { font-size: 9px; color: #64748b; }
.footer-page { font-size: 10px; color: #64748b; }

/* Titoli */
.overline { font-size: 10px; letter-spacing: 0.08em; color: var(--sr-green); text-transform: uppercase; font-weight: 600; margin-top: 8px; }
.page-title { font-size: 28px; color: var(--sr-green); font-weight: 700; margin: 4px 0; }
.page-subtitle { font-size: 12.5px; color: #475569; margin-bottom: 12px; }
.section-title {
  font-size: 10px; letter-spacing: 0.08em; color: var(--sr-green); text-transform: uppercase;
  font-weight: 700; margin-top: 18px; margin-bottom: 8px;
  padding-bottom: 4px; border-bottom: 1px solid #cbd5e1;
}

/* Info grid (Anagrafica) */
.info-grid { display: flex; flex-direction: column; gap: 6px; }
.info-grid.mb { margin-bottom: 8px; }
.info-row { display: flex; gap: 12px; font-size: 11px; }
.info-label { color: #64748b; min-width: 140px; }
.info-val { color: #1e293b; font-weight: 500; }
.info-val .muted { color: #94a3b8; font-weight: normal; }

/* Paragrafi */
.paragraph { font-size: 12px; line-height: 1.5; color: #1e293b; margin-top: 4px; }
.muted { color: #64748b; }
.small { font-size: 10.5px; line-height: 1.5; }

/* Bullet list (esigenze + soluzione) */
.bullet-list { display: flex; flex-direction: column; gap: 8px; }
.bullet-item { border-left: 3px solid var(--sr-green); padding-left: 10px; }
.bullet-title { color: var(--sr-green); font-size: 12px; font-weight: 700; margin-bottom: 2px; }
.bullet-text { font-size: 11px; line-height: 1.45; color: #334155; }

/* Check list (perché noi / incluso) */
.check-list { list-style: none; padding-left: 0; }
.check-list li {
  position: relative; padding-left: 16px; font-size: 11px; line-height: 1.5; color: #1e293b;
  margin-bottom: 3px;
}
.check-list li::before {
  content: "•"; position: absolute; left: 0; top: 0;
  color: var(--sr-green); font-weight: 700; font-size: 14px;
}

/* Big price box (investimento) */
.big-price-box {
  background: var(--sr-green-light);
  border: 1px solid #c6e1d3;
  border-radius: 4px;
  padding: 16px 20px;
  margin-top: 8px;
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  flex-wrap: wrap;
}
.big-price { font-size: 30px; font-weight: 700; color: #1f5b43; letter-spacing: -0.5px; overflow-wrap: anywhere; }
.big-price .dash { color: #6b8e7b; margin: 0 4px; }
.big-price-note { font-size: 10.5px; letter-spacing: 0.05em; color: #4d6f5d; font-weight: 500; }

/* KPI grid */
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px; }
.kpi {
  background: var(--sr-green-light);
  border: 1px solid #c6e1d3;
  border-radius: 4px;
  padding: 10px;
}
.kpi-label { font-size: 8.5px; letter-spacing: 0.05em; color: #4d6f5d; font-weight: 700; }
.kpi-value { font-size: 18px; font-weight: 700; color: #1f5b43; line-height: 1.1; margin-top: 2px; }
.kpi-unit { font-size: 9.5px; font-weight: 500; color: #4d6f5d; margin-left: 3px; }
.kpi-hint { font-size: 9px; color: #4d6f5d; margin-top: 2px; }

/* Finanziamento */
.fin-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 4px; }
.fin-box {
  border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 14px;
}
.fin-label { font-size: 9px; letter-spacing: 0.05em; color: #64748b; font-weight: 600; margin-bottom: 4px; }
.fin-rata { font-size: 20px; font-weight: 700; color: #1f5b43; }
.fin-rata-unit { font-size: 11px; font-weight: 500; color: #475569; }
.fin-row { display: flex; justify-content: space-between; font-size: 9.5px; color: #475569; margin-top: 6px; }

/* Quotes (testimonianze) */
.quotes { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.quote { background: #f1f7f4; border-radius: 4px; padding: 10px 12px; position: relative; padding-left: 28px; }
.quote-mark { position: absolute; left: 8px; top: 8px; color: var(--sr-green); font-size: 24px; font-weight: 700; line-height: 1; }
.quote-text { font-size: 10.5px; line-height: 1.5; color: #1e293b; font-style: italic; }
.quote-author { font-size: 9px; color: #64748b; margin-top: 4px; }

/* Tabelle */
.data-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
.data-table thead th {
  text-align: left; font-size: 9px; letter-spacing: 0.05em; color: #64748b; font-weight: 700;
  border-bottom: 1.5px solid #cbd5e1; padding: 6px 4px; text-transform: uppercase;
}
.data-table thead th.num { text-align: right; }
.data-table tbody td { padding: 8px 4px; border-bottom: 1px solid #e2e8f0; vertical-align: top; overflow-wrap: anywhere; }
.data-table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table .strong { font-weight: 500; }
.data-table .muted { color: #94a3b8; }

/* Scheda tecnica dinamica: chip sotto la riga prodotto nella tabella */
.specs-tech {
  display: flex; flex-wrap: wrap; gap: 4px 6px;
  margin-top: 4px; font-size: 9.5px; line-height: 1.4;
}
.specs-tech .spec-chip {
  display: inline-flex; align-items: baseline; gap: 3px;
  background: #f1f5f9; border-radius: 3px; padding: 2px 6px;
  color: #334155; white-space: normal; overflow-wrap: anywhere; max-width: 100%;
}
.specs-tech .spec-label { color: #64748b; font-weight: 500; }
.specs-tech .spec-value { font-weight: 600; }
.specs-tech .spec-unit { color: #94a3b8; font-weight: 400; font-size: 9px; }

/* Pagine dedicate macrocategoria — storytelling premium */
.macro-page .macro-page-meta { margin-bottom: 8px; }
.macro-page .macro-page-eyebrow {
  display: inline-block;
  text-transform: uppercase;
  font-size: 9.5px;
  letter-spacing: 0.08em;
  color: var(--sr-green, #2D7D5C);
  font-weight: 700;
  padding: 3px 8px;
  border: 1px solid currentColor;
  border-radius: 999px;
  opacity: 0.85;
}
.macro-page .macro-page-title {
  font-size: 32px;
  font-weight: 800;
  line-height: 1.15;
  margin: 6px 0 18px;
  color: #0f172a;
  letter-spacing: -0.02em;
}
.macro-page .macro-page-grid {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 28px;
  align-items: start;
}
.macro-page .macro-page-media {
  width: 240px;
  height: 320px;
  border-radius: 8px;
  overflow: hidden;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}
.macro-page .macro-page-media img {
  width: 100%; height: 100%; object-fit: cover;
}
.macro-page .macro-page-media-empty {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  padding: 16px; text-align: center;
  font-size: 14px; font-weight: 600; color: #94a3b8;
}
.macro-page .macro-page-body {
  font-size: 11.5px;
  line-height: 1.65;
  color: #1e293b;
}
.macro-page .macro-page-body p {
  margin: 0 0 10px;
}
.macro-page .macro-bullets {
  margin: 0 0 10px;
  padding-left: 18px;
  list-style: disc;
}
.macro-page .macro-bullets li {
  margin-bottom: 4px;
}

/* Consulenza */
.consulenza-box {
  display: grid; grid-template-columns: 64px 1fr 1fr; gap: 14px;
  align-items: center;
  background: var(--sr-green-light);
  border: 1px solid #c6e1d3; border-radius: 4px; padding: 12px 14px;
}
.consulente-foto { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; }
.consulente-placeholder {
  width: 56px; height: 56px; border-radius: 50%;
  background: white; border: 2px solid var(--sr-green);
  color: var(--sr-green); font-weight: 700; font-size: 22px;
  display: flex; align-items: center; justify-content: center;
}
.consulenza-data { font-weight: 700; color: var(--sr-green); font-size: 12px; }
.consulenza-luogo { font-size: 11px; color: #475569; }
.consulente-nome { font-size: 12px; font-weight: 700; }
.consulente-ruolo { font-size: 10px; color: #64748b; }
.consulente-line { font-size: 10px; color: #475569; }

/* Step list (prossimi passi) */
.step-list { padding-left: 20px; }
.step-list li { font-size: 11.5px; line-height: 1.7; color: #1e293b; }

/* Render foto-realistici */
.render-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 4px; }
.render-item { border-radius: 6px; overflow: hidden; background: #f1f7f4; border: 1px solid #c6e1d3; }
.render-item img { width: 100%; height: 180px; object-fit: cover; display: block; }
.render-caption { padding: 4px 8px; font-size: 10px; color: #475569; }

/* Link firma online */
.signature-link-box {
  background: var(--sr-green-light); border: 1px solid #c6e1d3;
  border-radius: 4px; padding: 14px;
}
.signature-link-title { font-size: 12px; font-weight: 700; color: var(--sr-green); margin-bottom: 4px; }
.signature-link-text { font-size: 10.5px; color: #475569; line-height: 1.4; }
.signature-link-url { font-size: 9px; color: #64748b; font-family: ui-monospace, monospace; word-break: break-all; margin-top: 6px; }

@media print {
  html, body { background: white !important; }
  .print-wrap { padding: 0; }
  .cond-body { font-size: 9.5pt; line-height: 1.5; }
  .cond-body .section-title { margin-top: 14px; }
  .cond-sub { font-size: 10.5pt; font-weight: 700; margin: 10px 0 3px; }
  .cond-p { margin: 0 0 6px; }
  .cond-list { margin: 0 0 6px 16px; padding: 0; }
  .cond-list li { margin-bottom: 2px; }
  .page { box-shadow: none; margin: 0; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
}

@page { size: A4; margin: 0; }
`;

export function renderSrPdfHtml(d: SrPdfData): string {
  const title = `Stima ${d.code} — ${[d.cliente_nome, d.cliente_cognome].filter(Boolean).join(" ")}`;
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
  <div class="print-wrap">
    ${renderPage1(d)}
    ${renderPage2(d)}
    ${renderPage3(d)}
    ${renderPage4(d)}
    ${renderPagineMacroDedicate(d)}
    ${renderPaginaCondizioni(d, totalPages(d), totalPages(d))}
  </div>
</body>
</html>`;
}
