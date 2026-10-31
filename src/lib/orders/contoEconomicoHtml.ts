/**
 * Il conto economico della commessa da stampare o salvare in PDF (Economia →
 * «Scarica conto economico»): macro-voci con preventivo, consuntivo e
 * incidenze; margini e struttura; economia di ogni fase; incassi dal cliente;
 * pagamenti con fattura, pagato, residuo e scadenza. I numeri vengono dal
 * dossier (caricaDossierEconomico), gli stessi delle schermate.
 */
import type { DossierEconomico } from "@/lib/orders/dossierEconomico";
import { CATEGORIE, STATO_USCITA, documentoUscita, statoRata } from "@/lib/orders/quadroPagamenti";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eur = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);
const data = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const su = (v: number | null, base: number) => (v == null || base <= 0 ? null : Math.round((v / base) * 1000) / 10);

export interface AziendaDocumento { ragione_sociale: string; logo_url?: string | null; colore?: string | null }

export function htmlContoEconomico(d: DossierEconomico, azienda: AziendaDocumento, opzioni: { mostraMargini: boolean; mostraIncassi: boolean }): string {
  const colore = /^#[a-f0-9]{6}$/i.test(azienda.colore ?? "") ? azienda.colore! : "#1e3a5f";
  const c = d.conto;
  const oggi = new Date().toLocaleDateString("it-IT");
  const td = (v: string, st = "") => `<td style="padding:5px 7px;${st}">${v}</td>`;
  const num = "text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;";
  const th = (t: string, al = "right") => `<th style="padding:6px 7px;text-align:${al};font-size:7.5pt;text-transform:uppercase;letter-spacing:.3px;">${t}</th>`;
  const totale = (label: string, prev: number | null, cons: number | null, forte = false, margine = false) => {
    const col = (v: number | null) => (!margine || v == null ? "" : v >= 0 ? "color:#047857;" : "color:#b91c1c;");
    return `<tr style="border-top:${forte ? "2px solid #cbd5e1" : "1px solid #e2e8f0"};${forte ? "background:#f8fafc;font-weight:700;" : ""}">
      ${td(esc(label), "font-weight:600;")}${td(eur(prev), num + col(prev))}${td(pct(su(prev, c.ricavi)), num + "color:#64748b;")}${td("", "")}
      ${td(eur(cons), num + col(cons))}${td(pct(su(cons, c.ricavoMaturato)), num + "color:#64748b;")}${td("", "")}</tr>`;
  };
  const righeVoci = c.righe.map((r) => `<tr style="border-top:1px solid #eef2f7;">
      ${td(esc(r.label))}${td(eur(r.preventivo), num)}${td(pct(r.incidenzaPreventivo), num + "color:#64748b;")}${td(eur(r.previstoAOggi), num + "color:#64748b;")}
      ${td(eur(r.consuntivo), num + "font-weight:600;")}${td(pct(r.incidenzaConsuntivo), num + "color:#64748b;")}
      ${td(r.scostamento == null ? "—" : Math.abs(r.scostamento) < 0.5 ? "in linea" : `${r.scostamento > 0 ? "+" : "−"}${eur(Math.abs(r.scostamento))}`, num + (r.scostamento != null && r.scostamento > 0.5 ? "color:#b91c1c;" : r.scostamento != null && r.scostamento < -0.5 ? "color:#047857;" : ""))}</tr>`).join("");

  const fasi = d.fasi.map((f, i) => {
    const e = f.economia;
    return `<tr style="border-top:1px solid #eef2f7;${i % 2 ? "background:#f8fafc;" : ""}">
      ${td(esc(f.nome))}${td(`${f.percentuale}%`, num)}${td(eur(e.venduto || null), num)}${td(eur(e.costoPrevisto || null), num)}${td(eur(e.costoConsuntivo || null), num)}
      ${td(e.scostamento ? `${e.scostamento > 0 ? "+" : "−"}${eur(Math.abs(e.scostamento))}` : "—", num + (e.scostamento > 0.5 ? "color:#b91c1c;" : ""))}
      ${opzioni.mostraMargini ? td(pct(e.margineConsuntivoPct), num) : ""}</tr>`;
  }).join("");

  const q = d.quadro;
  const t = d.totaliQuadro;
  const rate = q?.rate.map((r) => `<tr style="border-top:1px solid #eef2f7;">${td(esc(r.label ?? "Rata"))}${td(r.is_paid ? `incassata il ${data(r.paid_date)}` : `scadenza ${data(r.expected_date)}`)}${td(esc(r.fattura ?? "non fatturata"))}${td(statoRata(r).label)}${td(eur(r.amount), num + "font-weight:600;")}</tr>`).join("") ?? "";
  const uscite = q?.uscite.map((u) => `<tr style="border-top:1px solid #eef2f7;">
      ${td(`<strong>${esc(u.controparte ?? "Senza fornitore")}</strong><div style="color:#64748b;font-size:7.5pt;">${esc(u.descrizione)}${u.riferimento ? ` · ${esc(u.riferimento)}` : ""}</div>`)}
      ${td(esc(CATEGORIE.find((x) => x.value === u.categoria)?.label ?? u.categoria), "font-size:8pt;")}${td(esc(documentoUscita(u)), "font-size:8pt;")}
      ${td(eur(u.importo), num)}${td(eur(u.pagato), num)}${td(eur(u.stato === "fattura_da_arrivare" ? 0 : u.residuo), num + "font-weight:600;")}
      ${td(u.stato === "pagato" ? "—" : data(u.scadenza), num)}${td(STATO_USCITA[u.stato].label, "font-size:8pt;")}</tr>`).join("") ?? "";

  const tabella = (testa: string, corpo: string) => `<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin-bottom:6px;"><thead><tr style="background:${colore};color:white;">${testa}</tr></thead><tbody>${corpo}</tbody></table>`;
  const titolo = (n: number, t: string) => `<h2 style="font-size:11pt;color:#0f172a;margin:18px 0 6px;border-bottom:2px solid ${colore};padding-bottom:3px;">${n} · ${t}</h2>`;
  let n = 0;

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Conto economico ${esc(d.ordine.codice ?? "")}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}body{font-family:"Helvetica Neue",Arial,sans-serif;font-size:9pt;color:#1e293b;background:white;}
@media print{@page{size:A4;margin:1.3cm;}}.page{max-width:794px;margin:0 auto;padding:26px 28px;}table{table-layout:auto;}tr{break-inside:avoid;}thead{display:table-header-group;}
.k{border:1px solid #e2e8f0;border-radius:8px;padding:9px 11px;flex:1;}.k .l{font-size:7pt;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;}.k .v{font-size:12.5pt;font-weight:700;margin-top:2px;}</style></head><body><div class="page">
<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${colore};padding-bottom:12px;">
  <div><div style="font-size:13pt;font-weight:700;">${esc(azienda.ragione_sociale)}</div><div style="font-size:7.5pt;color:#64748b;">Documento interno · generato il ${oggi}</div></div>
  ${azienda.logo_url ? `<img src="${esc(azienda.logo_url)}" alt="Logo" style="max-height:50px;max-width:160px;object-fit:contain;">` : ""}
</div>
<div style="margin:16px 0 12px;">
  <div style="font-size:8pt;font-weight:600;color:${colore};text-transform:uppercase;letter-spacing:1px;">Conto economico della commessa</div>
  <div style="font-size:18pt;font-weight:800;">${esc(d.ordine.codice ?? "")}</div>
  <div style="font-size:9pt;color:#475569;">${esc(d.ordine.descrizione ?? "")}</div>
  <div style="font-size:8pt;color:#64748b;margin-top:3px;">Lavori ${data(d.ordine.inizio)} → ${data(d.ordine.fine)} · avanzamento ${d.ordine.avanzamento == null ? "non indicato" : `${d.ordine.avanzamento}%`} · importi senza IVA salvo dove indicato</div>
</div>
<div style="display:flex;gap:8px;margin-bottom:6px;">
  <div class="k"><div class="l">Ricavi (contratto + varianti)</div><div class="v">${eur(c.ricavi)}</div></div>
  <div class="k"><div class="l">Costi registrati</div><div class="v">${eur(c.costiConsuntivo)}</div></div>
  ${opzioni.mostraMargini ? `<div class="k"><div class="l">Margine diretto</div><div class="v" style="color:${d.margineDiretto.importo >= 0 ? "#047857" : "#b91c1c"};">${eur(d.margineDiretto.importo)} · ${pct(d.margineDiretto.pct)}</div></div>` : ""}
  ${opzioni.mostraMargini && c.margineNettoMaturato != null ? `<div class="k"><div class="l">Margine netto maturato</div><div class="v">${eur(c.margineNettoMaturato)}</div></div>` : ""}
</div>

${titolo(++n, "Preventivo e consuntivo per voce")}
${tabella(th("Voce", "left") + th("Preventivo") + th("Inc.") + th("Previsto a oggi") + th("Consuntivo") + th("Inc.") + th("Scostamento"),
  totale("Ricavi" + (d.ordine.avanzamento != null ? ` (maturato ${d.ordine.avanzamento}%)` : ""), c.ricavi, c.ricavoMaturato, true) + righeVoci
  + totale("Totale costi della commessa", c.haPreventivo ? c.costiPreventivo : null, c.costiConsuntivo)
  + (opzioni.mostraMargini ? totale("Margine di commessa", c.haPreventivo ? c.marginePreventivo : null, c.margineMaturato, true, true)
    + totale("Costi di struttura (quota)", c.struttura.preventivo, c.struttura.consuntivo)
    + totale("Margine netto", c.margineNettoPreventivo, c.margineNettoMaturato, true, true) : ""))}
<p style="font-size:7pt;color:#94a3b8;">Preventivo: costo previsto delle lavorazioni. Consuntivo: costi registrati (gli stessi del Controllo di Gestione). Incidenza sui ricavi totali (preventivo) e sul maturato (consuntivo). La struttura è una stima gestionale.</p>

${d.fasi.length ? `${titolo(++n, "Fasi di lavorazione")}
${tabella(th("Fase", "left") + th("Avanz.") + th("Venduto") + th("Costo previsto") + th("Costo sostenuto") + th("Scostamento") + (opzioni.mostraMargini ? th("Margine") : ""), fasi)}
<p style="font-size:7pt;color:#94a3b8;">Un articolo usato su più fasi resta sulla fase della sua riga. Provvigioni, errori, costi diretti e rimborsi stanno nel conto per voce.</p>` : ""}

${opzioni.mostraIncassi && q ? `${titolo(++n, "Incassi dal cliente")}
<p style="margin-bottom:6px;">Incassato <strong>${eur(t?.incassato)}</strong> · da incassare <strong>${eur(t?.daIncassare)}</strong>${t && t.incassoScaduto > 0 ? ` · <span style="color:#b91c1c;">scaduti ${eur(t.incassoScaduto)}</span>` : ""} (IVA inclusa)</p>
${q.rate.length ? tabella(th("Rata", "left") + th("Data", "left") + th("Fattura", "left") + th("Stato", "left") + th("Importo"), rate) : `<p style="color:#64748b;">Nessuna rata nel piano pagamenti.</p>`}
${q.sal_cliente.length ? `<p style="margin-top:6px;font-size:8pt;">SAL del cliente: ${q.sal_cliente.map((s) => `SAL ${s.numero_sal} del ${data(s.data_emissione)} ${eur(s.importo_totale)} (${s.incassato ? "incassato" : s.stato})`).join(" · ")}</p>` : ""}` : ""}

${q ? `${titolo(++n, "Pagamenti della commessa")}
<p style="margin-bottom:6px;">Pagato <strong>${eur(t?.pagato)}</strong> · da pagare <strong>${eur(t?.daPagare)}</strong>${t && t.pagamentoScaduto > 0 ? ` · <span style="color:#b91c1c;">scaduti ${eur(t.pagamentoScaduto)}</span>` : ""}${t && t.impegnato > 0 ? ` · ordinato senza fattura ${eur(t.impegnato)}` : ""} (IVA inclusa)</p>
${q.uscite.length ? tabella(th("Controparte", "left") + th("Categoria", "left") + th("Documento", "left") + th("Importo") + th("Pagato") + th("Residuo") + th("Scadenza") + th("Stato", "left"), uscite) : `<p style="color:#64748b;">Nessuna uscita registrata.</p>`}` : ""}

<div style="margin-top:22px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:7pt;color:#94a3b8;display:flex;justify-content:space-between;"><span>${esc(azienda.ragione_sociale)} · ${esc(d.ordine.codice ?? "")}</span><span>Conto economico · ${oggi}</span></div>
</div></body></html>`;
}
