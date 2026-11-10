import {nettoSal} from "../_shared/salNetto.ts";
import { accentoHtml, piedeSocietarioCss, vesteHtml } from "../_shared/vesteHtml.ts";
import { cssDocumento, pagina, testata } from "../_shared/stileDocumenti.ts";
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
  /** Il colore del marchio scelto in «Brand & Azienda» (coloreMarchioAzienda), se l'anagrafica non ne ha uno. */
  colore_marchio?: string | null;
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
  const riga=(etichetta:string,valore:number,classe="")=>`<tr${classe ? ` class="${classe}"` : ""}><td>${etichetta}</td><td class="num">${fmtEur(valore)}</td></tr>`;
  const iva=c.split_payment ? "Fattura in scissione dei pagamenti (art. 17-ter DPR 633/72): l'IVA è versata dal committente." : c.reverse_charge ? "Fattura in inversione contabile (art. 17, c. 6, DPR 633/72): senza IVA." : "";
  return `
  <table class="doc-tabella" style="margin:0 0 14pt;">
    <tbody>
      ${riga("Lavori di questo SAL",n(c.lordo),"forte")}
      ${riga(`Ritenuta di garanzia ${fmtPct(c.ritenuta_pct)}`,-n(c.ritenuta))}
      ${n(c.recupero_anticipazione)!==0 ? riga(`Recupero dell'anticipazione ${fmtPct(c.recupero_pct)}`,-n(c.recupero_anticipazione)) : ""}
      ${riga("Netto da liquidare",n(c.netto),"totale")}
    </tbody>
  </table>
  ${iva ? `<p class="nota" style="margin:-8pt 0 14pt;">${escHtml(iva)}</p>` : ""}`;
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
 * - foto: le foto di cantiere scelte per questo verbale, con un indirizzo già firmato.
 * - allegati: i documenti che accompagnano il verbale, per nome.
 */
export interface SalExtra {
  vociPrecedenti?: Record<string, number> | null;
  aliquotaIva?: number | null;
  importoContratto?: number | null;
  foto?: FotoVerbale[] | null;
  allegati?: string[] | null;
}

export interface FotoVerbale { url: string; data: string | null; didascalia: string | null }

/** Una pagina a sé dopo le firme: il verbale resta leggibile anche senza. Titoli e filetti dello stile unico (cssDocumento). */
export function buildFotoEAllegatiHtml(foto: FotoVerbale[], allegati: string[], _accento?: string): string {
  if (!foto.length && !allegati.length) return "";
  const titolo = (t: string) => `<div class="doc-sezione">${t}</div>`;
  const celle = foto.map((f, i) => `
    <figure style="margin:0;break-inside:avoid;">
      <img src="${escHtml(f.url)}" alt="Foto ${i + 1}" style="width:100%;height:180px;object-fit:cover;border-radius:3pt;border:.75pt solid var(--line);display:block;" />
      <figcaption class="nota" style="margin-top:3px;">${[`Foto ${i + 1}`, f.data ? fmtDate(f.data) : null, f.didascalia ? escHtml(f.didascalia) : null].filter(Boolean).join(" · ")}</figcaption>
    </figure>`).join("");
  return `
  <div style="break-before:page;">
    ${foto.length ? `${titolo("Documentazione fotografica")}<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:18px;">${celle}</div>` : ""}
    ${allegati.length ? `${titolo("Allegati al verbale")}<ol style="margin:0 0 14px 18px;line-height:1.7;">${allegati.map((a) => `<li>${escHtml(a)}</li>`).join("")}</ol>` : ""}
  </div>`;
}

export const chiaveVoce = (d: string | null | undefined) => (d ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Margini del foglio dello stile unico, in punti; la larghezza utile in mm serve alla veste. */
const MARGINE_LATERALE_MM = (pagina.margineLaterale * 25.4) / 72;

export function buildSalHtml(sal: SalRecord, order: Order | null, azienda: Azienda, signatureUrl?: string | null, brandFooter?: string, previous=0, contratto: ContrattoSal | null = null, extra: SalExtra = {}): string {
  // L'accento dello stile unico (10/11/2026): il colore della veste, poi quello dell'azienda, poi il predefinito.
  const colore = accentoHtml(sal.company_id, azienda.colore_primario, azienda.colore_marchio);
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

  // La colonna «Voce» prende tutto quello che resta (10/11/2026): le altre hanno larghezze strette e numeri su una riga
  // sola. Prima, con tutte le colonne, alla voce restavano un centinaio di pixel e «overflow-wrap:anywhere» spezzava
  // le parole a metà («Impermeabiliz zazione»).
  const th = (t: string, al = "right", w = "") => `<th style="text-align:${al};padding-left:4pt;padding-right:4pt;${w ? `width:${w};` : ""}">${t}</th>`;
  const vociHtml = righe.map((r, i) => `
    <tr>
      <td class="num" style="text-align:center;color:var(--muted);">${i + 1}</td>
      <td class="voce">${escHtml(r.v.descrizione)}${r.v.note ? `<div class="nota" style="margin-top:2px;">${escHtml(r.v.note)}</div>` : ""}</td>
      <td class="num">${fmtEur(r.contr)}</td>
      ${perVoceAffidabile ? `<td class="num" style="color:var(--muted);">${pct(r.pPct)}</td>` : ""}
      <td class="num">
        <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;">
          <div style="position:relative;width:36px;height:5px;background:var(--line);border-radius:3px;overflow:hidden;">
            ${perVoceAffidabile ? `<div style="position:absolute;left:0;top:0;bottom:0;width:${r.pPct}%;background:var(--muted);"></div>` : ""}
            <div style="position:absolute;left:${perVoceAffidabile ? r.pPct : 0}%;top:0;bottom:0;width:${Number(r.v.percentuale_avanzamento) - (perVoceAffidabile ? r.pPct : 0)}%;background:var(--accent);"></div>
          </div>
          <span style="min-width:30px;text-align:right;">${pct(Number(r.v.percentuale_avanzamento))}</span>
        </div>
      </td>
      <td class="num">${fmtEur(r.cum)}</td>
      ${perVoceAffidabile ? `<td class="num" style="color:var(--muted);">${fmtEur(r.p)}</td>` : ""}
      ${perVoceAffidabile ? `<td class="num" style="font-weight:700;">${fmtEur(r.quota)}</td>` : ""}
    </tr>`).join("");

  const statoLabel = STATO_LABELS[sal.stato] || sal.stato.toUpperCase();
  const statoOk = ["approvato","firmato"].includes(sal.stato);
  const aliquota = Number.isFinite(Number(extra.aliquotaIva)) && extra.aliquotaIva != null ? Number(extra.aliquotaIva) : null;
  const ivaQuota = aliquota != null && !contratto?.reverse_charge ? Math.round(economic.daFatturare * aliquota) / 100 : null;
  const contrattoTot = Number(extra.importoContratto) > 0 ? Number(extra.importoContratto) : null;
  // Sulle voci del verbale, non sull'importo della commessa: le varianti approvate entrano come voci e l'importo della commessa non le comprende.
  const restaDaEseguire = Math.max(0, Math.round((totaleContrattuale - economic.totale) * 100) / 100);
  const etichetta = (t: string) => `<div class="etichetta">${t}</div>`;
  const campo = (t: string, v: string | null | undefined) => v ? `<div style="margin-bottom:6pt;">${etichetta(t)}<div class="valore">${v}</div></div>` : "";
  // La veste propria (Vulcano): logo grande, piè in EB Garamond su ogni foglio. Larghezza utile: A4 meno i margini laterali.
  const veste = vesteHtml(sal.company_id, 210 - 2 * MARGINE_LATERALE_MM);
  // Il piè dello stile unico per chi non ha una veste: i dati societari, che con il logo non stanno più nella testata.
  const piede = veste.attiva ? "" : piedeSocietarioCss([
    [azienda.ragione_sociale, azienda.partita_iva ? `P.IVA ${azienda.partita_iva}` : ""].filter(Boolean).join(" — "),
    [indirizzo, azienda.telefono ? `Tel. ${azienda.telefono}` : "", azienda.email ?? ""].filter(Boolean).join(" · "),
  ]);
  const rigaRiep = (t: string, v: number, classe = "") => `<tr${classe ? ` class="${classe}"` : ""}><td>${t}</td><td class="num">${fmtEur(v)}</td></tr>`;
  const logo = azienda.logo_url
    ? `<img src="${escHtml(azienda.logo_url)}" alt="Logo" style="${veste.stileLogo ?? `height:${testata.logoAltezza}pt;width:auto;max-width:${testata.logoLarghezzaMax}pt;`}" />`
    : `<div class="ragione">${escHtml(azienda.ragione_sociale)}</div>`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>SAL n. ${sal.numero_sal}${order?.order_code ? ` · ${escHtml(order.order_code)}` : ""}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Helvetica, "Helvetica Neue", Arial, sans-serif; font-size: ${pagina.corpo}pt; line-height: ${pagina.interlinea}; color: var(--ink); background: white; }
    @page { size: A4; margin: ${pagina.margineAlto}pt ${pagina.margineLaterale}pt; }
    @media print { body { margin: 0; } }
    .page { max-width: 794px; margin: 0 auto; padding: 28px 30px; }
    @media print { .page { padding: 0; max-width: none; } }
    table { width:100%; border-collapse:collapse; } td { overflow-wrap:break-word; word-break:normal; hyphens:manual; vertical-align:top; } thead { display:table-header-group; } tr { break-inside:avoid; }
    td.voce { min-width: 140px; }
    a { overflow-wrap:anywhere; }
    .nota { font-size: ${pagina.nota}pt; color: var(--muted); }
    table.doc-tabella tr.forte td { font-weight: 700; }
    table.doc-tabella td.num { font-variant-numeric: tabular-nums; }
    .riferimenti { margin-top: 24pt; font-size: 6.5pt; color: var(--muted); }
    ${cssDocumento(colore)}
    .doc-testata .logo { flex-shrink: 0; }${piede}${veste.css}
  </style>
</head>
<body>
${veste.apri}<div class="page">

  <!-- Testata dello stile unico: logo a sinistra su bianco, titolo a destra, filetto d'accento -->
  <div class="doc-testata">
    <div class="logo">${logo}</div>
    <div class="titolo">
      <h1>Verbale di stato avanzamento lavori</h1>
      <div class="sotto">SAL n. ${sal.numero_sal} · ${sal.stato === "bozza" ? "Bozza del" : "Emesso il"} ${fmtDate(sal.data_emissione)}${periodo ? ` · ${periodo}` : ""}</div>
      <div style="margin-top:4pt;"><span class="doc-etichetta${statoOk ? " ok" : ""}">${statoLabel}</span></div>
    </div>
  </div>

  <!-- Dati della commessa -->
  <div class="doc-riquadro" style="display:flex;gap:18pt;margin-bottom:10pt;">
    <div style="flex:1;min-width:0;">
      ${campo("Committente", cliente ? `${escHtml(cliente)}${order?.customer?.address ? `<div class="nota">${escHtml(order.customer.address)}</div>` : ""}` : null)}
      ${campo("Cantiere", indirizzoCantiere ? escHtml(indirizzoCantiere) : null)}
    </div>
    <div style="flex:1;min-width:0;">
      ${campo("Commessa", order ? `${order.order_code ? `${escHtml(order.order_code)} — ` : ""}${escHtml(order.description)}` : null)}
      ${campo("Contratto", datiContratto ? escHtml(datiContratto) : contrattoTot != null ? `Importo dei lavori ${fmtEur(contrattoTot)}` : null)}
    </div>
  </div>

  <!-- Numeri chiave -->
  <div style="display:flex;gap:8pt;margin-bottom:6pt;">
    <div class="doc-riquadro" style="flex:1;">${etichetta("Lavori a tutto il presente SAL")}<div class="numero">${fmtEur(economic.totale)}</div><div class="nota">${pct(percMedia)} delle voci</div></div>
    <div class="doc-riquadro" style="flex:1;">${etichetta("SAL precedenti")}<div class="numero">${fmtEur(economic.precedente)}</div></div>
    <div class="doc-riquadro" style="flex:1;">${etichetta(economic.daFatturare<0 ? "Rettifica da verificare" : "Importo di questo SAL")}<div class="numero conta" style="font-weight:700;">${fmtEur(economic.daFatturare)}</div><div class="nota">IVA esclusa</div></div>
  </div>

  <!-- Voci -->
  <table class="doc-tabella" style="margin-top:${12}pt;margin-bottom:6pt;">
    <thead>
      <tr>
        ${th("N.", "center", "20px")}${th("Voce / lavorazione", "left")}${th("Importo contratto", "right", "72px")}
        ${perVoceAffidabile ? th("% prec.", "right", "36px") : ""}${th("Avanzamento", "right", "76px")}${th("A tutto il SAL", "right", "72px")}
        ${perVoceAffidabile ? th("Precedente", "right", "70px") + th("Questo SAL", "right", "70px") : ""}
      </tr>
    </thead>
    <tbody>${vociHtml}</tbody>
    <tfoot>
      <tr class="totale">
        <td></td><td>TOTALE</td>
        <td class="num">${fmtEur(totaleContrattuale)}</td>
        ${perVoceAffidabile ? `<td></td>` : ""}
        <td class="num">${pct(percMedia)}</td>
        <td class="num">${fmtEur(totaleSal)}</td>
        ${perVoceAffidabile ? `<td class="num">${fmtEur(sommaPrec)}</td><td class="num">${fmtEur(economic.daFatturare)}</td>` : ""}
      </tr>
    </tfoot>
  </table>
  ${perVoceAffidabile ? `<p class="nota" style="margin-bottom:14pt;">Barra: in grigio l'avanzamento dei SAL precedenti, a colore quello maturato con questo SAL.</p>` : `<div style="height:8px;"></div>`}

  <!-- Riepilogo economico -->
  <div style="display:flex;gap:14pt;align-items:flex-start;margin-bottom:10pt;">
    <table class="doc-tabella" style="flex:1.3;">
      <tbody>
        ${rigaRiep("Lavori eseguiti a tutto il presente SAL", economic.totale)}
        ${rigaRiep("A dedurre: SAL precedenti", -economic.precedente)}
        ${rigaRiep(economic.daFatturare<0 ? "Rettifica da verificare" : "Quota nuova di questo SAL", economic.daFatturare, ivaQuota != null ? "forte" : "totale")}
        ${ivaQuota != null ? rigaRiep(`IVA ${aliquota!.toLocaleString("it-IT")}%`, ivaQuota) + rigaRiep("Totale della quota, IVA inclusa", Math.round((economic.daFatturare + ivaQuota) * 100) / 100, "totale") : ""}
      </tbody>
    </table>
    <div class="doc-riquadro" style="flex:1;">
      ${etichetta("Resta da eseguire")}
      <div class="numero">${fmtEur(restaDaEseguire)}</div>
      <div class="nota" style="margin-top:2px;">su ${fmtEur(totaleContrattuale)} di voci del contratto</div>
    </div>
  </div>
  <p class="nota" style="margin:0 0 14pt;">Importi IVA esclusa salvo dove indicato. Questo documento non è una fattura e non attesta un pagamento. Acconti e fatture già emesse si verificano prima della fatturazione.</p>
  ${sal.stato === "bozza" ? '<p style="margin:0 0 14pt;color:var(--warn);font-weight:bold;">BOZZA - Non emessa. Nessun link di approvazione attivo.</p>' : ""}
  ${contrattoHtml}
  ${sal.note ? `
  <div class="doc-sezione">Note</div>
  <div style="white-space:pre-wrap;margin-bottom:14pt;">${escHtml(sal.note)}</div>` : ""}

  <p style="margin-bottom:22pt;">
    Il presente stato di avanzamento è redatto sulla base dei lavori eseguiti e verificati in cantiere alla data di emissione. Le parti, sottoscrivendolo, ne riconoscono le quantità e gli importi.
  </p>

  <!-- Firme -->
  <div style="display:flex;gap:16pt;break-inside:avoid;">
    ${["Direttore dei lavori", "L'impresa", "Il committente"].map((ruolo, i) => `
    <div style="flex:1;">
      <div class="nota" style="text-transform:uppercase;letter-spacing:.4px;">${ruolo}</div>
      ${i === 2 && signatureUrl ? `
      <div class="nota" style="margin-top:8px;color:var(--accent);">Approvazione online: <a href="${escHtml(signatureUrl)}" style="color:var(--accent);overflow-wrap:anywhere;">${escHtml(signatureUrl)}</a></div>
      <div class="nota" style="margin-top:3px;">Valido 7 giorni dalla generazione</div>` : `
      <div style="height:42px;border-bottom:.5pt solid var(--ink);"></div>
      <div class="nota" style="margin-top:4px;">Firma e timbro · luogo e data ____________</div>`}
    </div>`).join("")}
  </div>

  ${buildFotoEAllegatiHtml(extra.foto ?? [], extra.allegati ?? [], colore)}

  <!-- Riferimenti tecnici: una riga sopra il piè -->
  <div class="riferimenti">SAL n. ${sal.numero_sal} del ${fmtDate(sal.data_emissione)} · ${escHtml(brandFooter) || "Edilizia in Cloud"}</div>

</div>
${veste.chiudi}</body>
</html>`;
}
