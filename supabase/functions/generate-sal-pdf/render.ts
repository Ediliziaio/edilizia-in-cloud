import {nettoSal} from "../_shared/salNetto.ts";
function escHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parts = d.split("T")[0].split("-");
  if (parts.length !== 3) return d;
  const [y, m, day] = parts;
  return `${day}/${m}/${y}`;
}

function fmtEur(n: number): string {
  return n.toLocaleString("it-IT", {style:"currency",currency:"EUR",useGrouping:true,minimumFractionDigits:2,maximumFractionDigits:2});
}

interface SalVoce {
  id: string;
  descrizione: string;
  importo_contrattuale: number;
  percentuale_avanzamento: number;
  importo_sal: number;
  note: string | null;
}

export interface SalRecord {
  id: string;
  numero_sal: number;
  data_emissione: string;
  stato: string;
  importo_totale: number;
  note: string | null;
  order_id: string;
  company_id: string;
  sal_voci: SalVoce[];
}

interface Order {
  description: string;
  order_code: string | null;
  total_amount: number | null;
  indirizzo_lavori?:string|null;
  work_address?:string|null;
  customer?:{first_name:string|null;last_name:string|null;address:string|null}|null;
}

interface Azienda {
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

/**
 * SAL di contratto di una commessa generale (tabella generale_sal): periodo, dati del contratto
 * e lordo → ritenuta → recupero dell'anticipazione → netto. Assente per i SAL di commessa.
 */
export interface ContrattoSal {
  periodo_dal: string | null;
  periodo_al: string | null;
  lordo: number;
  ritenuta_pct: number;
  ritenuta: number;
  recupero_pct: number;
  recupero_anticipazione: number;
  netto: number;
  riferimento_contratto: string | null;
  cig: string | null;
  cup: string | null;
  split_payment: boolean;
  reverse_charge: boolean;
}

function fmtPct(n: number): string {
  return `${Number(n).toLocaleString("it-IT", {maximumFractionDigits:4})}%`;
}

/** Il blocco del contratto sotto la quota nuova: dal lordo al netto da liquidare. */
export function buildContrattoHtml(c: ContrattoSal, daFatturare: number): string {
  const n=(v:unknown)=>Number(v);
  if(![c.lordo,c.ritenuta,c.recupero_anticipazione,c.netto].every(v=>Number.isFinite(n(v))))throw new Error("Importi del SAL di contratto non validi");
  if(Math.abs(n(c.lordo)-daFatturare)>0.01)throw new Error("Lordo del SAL di contratto diverso dalla quota nuova: verificare lo storico");
  if(Math.abs(n(c.lordo)-n(c.ritenuta)-n(c.recupero_anticipazione)-n(c.netto))>0.01)throw new Error("Netto del SAL di contratto non coerente");
  const riga=(etichetta:string,valore:number,forte=false)=>`<tr style="border-bottom:1px solid #f1f5f9;${forte?"font-weight:700;":""}"><td style="padding:6px 10px;font-size:9pt;">${etichetta}</td><td style="padding:6px 10px;text-align:right;font-size:9pt;">${fmtEur(valore)}</td></tr>`;
  const iva=c.split_payment ? "Fattura in scissione dei pagamenti (art. 17-ter DPR 633/72): l'IVA è versata dal committente." : c.reverse_charge ? "Fattura in inversione contabile (art. 17, c. 6, DPR 633/72): senza IVA." : "";
  return `
  <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin:0 0 20px;">
    <tbody>
      ${riga("Lavori di questo SAL",n(c.lordo),true)}
      ${riga(`Ritenuta di garanzia ${fmtPct(c.ritenuta_pct)}`,-n(c.ritenuta))}
      ${n(c.recupero_anticipazione)!==0 ? riga(`Recupero dell'anticipazione ${fmtPct(c.recupero_pct)}`,-n(c.recupero_anticipazione)) : ""}
      ${riga("Netto da liquidare",n(c.netto),true)}
    </tbody>
  </table>
  ${iva ? `<p style="margin:-12px 0 20px;font-size:8pt;color:#64748b;">${escHtml(iva)}</p>` : ""}`;
}

const STATO_LABELS: Record<string, string> = {
  bozza: "BOZZA",
  emesso: "EMESSO",
  approvato: "APPROVATO",
  firmato: "FIRMATO DAL CLIENTE",
};

/**
 * Dati in più per il verbale, tutti facoltativi: senza, il documento resta completo.
 * - vociPrecedenti: importo cumulativo di ogni voce nell'ultimo SAL emesso, per
 *   descrizione (le voci di un SAL si ricopiano dal precedente): dice voce per voce
 *   quanto era già maturato e quanto matura con questo SAL.
 * - aliquotaIva: per mostrare IVA e totale della quota nuova.
 * - importoContratto: importo della commessa, per «resta da eseguire».
 */
export interface SalExtra {
  vociPrecedenti?: Record<string, number> | null;
  aliquotaIva?: number | null;
  importoContratto?: number | null;
}

export const chiaveVoce = (d: string | null | undefined) => (d ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function buildSalHtml(sal: SalRecord, order: Order | null, azienda: Azienda, signatureUrl?: string | null, brandFooter?: string, previous=0, contratto: ContrattoSal | null = null, extra: SalExtra = {}): string {
  const colore = /^#[a-f0-9]{6}$/i.test(azienda.colore_primario??"") ? azienda.colore_primario! : "#0ea5e9";
  const voci: SalVoce[] = sal.sal_voci || [];
  if(!voci.length || voci.some(v=>!v.descrizione?.trim() || !Number.isFinite(Number(v.importo_sal)) || Number(v.importo_sal)<0 || !Number.isFinite(Number(v.importo_contrattuale)) || Number(v.importo_contrattuale)<0 || !Number.isFinite(Number(v.percentuale_avanzamento)) || Number(v.percentuale_avanzamento)<0 || Number(v.percentuale_avanzamento)>100 || Math.floor((Math.round(Number(v.importo_contrattuale)*100)*Math.round(Number(v.percentuale_avanzamento)*100)+5_000)/10_000)!==Math.round(Number(v.importo_sal)*100)))throw new Error("Voci SAL incomplete o non valide");
  if(!["bozza","emesso","approvato","firmato"].includes(sal.stato)||!Number.isInteger(sal.numero_sal)||sal.numero_sal<1)throw new Error("Stato o numerazione SAL non validi");
  const totaleContrattuale = voci.reduce((s, v) => s + Number(v.importo_contrattuale), 0);
  const totaleSal = Math.round(voci.reduce((s,v)=>s+Math.round(Number(v.importo_sal)*100),0))/100;
  if(!Number.isFinite(Number(sal.importo_totale)) || Math.abs(totaleSal-Number(sal.importo_totale))>0.01 || !Number.isFinite(previous))throw new Error("Totale SAL non coerente: verificare voci e storico");
  const economic=nettoSal(totaleSal,previous);
  const contrattoHtml=contratto ? buildContrattoHtml(contratto,economic.daFatturare) : "";
  const datiContratto=contratto ? [contratto.riferimento_contratto && `Contratto ${contratto.riferimento_contratto}`, contratto.cig && `CIG ${contratto.cig}`, contratto.cup && `CUP ${contratto.cup}`].filter(Boolean).join(" · ") : "";
  const periodo=contratto?.periodo_al ? `Lavori ${contratto.periodo_dal ? `dal ${fmtDate(contratto.periodo_dal)} ` : ""}al ${fmtDate(contratto.periodo_al)}` : "";
  const percMedia = totaleContrattuale > 0 ? (totaleSal / totaleContrattuale) * 100 : 0;
  const pct = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;

  const indirizzo = [azienda.indirizzo, azienda.cap, azienda.citta].filter(Boolean).join(", ");
  const cliente=[order?.customer?.first_name,order?.customer?.last_name].filter(Boolean).join(" ");
  const indirizzoCantiere=order?.indirizzo_lavori || order?.work_address;

  // Voce per voce: già maturato col SAL precedente e quota di questo SAL.
  const prec = extra.vociPrecedenti ?? null;
  const conPrecedente = !!prec && previous > 0;
  const righe = voci.map((v) => {
    const cum = Number(v.importo_sal);
    const contr = Number(v.importo_contrattuale);
    const p = conPrecedente ? Math.min(Number(prec![chiaveVoce(v.descrizione)] ?? 0), cum) : 0;
    return { v, cum, contr, p, pPct: contr > 0 ? (p / contr) * 100 : 0, quota: Math.round((cum - p) * 100) / 100 };
  });
  // Se le voci non coprono il precedente (voci rinominate), il periodo per voce non è affidabile: si mostra solo il cumulativo.
  const sommaPrec = Math.round(righe.reduce((s, r) => s + r.p, 0) * 100) / 100;
  const perVoceAffidabile = conPrecedente && Math.abs(sommaPrec - previous) <= 0.01;

  const th = (t: string, al = "right", w = "") => `<th style="padding:7px 8px;text-align:${al};font-size:7.5pt;font-weight:600;text-transform:uppercase;letter-spacing:.3px;${w ? `width:${w};` : ""}">${t}</th>`;
  const vociHtml = righe.map((r, i) => `
    <tr style="background:${i % 2 === 1 ? "#f8fafc" : "white"};border-bottom:1px solid #eef2f7;">
      <td style="padding:7px 8px;font-size:8pt;color:#64748b;text-align:center;">${i + 1}</td>
      <td style="padding:7px 8px;font-size:8.5pt;">${escHtml(r.v.descrizione)}${r.v.note ? `<div style="font-size:7pt;color:#94a3b8;font-style:italic;margin-top:2px;">${escHtml(r.v.note)}</div>` : ""}</td>
      <td style="padding:7px 8px;text-align:right;font-size:8.5pt;">${fmtEur(r.contr)}</td>
      ${perVoceAffidabile ? `<td style="padding:7px 8px;text-align:right;font-size:8pt;color:#64748b;">${pct(r.pPct)}</td>` : ""}
      <td style="padding:7px 8px;font-size:8.5pt;">
        <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;">
          <div style="position:relative;width:54px;height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
            ${perVoceAffidabile ? `<div style="position:absolute;left:0;top:0;bottom:0;width:${r.pPct}%;background:#94a3b8;"></div>` : ""}
            <div style="position:absolute;left:${perVoceAffidabile ? r.pPct : 0}%;top:0;bottom:0;width:${Number(r.v.percentuale_avanzamento) - (perVoceAffidabile ? r.pPct : 0)}%;background:${colore};"></div>
          </div>
          <span style="font-weight:600;min-width:34px;text-align:right;">${pct(Number(r.v.percentuale_avanzamento))}</span>
        </div>
      </td>
      <td style="padding:7px 8px;text-align:right;font-size:8.5pt;">${fmtEur(r.cum)}</td>
      ${perVoceAffidabile ? `<td style="padding:7px 8px;text-align:right;font-size:8.5pt;color:#64748b;">${fmtEur(r.p)}</td>` : ""}
      ${perVoceAffidabile ? `<td style="padding:7px 8px;text-align:right;font-size:8.5pt;font-weight:700;color:${colore};">${fmtEur(r.quota)}</td>` : ""}
    </tr>`).join("");

  const statoLabel = STATO_LABELS[sal.stato] || sal.stato.toUpperCase();
  const statoColor = ["approvato","firmato"].includes(sal.stato) ? "#16a34a" : sal.stato === "emesso" ? colore : "#94a3b8";
  const aliquota = Number.isFinite(Number(extra.aliquotaIva)) && extra.aliquotaIva != null ? Number(extra.aliquotaIva) : null;
  const ivaQuota = aliquota != null && !contratto?.reverse_charge ? Math.round(economic.daFatturare * aliquota) / 100 : null;
  const contrattoTot = Number(extra.importoContratto) > 0 ? Number(extra.importoContratto) : null;
  const restaDaEseguire = contrattoTot != null ? Math.max(0, Math.round((contrattoTot - economic.totale) * 100) / 100) : Math.max(0, Math.round((totaleContrattuale - economic.totale) * 100) / 100);
  const etichetta = (t: string) => `<div style="font-size:7pt;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">${t}</div>`;
  const campo = (t: string, v: string | null | undefined) => v ? `<div style="margin-bottom:6px;">${etichetta(t)}<div style="font-size:9pt;color:#0f172a;">${v}</div></div>` : "";
  const rigaRiep = (t: string, v: number, stile = "") => `<tr style="border-bottom:1px solid #eef2f7;${stile}"><td style="padding:6px 10px;font-size:9pt;">${t}</td><td style="padding:6px 10px;text-align:right;font-size:9pt;white-space:nowrap;">${fmtEur(v)}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>SAL n. ${sal.numero_sal}${order?.order_code ? ` · ${escHtml(order.order_code)}` : ""}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 9.5pt; color: #1e293b; background: white; }
    @media print { body { margin: 0; } @page { margin: 1.4cm; size: A4; } }
    .page { max-width: 794px; margin: 0 auto; padding: 28px 30px; }
    table { width:100%; border-collapse:collapse; } td { overflow-wrap:anywhere; vertical-align:top; } thead { display:table-header-group; } tr { break-inside:avoid; }
    .riquadro { border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; }
  </style>
</head>
<body>
<div class="page">

  <!-- Intestazione: impresa e logo -->
  <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:14px;border-bottom:3px solid ${colore};">
    <div>
      <div style="font-size:13pt;font-weight:700;color:#0f172a;">${escHtml(azienda.ragione_sociale)}</div>
      <div style="font-size:7.5pt;color:#64748b;margin-top:2px;line-height:1.5;">
        ${[azienda.partita_iva ? `P.IVA ${escHtml(azienda.partita_iva)}` : "", escHtml(indirizzo), azienda.telefono ? `Tel. ${escHtml(azienda.telefono)}` : "", escHtml(azienda.email)].filter(Boolean).join(" · ")}
      </div>
    </div>
    ${azienda.logo_url ? `<img src="${escHtml(azienda.logo_url)}" alt="Logo" style="max-height:56px;max-width:170px;object-fit:contain;" />` : ""}
  </div>

  <!-- Titolo -->
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin:18px 0 14px;">
    <div>
      <div style="font-size:8pt;font-weight:600;color:${colore};text-transform:uppercase;letter-spacing:1px;">Verbale di stato avanzamento lavori</div>
      <div style="font-size:20pt;font-weight:800;color:#0f172a;line-height:1.15;margin-top:2px;">SAL n. ${sal.numero_sal}</div>
      <div style="font-size:8.5pt;color:#475569;margin-top:3px;">Emesso il ${fmtDate(sal.data_emissione)}${periodo ? ` · ${periodo}` : ""}</div>
    </div>
    <div style="display:inline-block;background:${statoColor};color:white;font-size:7.5pt;font-weight:700;padding:5px 11px;border-radius:999px;letter-spacing:.6px;">${statoLabel}</div>
  </div>

  <!-- Dati della commessa -->
  <div class="riquadro" style="display:flex;gap:18px;margin-bottom:14px;background:#f8fafc;">
    <div style="flex:1;min-width:0;">
      ${campo("Committente", cliente ? `${escHtml(cliente)}${order?.customer?.address ? `<div style="font-size:8pt;color:#64748b;">${escHtml(order.customer.address)}</div>` : ""}` : null)}
      ${campo("Cantiere", indirizzoCantiere ? escHtml(indirizzoCantiere) : null)}
    </div>
    <div style="flex:1;min-width:0;">
      ${campo("Commessa", order ? `${order.order_code ? `${escHtml(order.order_code)} — ` : ""}${escHtml(order.description)}` : null)}
      ${campo("Contratto", datiContratto ? escHtml(datiContratto) : contrattoTot != null ? `Importo dei lavori ${fmtEur(contrattoTot)}` : null)}
    </div>
  </div>

  <!-- Numeri chiave -->
  <div style="display:flex;gap:10px;margin-bottom:14px;">
    <div class="riquadro" style="flex:1;">${etichetta("Lavori a tutto il presente SAL")}<div style="font-size:13pt;font-weight:700;">${fmtEur(economic.totale)}</div><div style="font-size:7.5pt;color:#64748b;">${pct(percMedia)} delle voci</div></div>
    <div class="riquadro" style="flex:1;">${etichetta("SAL precedenti")}<div style="font-size:13pt;font-weight:700;color:#64748b;">${fmtEur(economic.precedente)}</div></div>
    <div class="riquadro" style="flex:1;border-color:${colore};background:${colore}12;">${etichetta(economic.daFatturare<0 ? "Rettifica da verificare" : "Importo di questo SAL")}<div style="font-size:13pt;font-weight:800;color:${colore};">${fmtEur(economic.daFatturare)}</div><div style="font-size:7.5pt;color:#64748b;">IVA esclusa</div></div>
  </div>

  <!-- Voci -->
  <table style="border:1px solid #e2e8f0;margin-bottom:6px;">
    <thead>
      <tr style="background:${colore};color:white;">
        ${th("N.", "center", "26px")}${th("Voce / lavorazione", "left")}${th("Importo contratto", "right", "92px")}
        ${perVoceAffidabile ? th("% prec.", "right", "50px") : ""}${th("Avanzamento", "right", "104px")}${th("A tutto il SAL", "right", "88px")}
        ${perVoceAffidabile ? th("Precedente", "right", "84px") + th("Questo SAL", "right", "84px") : ""}
      </tr>
    </thead>
    <tbody>${vociHtml}</tbody>
    <tfoot>
      <tr style="background:#f1f5f9;font-weight:700;border-top:2px solid #cbd5e1;">
        <td></td><td style="padding:8px;font-size:9pt;">TOTALE</td>
        <td style="padding:8px;text-align:right;font-size:9pt;">${fmtEur(totaleContrattuale)}</td>
        ${perVoceAffidabile ? `<td></td>` : ""}
        <td style="padding:8px;text-align:right;font-size:9pt;">${pct(percMedia)}</td>
        <td style="padding:8px;text-align:right;font-size:9pt;">${fmtEur(totaleSal)}</td>
        ${perVoceAffidabile ? `<td style="padding:8px;text-align:right;font-size:9pt;color:#64748b;">${fmtEur(sommaPrec)}</td><td style="padding:8px;text-align:right;font-size:9pt;color:${colore};">${fmtEur(economic.daFatturare)}</td>` : ""}
      </tr>
    </tfoot>
  </table>
  ${perVoceAffidabile ? `<p style="font-size:7pt;color:#94a3b8;margin-bottom:14px;">Barra: in grigio l'avanzamento dei SAL precedenti, a colore quello maturato con questo SAL.</p>` : `<div style="height:8px;"></div>`}

  <!-- Riepilogo economico -->
  <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px;">
    <table style="flex:1.3;border:1px solid #e2e8f0;">
      <tbody>
        ${rigaRiep("Lavori eseguiti a tutto il presente SAL", economic.totale)}
        ${rigaRiep("A dedurre: SAL precedenti", -economic.precedente)}
        ${rigaRiep(economic.daFatturare<0 ? "Rettifica da verificare" : "Quota nuova di questo SAL", economic.daFatturare, `font-weight:700;background:${colore}10;`)}
        ${ivaQuota != null ? rigaRiep(`IVA ${aliquota!.toLocaleString("it-IT")}%`, ivaQuota) + rigaRiep("Totale della quota, IVA inclusa", Math.round((economic.daFatturare + ivaQuota) * 100) / 100, "font-weight:700;") : ""}
      </tbody>
    </table>
    <div class="riquadro" style="flex:1;">
      ${etichetta("Resta da eseguire")}
      <div style="font-size:12pt;font-weight:700;">${fmtEur(restaDaEseguire)}</div>
      <div style="font-size:7.5pt;color:#64748b;margin-top:2px;">${contrattoTot != null ? `su ${fmtEur(contrattoTot)} di lavori in commessa` : "sul valore delle voci"}</div>
    </div>
  </div>
  <p style="font-size:7.5pt;color:#64748b;margin:-6px 0 14px;">Importi IVA esclusa salvo dove indicato. Questo documento non è una fattura e non attesta un pagamento. Acconti e fatture già emesse si verificano prima della fatturazione.</p>
  ${sal.stato === "bozza" ? '<p style="margin:0 0 14px;color:#b45309;font-weight:bold;">BOZZA - Non emessa. Nessun link di approvazione attivo.</p>' : ""}
  ${contrattoHtml}
  ${sal.note ? `
  <div style="background:#f8fafc;border-left:3px solid ${colore};padding:10px 14px;border-radius:0 6px 6px 0;margin-bottom:14px;">
    <div style="font-size:7.5pt;font-weight:700;color:#475569;margin-bottom:3px;letter-spacing:.4px;">NOTE</div>
    <div style="font-size:9pt;color:#334155;white-space:pre-wrap;">${escHtml(sal.note)}</div>
  </div>` : ""}

  <p style="font-size:8pt;color:#475569;margin-bottom:22px;line-height:1.5;">
    Il presente stato di avanzamento è redatto sulla base dei lavori eseguiti e verificati in cantiere alla data di emissione. Le parti, sottoscrivendolo, ne riconoscono le quantità e gli importi.
  </p>

  <!-- Firme -->
  <div style="display:flex;gap:16px;break-inside:avoid;">
    ${["Direttore dei lavori", "L'impresa", "Il committente"].map((ruolo, i) => `
    <div style="flex:1;">
      <div style="font-size:7.5pt;color:#64748b;text-transform:uppercase;letter-spacing:.4px;">${ruolo}</div>
      ${i === 2 && signatureUrl ? `
      <div style="margin-top:8px;font-size:7.5pt;color:#2563eb;">Approvazione online: <a href="${escHtml(signatureUrl)}" style="color:#2563eb;overflow-wrap:anywhere;">${escHtml(signatureUrl)}</a></div>
      <div style="margin-top:3px;font-size:7pt;color:#94a3b8;">Valido 7 giorni dalla generazione</div>` : `
      <div style="height:42px;border-bottom:1px solid #94a3b8;"></div>
      <div style="margin-top:4px;font-size:7pt;color:#94a3b8;">Firma e timbro · luogo e data ____________</div>`}
    </div>`).join("")}
  </div>

  <!-- Piè di pagina -->
  <div style="margin-top:30px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:7pt;color:#94a3b8;">
    <div>${escHtml(azienda.ragione_sociale)}${azienda.partita_iva ? ` — P.IVA ${escHtml(azienda.partita_iva)}` : ""} · SAL n. ${sal.numero_sal} del ${fmtDate(sal.data_emissione)}</div>
    <div style="color:${colore};">${escHtml(brandFooter) || "Edilizia in Cloud"}</div>
  </div>

</div>
</body>
</html>`;
}
