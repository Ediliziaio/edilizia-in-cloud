/**
 * Il conto economico della commessa da stampare o salvare in PDF (Economia →
 * «Scarica conto economico»): numeri chiave, grafici (composizione dei costi a
 * torta, preventivo contro consuntivo per voce, fasi, cassa), macro-voci con
 * preventivo, consuntivo e incidenze; margini e struttura; economia di ogni
 * fase; incassi dal cliente; pagamenti con fattura, pagato, residuo e
 * scadenza. I numeri vengono dal dossier (caricaDossierEconomico), gli stessi
 * delle schermate. Grafici in SVG dentro la pagina: si stampano e si salvano
 * in PDF senza librerie.
 */
import type { DossierEconomico } from "@/lib/orders/dossierEconomico";
import { CATEGORIE, STATO_USCITA, documentoUscita, statoRata } from "@/lib/orders/quadroPagamenti";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eur = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions);
/** Compatto per i grafici: 24,2k €. */
const eurK = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k €` : `${Math.round(v).toLocaleString("it-IT")} €`);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);
const data = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const su = (v: number | null, base: number) => (v == null || base <= 0 ? null : Math.round((v / base) * 1000) / 10);

export interface AziendaDocumento { ragione_sociale: string; logo_url?: string | null; colore?: string | null }

/** Colori delle macro-voci: stessi in torta, barre e legenda. */
const COLORI: Record<string, string> = {
  materiali: "#2563eb", manodopera: "#f59e0b", subappalti: "#8b5cf6", professionisti: "#0891b2",
  noleggi: "#64748b", cantiere: "#ec4899", provvigioni: "#14b8a6", rimborsi: "#84cc16", errori: "#ef4444",
  margine: "#10b981",
};

/** Torta ad anello: segmenti in proporzione, totale al centro. */
export function svgTorta(segmenti: Array<{ label: string; valore: number; colore: string }>, centro: { titolo: string; valore: string }): string {
  const validi = segmenti.filter((s) => s.valore > 0);
  const totale = validi.reduce((a, s) => a + s.valore, 0);
  const r = 62, cx = 80, cy = 80, spessore = 26;
  if (totale <= 0) return "";
  let angolo = -Math.PI / 2;
  const archi = validi.map((s) => {
    const quota = s.valore / totale;
    // Un segmento al 100% si disegna come cerchio intero (un arco da 360° non esiste).
    if (quota >= 0.9999) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.colore}" stroke-width="${spessore}"/>`;
    const a1 = angolo, a2 = angolo + quota * 2 * Math.PI;
    angolo = a2;
    const p = (a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    return `<path d="M ${p(a1)} A ${r} ${r} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${p(a2)}" fill="none" stroke="${s.colore}" stroke-width="${spessore}"/>`;
  }).join("");
  const legenda = validi.map((s) => `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;font-size:8.5pt;break-inside:avoid;">
      <span style="width:9px;height:9px;border-radius:2px;background:${s.colore};flex:none;"></span>
      <span style="flex:1;color:#334155;">${esc(s.label)}</span>
      <span style="font-variant-numeric:tabular-nums;color:#0f172a;font-weight:600;">${eur(s.valore)}</span>
      <span style="width:38px;text-align:right;color:#64748b;">${pct(Math.round((s.valore / totale) * 1000) / 10)}</span></div>`).join("");
  return `<div style="display:flex;align-items:center;gap:16px;">
    <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="${esc(centro.titolo)}">${archi}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="9" fill="#64748b">${esc(centro.titolo)}</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a">${esc(centro.valore)}</text>
    </svg>
    <div style="flex:1;min-width:0;column-count:${validi.length > 5 ? 2 : 1};column-gap:18px;">${legenda}</div></div>`;
}

/** Barre orizzontali a coppie: grigia la prima serie, colorata la seconda. */
export function svgBarreCoppie(righe: Array<{ label: string; a: number | null; b: number; colore: string }>, nomi: [string, string]): string {
  if (!righe.length) return "";
  const max = Math.max(1, ...righe.flatMap((r) => [r.a ?? 0, r.b]));
  const largL = 150, largB = 330, alt = 30, w = largL + largB + 90;
  const h = righe.length * alt + 26;
  const x = (v: number) => (v / max) * largB;
  const corpo = righe.map((r, i) => {
    const y = 22 + i * alt;
    const sforo = r.a != null && r.b > r.a + 0.5;
    return `<text x="${largL - 8}" y="${y + 13}" text-anchor="end" font-size="8.5" fill="#334155">${esc(r.label)}</text>
      ${r.a != null ? `<rect x="${largL}" y="${y + 2}" width="${x(r.a).toFixed(1)}" height="9" rx="2" fill="#cbd5e1"/>` : ""}
      <rect x="${largL}" y="${y + 12}" width="${Math.max(x(r.b), r.b > 0 ? 1.5 : 0).toFixed(1)}" height="9" rx="2" fill="${sforo ? "#ef4444" : r.colore}"/>
      <text x="${largL + Math.max(x(r.a ?? 0), x(r.b)) + 6}" y="${y + 19}" font-size="8" fill="${sforo ? "#b91c1c" : "#475569"}">${eurK(r.b)}${r.a != null ? ` / ${eurK(r.a)}` : ""}</text>`;
  }).join("");
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(nomi.join(" e "))}">
    <rect x="${largL}" y="4" width="10" height="7" rx="1.5" fill="#cbd5e1"/><text x="${largL + 14}" y="10.5" font-size="8" fill="#64748b">${esc(nomi[0])}</text>
    <rect x="${largL + 110}" y="4" width="10" height="7" rx="1.5" fill="#334155"/><text x="${largL + 124}" y="10.5" font-size="8" fill="#64748b">${esc(nomi[1])}</text>
    ${corpo}</svg>`;
}

/** Due barre impilate: incassi (incassato + da incassare) e pagamenti (pagato + da pagare). */
function svgCassa(t: { incassato: number; daIncassare: number; pagato: number; daPagare: number }, conIncassi: boolean): string {
  const righe = [
    ...(conIncassi ? [{ label: "Incassi", fatto: t.incassato, resta: t.daIncassare, colore: "#10b981", testo: ["incassato", "da incassare"] }] : []),
    { label: "Pagamenti", fatto: t.pagato, resta: t.daPagare, colore: "#f97316", testo: ["pagato", "da pagare"] },
  ];
  const max = Math.max(1, ...righe.map((r) => r.fatto + r.resta));
  const largL = 80, largB = 400, w = largL + largB + 10;
  const corpo = righe.map((r, i) => {
    const y = 6 + i * 42;
    const a = (r.fatto / max) * largB, b = (r.resta / max) * largB;
    return `<text x="${largL - 8}" y="${y + 15}" text-anchor="end" font-size="9" font-weight="600" fill="#334155">${r.label}</text>
      <rect x="${largL}" y="${y + 4}" width="${a.toFixed(1)}" height="16" rx="3" fill="${r.colore}"/>
      <rect x="${(largL + a).toFixed(1)}" y="${y + 4}" width="${b.toFixed(1)}" height="16" rx="3" fill="${r.colore}" fill-opacity="0.28"/>
      <text x="${largL}" y="${y + 33}" font-size="8" fill="#475569">${r.testo[0]} ${eurK(r.fatto)} · ${r.testo[1]} ${eurK(r.resta)}</text>`;
  }).join("");
  return `<svg width="100%" viewBox="0 0 ${w} ${righe.length * 42 + 6}" role="img" aria-label="Cassa della commessa">${corpo}</svg>`;
}

export function htmlContoEconomico(d: DossierEconomico, azienda: AziendaDocumento, opzioni: { mostraMargini: boolean; mostraIncassi: boolean }): string {
  const colore = /^#[a-f0-9]{6}$/i.test(azienda.colore ?? "") ? azienda.colore! : "#1e3a5f";
  const c = d.conto;
  const oggi = new Date().toLocaleDateString("it-IT");
  const td = (v: string, st = "") => `<td style="padding:5px 7px;${st}">${v}</td>`;
  const num = "text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;";
  const th = (t: string, al = "right") => `<th style="padding:6px 7px;text-align:${al};font-size:7pt;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">${t}</th>`;
  const totale = (label: string, prev: number | null, cons: number | null, forte = false, margine = false) => {
    const col = (v: number | null) => (!margine || v == null ? "" : v >= 0 ? "color:#047857;" : "color:#b91c1c;");
    return `<tr style="border-top:${forte ? "1.5px solid #cbd5e1" : "1px solid #e2e8f0"};${forte ? "background:#f8fafc;font-weight:700;" : ""}">
      ${td(esc(label), "font-weight:600;")}${td(eur(prev), num + col(prev))}${td(pct(su(prev, c.ricavi)), num + "color:#64748b;")}${td("", "")}
      ${td(eur(cons), num + col(cons))}${td(pct(su(cons, c.ricavoMaturato)), num + "color:#64748b;")}${td("", "")}</tr>`;
  };
  const pallino = (k: string) => `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${COLORI[k] ?? "#94a3b8"};margin-right:6px;"></span>`;
  const righeVoci = c.righe.map((r) => `<tr style="border-top:1px solid #eef2f7;">
      ${td(pallino(r.key) + esc(r.label))}${td(eur(r.preventivo), num)}${td(pct(r.incidenzaPreventivo), num + "color:#64748b;")}${td(eur(r.previstoAOggi), num + "color:#64748b;")}
      ${td(eur(r.consuntivo), num + "font-weight:600;")}${td(pct(r.incidenzaConsuntivo), num + "color:#64748b;")}
      ${td(r.scostamento == null ? "—" : Math.abs(r.scostamento) < 0.5 ? "in linea" : `${r.scostamento > 0 ? "+" : "−"}${eur(Math.abs(r.scostamento))}`, num + (r.scostamento != null && r.scostamento > 0.5 ? "color:#b91c1c;font-weight:600;" : r.scostamento != null && r.scostamento < -0.5 ? "color:#047857;" : ""))}</tr>`).join("");

  const fasi = d.fasi.map((f, i) => {
    const e = f.economia;
    const barra = `<div style="height:5px;background:#e2e8f0;border-radius:3px;margin-top:3px;width:70px;"><div style="height:5px;width:${Math.min(100, f.percentuale)}%;background:${colore};border-radius:3px;"></div></div>`;
    return `<tr style="border-top:1px solid #eef2f7;${i % 2 ? "background:#f8fafc;" : ""}">
      ${td(esc(f.nome))}${td(`${f.percentuale}%${barra}`, "white-space:nowrap;")}${td(eur(e.venduto || null), num)}${td(eur(e.costoPrevisto || null), num)}${td(eur(e.costoConsuntivo || null), num)}
      ${td(e.scostamento ? `${e.scostamento > 0 ? "+" : "−"}${eur(Math.abs(e.scostamento))}` : "—", num + (e.scostamento > 0.5 ? "color:#b91c1c;" : ""))}
      ${opzioni.mostraMargini ? td(pct(e.margineConsuntivoPct), num + (e.margineConsuntivoPct != null && e.margineConsuntivoPct < 0 ? "color:#b91c1c;" : "")) : ""}</tr>`;
  }).join("");

  const q = d.quadro;
  const t = d.totaliQuadro;
  const rate = q?.rate.map((r) => `<tr style="border-top:1px solid #eef2f7;">${td(esc(r.label ?? "Rata"))}${td(r.is_paid ? `incassata il ${data(r.paid_date)}` : `scadenza ${data(r.expected_date)}`)}${td(esc(r.fattura ?? "non fatturata"))}${td(`<span style="padding:1px 7px;border-radius:9px;font-size:7.5pt;background:${r.is_paid ? "#dcfce7;color:#166534" : r.scaduta ? "#fee2e2;color:#991b1b" : "#fef3c7;color:#92400e"};">${statoRata(r).label}</span>`)}${td(eur(r.amount), num + "font-weight:600;")}</tr>`).join("") ?? "";
  const pill = (stato: string, testo: string) => {
    const s = stato === "pagato" ? "#dcfce7;color:#166534" : stato === "scaduto" ? "#fee2e2;color:#991b1b" : stato === "fattura_da_arrivare" ? "#dbeafe;color:#1e40af" : stato === "da_maturare" ? "#f1f5f9;color:#475569" : "#fef3c7;color:#92400e";
    return `<span style="padding:1px 7px;border-radius:9px;font-size:7.5pt;white-space:nowrap;background:${s};">${testo}</span>`;
  };
  const uscite = q?.uscite.map((u) => `<tr style="border-top:1px solid #eef2f7;">
      ${td(`<strong>${esc(u.controparte ?? "Senza fornitore")}</strong><div style="color:#64748b;font-size:7.5pt;">${esc(u.descrizione)}${u.riferimento ? ` · ${esc(u.riferimento)}` : ""}</div>`)}
      ${td(esc(CATEGORIE.find((x) => x.value === u.categoria)?.label ?? u.categoria), "font-size:8pt;")}${td(esc(documentoUscita(u)), "font-size:8pt;")}
      ${td(eur(u.importo), num)}${td(eur(u.pagato), num)}${td(eur(u.stato === "fattura_da_arrivare" ? 0 : u.residuo), num + "font-weight:600;")}
      ${td(u.stato === "pagato" ? "—" : data(u.scadenza), num)}${td(pill(u.stato, STATO_USCITA[u.stato].label))}</tr>`).join("") ?? "";

  // Grafici
  const segmentiCosti = c.righe.map((r) => ({ label: r.label, valore: r.consuntivo, colore: COLORI[r.key] ?? "#94a3b8" }));
  const margineResiduo = c.ricavi - c.costiConsuntivo;
  const torta = svgTorta(
    [...segmentiCosti, ...(opzioni.mostraMargini && margineResiduo > 0 ? [{ label: "Margine sui ricavi", valore: margineResiduo, colore: COLORI.margine }] : [])],
    opzioni.mostraMargini && margineResiduo > 0 ? { titolo: "ricavi", valore: eurK(c.ricavi) } : { titolo: "costi", valore: eurK(c.costiConsuntivo) },
  );
  const barreVoci = c.haPreventivo
    ? svgBarreCoppie(c.righe.filter((r) => r.preventivo != null || r.consuntivo > 0).map((r) => ({ label: r.label, a: r.previstoAOggi ?? r.preventivo, b: r.consuntivo, colore: COLORI[r.key] ?? "#334155" })),
      [d.ordine.avanzamento != null ? `previsto a oggi (${d.ordine.avanzamento}%)` : "preventivo", "consuntivo"])
    : "";
  const barreFasi = d.fasi.some((f) => f.economia.venduto || f.economia.costoConsuntivo)
    ? svgBarreCoppie(d.fasi.slice(0, 14).map((f) => ({ label: f.nome.length > 26 ? `${f.nome.slice(0, 25)}…` : f.nome, a: f.economia.venduto || null, b: f.economia.costoConsuntivo, colore: colore })), ["venduto", "costo sostenuto"])
    : "";
  const cassa = t ? svgCassa(t, opzioni.mostraIncassi) : "";

  const tabella = (testa: string, corpo: string) => `<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:6px;"><thead><tr style="background:${colore};color:white;">${testa}</tr></thead><tbody>${corpo}</tbody></table>`;
  let n = 0;
  const titolo = (t: string, sotto = "") => `<div class="sezione"><div style="display:flex;align-items:baseline;gap:8px;margin:20px 0 8px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${colore};color:white;font-size:9pt;font-weight:700;">${++n}</span>
      <h2 style="font-size:12pt;color:#0f172a;">${t}</h2>${sotto ? `<span style="font-size:8pt;color:#64748b;">${sotto}</span>` : ""}</div>`;
  const fine = `</div>`;
  const kpi = (l: string, v: string, nota = "", tono = "#0f172a", sfondo = "#ffffff") =>
    `<div class="k" style="background:${sfondo};"><div class="l">${l}</div><div class="v" style="color:${tono};">${v}</div>${nota ? `<div class="nt">${nota}</div>` : ""}</div>`;
  const margineOk = d.margineDiretto.importo >= 0;

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Conto economico ${esc(d.ordine.codice ?? "")}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{font-family:"Helvetica Neue",Arial,sans-serif;font-size:9pt;color:#1e293b;background:white;}
@media print{@page{size:A4;margin:1.2cm;}.salto{break-before:page;}}
.page{max-width:794px;margin:0 auto;padding:0 28px 26px;}
table{table-layout:auto;}tr,.k,.grafico{break-inside:avoid;}thead{display:table-header-group;}
.k{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;flex:1;min-width:0;}
.k .l{font-size:6.8pt;color:#64748b;text-transform:uppercase;letter-spacing:.6px;}
.k .v{font-size:13pt;font-weight:800;margin-top:3px;font-variant-numeric:tabular-nums;}
.k .nt{font-size:7.5pt;color:#64748b;margin-top:1px;}
.grafico{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;}
.grafico h3{font-size:8pt;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;}
.nota{font-size:7pt;color:#94a3b8;margin-top:4px;line-height:1.45;}
</style></head><body>
<div style="background:${colore};color:white;padding:22px 28px 18px;">
  <div style="max-width:738px;margin:0 auto;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
    <div>
      <div style="font-size:8pt;letter-spacing:1.4px;text-transform:uppercase;opacity:.8;">Conto economico della commessa</div>
      <div style="font-size:22pt;font-weight:800;margin-top:2px;">${esc(d.ordine.codice ?? "")}</div>
      <div style="font-size:10pt;opacity:.92;">${esc(d.ordine.descrizione ?? "")}</div>
      <div style="font-size:8pt;opacity:.8;margin-top:6px;">Lavori ${data(d.ordine.inizio)} → ${data(d.ordine.fine)} · avanzamento ${d.ordine.avanzamento == null ? "non indicato" : `${d.ordine.avanzamento}%`}</div>
    </div>
    <div style="text-align:right;">
      ${azienda.logo_url ? `<div style="background:white;border-radius:8px;padding:6px 8px;display:inline-block;margin-bottom:6px;"><img src="${esc(azienda.logo_url)}" alt="Logo" style="max-height:40px;max-width:140px;object-fit:contain;display:block;"></div>` : ""}
      <div style="font-size:9pt;font-weight:700;">${esc(azienda.ragione_sociale)}</div>
      <div style="font-size:7.5pt;opacity:.8;">Documento interno · ${oggi}</div>
    </div>
  </div>
</div>
<div class="page">

<div style="display:flex;gap:8px;margin:16px 0 10px;">
  ${kpi("Ricavi", eur(c.ricavi), "contratto + varianti")}
  ${kpi("Costi registrati", eur(c.costiConsuntivo), `${pct(su(c.costiConsuntivo, c.ricavi))} dei ricavi`)}
  ${opzioni.mostraMargini ? kpi("Margine diretto", eur(d.margineDiretto.importo), pct(d.margineDiretto.pct), margineOk ? "#047857" : "#b91c1c", margineOk ? "#f0fdf4" : "#fef2f2") : ""}
  ${opzioni.mostraMargini && c.margineNettoMaturato != null ? kpi("Margine netto maturato", eur(c.margineNettoMaturato), "dopo la quota di struttura", c.margineNettoMaturato >= 0 ? "#047857" : "#b91c1c") : ""}
</div>
<p class="nota" style="margin:-4px 0 4px;">Importi senza IVA salvo dove indicato. Il margine diretto è sui ricavi totali; quello netto maturato sui lavori fatti finora (${d.ordine.avanzamento == null ? "avanzamento non indicato" : `${d.ordine.avanzamento}%`}).</p>

${torta ? `<div class="grafico" style="margin-top:10px;"><h3>${opzioni.mostraMargini && margineResiduo > 0 ? "Dove vanno i ricavi" : "Composizione dei costi"}</h3>${torta}</div>` : ""}
${barreVoci ? `<div class="grafico" style="margin-top:8px;"><h3>Previsto e speso per voce</h3>${barreVoci}<p class="nota">In rosso le voci oltre il previsto a questo punto dei lavori.</p></div>` : ""}

${titolo("Preventivo e consuntivo per voce")}
${tabella(th("Voce", "left") + th("Preventivo") + th("Inc.") + th("Previsto a oggi") + th("Consuntivo") + th("Inc.") + th("Scostamento"),
  totale("Ricavi" + (d.ordine.avanzamento != null ? ` (maturato al ${d.ordine.avanzamento}%)` : ""), c.ricavi, c.ricavoMaturato, true) + righeVoci
  + totale("Totale costi della commessa", c.haPreventivo ? c.costiPreventivo : null, c.costiConsuntivo)
  + (opzioni.mostraMargini ? totale("Margine di commessa", c.haPreventivo ? c.marginePreventivo : null, c.margineMaturato, true, true)
    + totale("Costi di struttura (quota)", c.struttura.preventivo, c.struttura.consuntivo)
    + totale("Margine netto", c.margineNettoPreventivo, c.margineNettoMaturato, true, true) : ""))}
<p class="nota">Preventivo: costo previsto delle lavorazioni. Consuntivo: costi registrati, gli stessi del Controllo di Gestione. Incidenza sui ricavi totali (preventivo) e sul maturato (consuntivo). La struttura è la quota dei costi generali e d'ufficio sui cantieri attivi: una stima gestionale.</p>
${fine}

${d.fasi.length ? `<div class="salto"></div>${titolo("Fasi di lavorazione", `${d.fasi.length} fasi`)}
${barreFasi ? `<div class="grafico" style="margin-bottom:8px;"><h3>Venduto e costo sostenuto per fase</h3>${barreFasi}</div>` : ""}
${tabella(th("Fase", "left") + th("Avanz.", "left") + th("Venduto") + th("Costo previsto") + th("Costo sostenuto") + th("Scostamento") + (opzioni.mostraMargini ? th("Margine") : ""), fasi)}
<p class="nota">Un articolo usato su più fasi resta sulla fase della sua riga. Provvigioni, errori, costi diretti e rimborsi stanno nel conto per voce.</p>${fine}` : ""}

${q ? `${titolo("Cassa della commessa", "IVA inclusa")}
${cassa ? `<div class="grafico" style="margin-bottom:8px;">${cassa}</div>` : ""}${fine}` : ""}

${opzioni.mostraIncassi && q ? `${titolo("Incassi dal cliente")}
<p style="margin-bottom:6px;">Incassato <strong>${eur(t?.incassato)}</strong> · da incassare <strong>${eur(t?.daIncassare)}</strong>${t && t.incassoScaduto > 0 ? ` · <span style="color:#b91c1c;">scaduti ${eur(t.incassoScaduto)}</span>` : ""}</p>
${q.rate.length ? tabella(th("Rata", "left") + th("Data", "left") + th("Fattura", "left") + th("Stato", "left") + th("Importo"), rate) : `<p style="color:#64748b;">Nessuna rata nel piano pagamenti.</p>`}
${q.sal_cliente.length ? `<p style="margin-top:6px;font-size:8pt;">SAL del cliente: ${q.sal_cliente.map((s) => `SAL ${s.numero_sal} del ${data(s.data_emissione)} ${eur(s.importo_totale)} (${s.incassato ? "incassato" : s.stato})`).join(" · ")}</p>` : ""}${fine}` : ""}

${q ? `${titolo("Pagamenti della commessa", `${q.uscite.length} ${q.uscite.length === 1 ? "voce" : "voci"}`)}
<p style="margin-bottom:6px;">Pagato <strong>${eur(t?.pagato)}</strong> · da pagare <strong>${eur(t?.daPagare)}</strong>${t && t.pagamentoScaduto > 0 ? ` · <span style="color:#b91c1c;">scaduti ${eur(t.pagamentoScaduto)}</span>` : ""}${t && t.impegnato > 0 ? ` · ordinato senza fattura ${eur(t.impegnato)}` : ""}</p>
${q.uscite.length ? tabella(th("Controparte", "left") + th("Categoria", "left") + th("Documento", "left") + th("Importo") + th("Pagato") + th("Residuo") + th("Scadenza") + th("Stato", "left"), uscite) : `<p style="color:#64748b;">Nessuna uscita registrata.</p>`}${fine}` : ""}

<div style="margin-top:24px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:7pt;color:#94a3b8;display:flex;justify-content:space-between;"><span>${esc(azienda.ragione_sociale)} · ${esc(d.ordine.codice ?? "")}</span><span>Conto economico · generato il ${oggi}</span></div>
</div></body></html>`;
}
