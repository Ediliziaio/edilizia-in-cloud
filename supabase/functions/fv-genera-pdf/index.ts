/**
 * Edge Function: fv-genera-pdf (§41-44)
 *
 * Genera 3 tipi di PDF (vendita 12pp, tecnico 6pp, mobile 3pp) basati sul
 * template html-to-PDF. Salva su storage `fv-progetti/<company_id>/`.
 *
 * Body: { progetto_id, tipo: 'vendita'|'tecnico'|'mobile' }
 * Output: { url, size_bytes, pages_count, duration_ms }
 *
 * Implementazione: HTML stringificato + libreria 'pdf-lib' lato Deno è limitata
 * → usiamo un approccio HTML+CSS-to-PDF via servizio esterno o fallback puro
 * con generazione SVG/HTML stampato. Per Wave 1 generiamo PDF "real" come
 * stringa HTML salvata come .html visualizzabile inline + utilizziamo una
 * libreria leggera Deno-compatible per il PDF reale.
 *
 * NOTA W1: usiamo pdfkit-deno minimal stub. La generazione full a 12 pagine
 * con grafici richiederebbe Puppeteer/Playwright (non disponibile in edge fn).
 * Soluzione W1: serializziamo HTML completo + lo convertiamo in PDF via
 * libreria @nfwn/pdfkit-deno o fallback "raw HTML printable" (browser print).
 *
 * Per maintainability, MVP genera PDF semplice via pdf-lib (ufficialmente
 * supportato in Deno). Il template completo 12pp con grafici è in W2 con
 * pipeline Puppeteer dedicata.
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

interface Payload { progetto_id: string; tipo: "vendita" | "tecnico" | "mobile" }

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  const t0 = Date.now();
  // deno-lint-ignore no-explicit-any
  let supabaseAdmin: any = null;
  let userId: string | null = null;

  try {
    const auth = await requireAuth(req, corsHeaders);
    userId = auth.userId;
    supabaseAdmin = auth.supabaseAdmin;

    const p = (await req.json()) as Payload;
    if (!p.progetto_id) return errorResponse("progetto_id mancante", 400, corsHeaders);
    if (!["vendita","tecnico","mobile"].includes(p.tipo)) return errorResponse("tipo non valido", 400, corsHeaders);

    const [progRes, calcRes, compRes, manodRes, servRes, templateRes, companyRes] = await Promise.all([
      supabaseAdmin.from("fv_progetti").select("*").eq("id", p.progetto_id).maybeSingle(),
      supabaseAdmin.from("fv_calcolo_finanziario").select("*").eq("progetto_id", p.progetto_id).eq("attivo", true).maybeSingle(),
      supabaseAdmin.from("fv_componenti_progetto").select("*").eq("progetto_id", p.progetto_id),
      supabaseAdmin.from("fv_manodopera_progetto").select("*").eq("progetto_id", p.progetto_id),
      supabaseAdmin.from("fv_servizi_progetto").select("*").eq("progetto_id", p.progetto_id),
      supabaseAdmin.from("fv_template_pdf").select("*").maybeSingle(),
      supabaseAdmin.from("companies").select("id, name").maybeSingle(),
    ]);

    const prog = progRes.data;
    const calc = calcRes.data;
    if (!prog) return errorResponse("Progetto non trovato", 404, corsHeaders);

    // Genera PDF
    const pdfBytes = await generaPdf({
      tipo: p.tipo,
      progetto: prog,
      calcolo: calc,
      componenti: compRes.data ?? [],
      manodopera: manodRes.data ?? [],
      servizi: servRes.data ?? [],
      template: templateRes.data,
      company: companyRes.data,
    });

    // Upload su storage
    const filename = `${prog.numero}-${p.tipo}.pdf`;
    const path = `${prog.company_id}/${prog.id}/${Date.now()}-${filename}`;
    const { error: errUp } = await supabaseAdmin.storage
      .from("fv-progetti")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (errUp) throw new Error(`Upload PDF fallito: ${errUp.message}`);

    // Aggiorna progetto + log
    const fieldUrl = p.tipo === "vendita" ? "pdf_vendita_url" : p.tipo === "tecnico" ? "pdf_tecnico_url" : "pdf_mobile_url";
    await supabaseAdmin.from("fv_progetti").update({ [fieldUrl]: path } as Record<string, unknown>).eq("id", p.progetto_id);
    await supabaseAdmin.from("fv_pdf_generation_log").insert({
      progetto_id: p.progetto_id,
      tipo: p.tipo,
      versione_template: 1,
      storage_url: path,
      size_bytes: pdfBytes.byteLength,
      pages_count: pageCountForTipo(p.tipo),
      duration_ms: Date.now() - t0,
      status: "success",
      created_by: userId,
    });

    return jsonResponse({
      url: path,
      size_bytes: pdfBytes.byteLength,
      pages_count: pageCountForTipo(p.tipo),
      duration_ms: Date.now() - t0,
    }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fv-genera-pdf] ERROR:", msg);
    // Log della generazione fallita (audit trail B2). Best-effort, ignora errori.
    try {
      if (supabaseAdmin) {
        const body = await req.clone().json().catch(() => ({} as Record<string, unknown>));
        await supabaseAdmin.from("fv_pdf_generation_log").insert({
          progetto_id: (body as { progetto_id?: string })?.progetto_id ?? null,
          tipo: (body as { tipo?: string })?.tipo ?? null,
          versione_template: 1,
          storage_url: null,
          size_bytes: 0,
          pages_count: 0,
          duration_ms: Date.now() - t0,
          status: "error",
          error_message: msg.substring(0, 500),
          created_by: userId,
        });
      }
    } catch {
      /* noop: non bloccare la response per un fail di logging */
    }
    return errorResponse(msg, 500, corsHeaders);
  }
});

function pageCountForTipo(tipo: string): number {
  return tipo === "vendita" ? 12 : tipo === "tecnico" ? 6 : 3;
}

interface GenInput {
  tipo: "vendita" | "tecnico" | "mobile";
  // deno-lint-ignore no-explicit-any
  progetto: any;
  // deno-lint-ignore no-explicit-any
  calcolo: any;
  // deno-lint-ignore no-explicit-any
  componenti: any[];
  // deno-lint-ignore no-explicit-any
  manodopera: any[];
  // deno-lint-ignore no-explicit-any
  servizi: any[];
  // deno-lint-ignore no-explicit-any
  template: any;
  // deno-lint-ignore no-explicit-any
  company: any;
}

async function generaPdf(input: GenInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const navy = rgb(30/255, 58/255, 95/255);
  const orange = rgb(249/255, 115/255, 22/255);
  const grey = rgb(0.4, 0.4, 0.4);

  const colorePrimario = input.template?.colore_primario ?? "#1E3A5F";
  const coloreAccento = input.template?.colore_accento ?? "#F97316";

  const formatEur = (n: number | null | undefined, frac = 0): string =>
    n == null ? "—" : `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: frac, maximumFractionDigits: frac })}`;
  const formatNum = (n: number | null | undefined, frac = 0): string =>
    n == null ? "—" : n.toLocaleString("it-IT", { minimumFractionDigits: frac, maximumFractionDigits: frac });
  const formatPct = (n: number | null | undefined, frac = 1): string =>
    n == null ? "—" : `${(n * 100).toFixed(frac)}%`;

  const pages = pageCountForTipo(input.tipo);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    // Header
    page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: navy });
    page.drawText(input.company?.name ?? "Edilizia in Cloud", { x: 40, y: height - 38, size: 14, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText(`${input.tipo.toUpperCase()} · ${input.progetto.numero}`, { x: 40, y: height - 54, size: 9, font, color: rgb(0.85, 0.85, 0.85) });
    page.drawText(`${i + 1}/${pages}`, { x: width - 60, y: height - 38, size: 11, font, color: rgb(1, 1, 1) });

    // Footer
    page.drawText("Powered by Edilizia in Cloud · Calcoli aggiornati al 2026", { x: 40, y: 25, size: 8, font, color: grey });

    let y = height - 100;

    if (input.tipo === "vendita") {
      // Layout PDF Vendita 12 pagine — versione MVP testuale
      switch (i) {
        case 0: // Cover
          page.drawText("Il tuo progetto fotovoltaico", { x: 40, y, size: 26, font: fontBold, color: navy });
          y -= 50;
          page.drawText(`+ ${formatEur(input.calcolo?.risparmio_totale_25_anni ?? 0)}`, { x: 40, y, size: 48, font: fontBold, color: orange });
          y -= 30;
          page.drawText("Quello che il tuo tetto può guadagnare per te in 25 anni", { x: 40, y, size: 12, font, color: grey });
          y -= 60;
          page.drawText(`Cliente: ${input.progetto.titolo}`, { x: 40, y, size: 11, font });
          y -= 18;
          page.drawText(`Indirizzo: ${input.progetto.indirizzo}`, { x: 40, y, size: 11, font });
          break;
        case 1: // Presentazione impresa
          page.drawText("Chi siamo", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          page.drawText(input.template?.presentazione_impresa_html ?? "Impresa edile specializzata nel fotovoltaico residenziale.", { x: 40, y, size: 10, font, maxWidth: width - 80 });
          break;
        case 2: // Tetto + analisi tecnica
          page.drawText("Il tuo tetto, dal satellite", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          page.drawText(`Potenza impianto: ${formatNum(input.progetto.potenza_kwp, 2)} kWp`, { x: 40, y, size: 12, font });
          y -= 20;
          page.drawText(`Numero pannelli: ${input.progetto.numero_pannelli_scelti}`, { x: 40, y, size: 12, font });
          y -= 20;
          page.drawText(`Ore sole annue: ${formatNum(input.progetto.ore_sole_annue)} h`, { x: 40, y, size: 12, font });
          y -= 20;
          page.drawText(`Produzione attesa: ${formatNum(input.progetto.produzione_annua_kwh)} kWh/anno`, { x: 40, y, size: 12, font });
          break;
        case 3: // Consumi + soluzione
          page.drawText("I tuoi consumi e la soluzione", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          page.drawText(`Consumo annuo: ${formatNum(input.progetto.consumo_annuo_kwh)} kWh`, { x: 40, y, size: 12, font });
          y -= 20;
          page.drawText(`Autoconsumo previsto: ${formatPct(input.progetto.autoconsumo_pct)}`, { x: 40, y, size: 12, font });
          y -= 20;
          page.drawText(`Energia autoconsumata: ${formatNum(input.calcolo?.energia_autoconsumata_kwh)} kWh`, { x: 40, y, size: 12, font });
          break;
        case 4: // Componenti
          page.drawText("Componenti scelti per te", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          for (const c of input.componenti.slice(0, 8)) {
            page.drawText(`• ${c.descrizione} ${c.marca ? `(${c.marca})` : ""} — qta ${c.quantita}`, { x: 40, y, size: 10, font, maxWidth: width - 80 });
            y -= 15;
          }
          break;
        case 5: // Quanto risparmi (KPI HERO)
          page.drawText("Quanto risparmi davvero", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 50;
          drawKpi(page, 40, y, "Investimento", formatEur(input.progetto.prezzo_vendita_iva_inclusa), navy, fontBold, font);
          drawKpi(page, 180, y, "Risparmio anno 1", formatEur((input.calcolo?.risparmio_bolletta_eur ?? 0) + (input.calcolo?.ricavi_rid_eur ?? 0)), orange, fontBold, font);
          drawKpi(page, 320, y, "Payback", `${input.progetto.payback_anni ?? "—"} anni`, navy, fontBold, font);
          drawKpi(page, 460, y, "Risparmio 25 anni", formatEur(input.calcolo?.risparmio_totale_25_anni), orange, fontBold, font);
          break;
        case 6: // Incentivi
          page.drawText("Tutti gli incentivi che ti spettano", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          for (const inc of input.progetto.incentivi_applicati ?? []) {
            page.drawText(`✓ ${inc.nome}: ${inc.importo_eur ? formatEur(inc.importo_eur) : "—"}`, { x: 40, y, size: 11, font });
            y -= 16;
          }
          break;
        case 7: // Sensitivity + What-if
          page.drawText("Cosa succede se cambia tutto", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          page.drawText(`Scenario pessimistico (prezzo energia -15%): payback ${input.calcolo?.sensitivity_minus15?.payback_anni ?? "—"} anni`, { x: 40, y, size: 11, font });
          y -= 18;
          page.drawText(`Scenario ottimistico (prezzo energia +15%): payback ${input.calcolo?.sensitivity_plus15?.payback_anni ?? "—"} anni`, { x: 40, y, size: 11, font });
          y -= 30;
          if (input.calcolo?.scenario_auto_elettrica) {
            page.drawText(`Con auto elettrica: payback ${input.calcolo.scenario_auto_elettrica.payback_anni ?? "—"} anni`, { x: 40, y, size: 11, font });
            y -= 16;
          }
          break;
        case 8: // BTP / Deposito / FV
          page.drawText("BTP, conto deposito o fotovoltaico?", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          page.drawText(`FV 25 anni: ${formatEur((input.progetto.prezzo_vendita_iva_inclusa ?? 0) + (input.calcolo?.risparmio_totale_25_anni ?? 0))}`, { x: 40, y, size: 12, font: fontBold, color: orange });
          y -= 18;
          page.drawText(`BTP 25 anni: ${formatEur(input.calcolo?.confronto_btp_25anni?.montante)}`, { x: 40, y, size: 11, font });
          y -= 18;
          page.drawText(`Deposito 25 anni: ${formatEur(input.calcolo?.confronto_deposito_25anni?.montante)}`, { x: 40, y, size: 11, font });
          break;
        case 9: // Cosa succede se NON fai nulla
          page.drawText("Cosa succede se NON fai nulla", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          page.drawText("In 25 anni di non-fotovoltaico, regalerai migliaia di euro a chi ti vende l'energia.", { x: 40, y, size: 11, font, maxWidth: width - 80 });
          y -= 30;
          page.drawText("Quei soldi possono essere tuoi.", { x: 40, y, size: 14, font: fontBold, color: orange });
          break;
        case 10: // Garanzie
          page.drawText("Garanzie, tempistiche, recensioni", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          page.drawText(`Garanzia opera: 24 mesi (estesa 5-10 anni)`, { x: 40, y, size: 11, font });
          y -= 16;
          page.drawText(`Cantiere tipico: 2-3 giorni`, { x: 40, y, size: 11, font });
          y -= 16;
          page.drawText(`Pratica GSE entro 90 giorni dalla fine lavori`, { x: 40, y, size: 11, font });
          break;
        case 11: // CTA finale
          page.drawText("Pronto a partire?", { x: 40, y, size: 28, font: fontBold, color: orange });
          y -= 50;
          page.drawText(`Validità preventivo: ${input.template?.scadenza_validita_preventivo_giorni ?? 30} giorni`, { x: 40, y, size: 11, font });
          y -= 20;
          page.drawText(`Contatti: ${input.template?.contatto_telefono ?? "—"} · ${input.template?.contatto_email ?? "—"}`, { x: 40, y, size: 11, font });
          break;
      }
    } else if (input.tipo === "tecnico") {
      // PDF Tecnico interno 6 pagine
      switch (i) {
        case 0: // Sintesi KPI
          page.drawText("PDF TECNICO INTERNO — non distribuire al cliente", { x: 40, y, size: 10, font: fontBold, color: rgb(0.8, 0, 0) });
          y -= 30;
          page.drawText("Sintesi commerciale", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          page.drawText(`Costo netto: ${formatEur(input.progetto.costo_totale_netto)}`, { x: 40, y, size: 11, font });
          y -= 16;
          page.drawText(`Prezzo vendita IVA inclusa: ${formatEur(input.progetto.prezzo_vendita_iva_inclusa)}`, { x: 40, y, size: 11, font });
          y -= 16;
          page.drawText(`Margine: ${formatEur(input.progetto.margine_eur)} (${formatPct(input.progetto.margine_pct)})`, { x: 40, y, size: 11, font: fontBold, color: orange });
          y -= 16;
          page.drawText(`Payback cliente: ${input.progetto.payback_anni ?? "—"} anni`, { x: 40, y, size: 11, font });
          break;
        case 1: // BOM componenti
          page.drawText("Bill of Materials (BOM)", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          for (const c of input.componenti) {
            page.drawText(`${c.descrizione} (${c.categoria}) — ${c.quantita} ${c.unita_misura}`, { x: 40, y, size: 9, font });
            y -= 13;
            page.drawText(`Netto: ${formatEur(c.prezzo_unitario_netto * c.quantita, 2)} | Vendita: ${formatEur(c.prezzo_unitario_vendita * c.quantita, 2)} | Margine: ${formatPct(c.margine_pct ?? 0)}`, { x: 60, y, size: 8, font, color: grey });
            y -= 16;
            if (y < 80) break;
          }
          break;
        case 2: // Manodopera
          page.drawText("Manodopera dettagliata", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          for (const m of input.manodopera) {
            page.drawText(`${m.descrizione} — ${m.ore} h × ${formatEur(m.tariffa_oraria_vendita, 2)}/h = ${formatEur(m.ore * m.tariffa_oraria_vendita, 2)}`, { x: 40, y, size: 10, font });
            y -= 16;
          }
          break;
        case 3: // Servizi & pratiche
          page.drawText("Servizi e pratiche", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          for (const s of input.servizi) {
            page.drawText(`${s.descrizione}: ${formatEur(s.prezzo_vendita, 2)} ${s.note_operative ?? ""}`, { x: 40, y, size: 10, font });
            y -= 16;
          }
          break;
        case 4: // Checklist operativa cantiere
          page.drawText("Checklist operativa cantiere", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          ["Sopralluogo tecnico", "Ordine materiali", "Pratica E-Distribuzione (TICA)", "Installazione", "Collaudo + foto", "Pratica GSE RID", "Asseverazione tecnica", "Comunicazione ENEA"].forEach((t, idx) => {
            page.drawText(`${idx + 1}. [ ] ${t}`, { x: 40, y, size: 11, font });
            y -= 18;
          });
          break;
        case 5: // Note interne
          page.drawText("Note interne e firma", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          page.drawText(`Capienza IRPEF cliente: ${input.calcolo?.capienza_irpef_ok ? "✓ Ok" : "⚠ Verificare"}`, { x: 40, y, size: 11, font });
          y -= 16;
          page.drawText(`Recupero detrazione: ${formatPct(input.calcolo?.capienza_irpef_recuperabile_pct ?? 1)}`, { x: 40, y, size: 11, font });
          y -= 30;
          page.drawText("Firma operatore: ____________________________", { x: 40, y, size: 11, font, color: grey });
          y -= 30;
          page.drawText("Data: ____________", { x: 40, y, size: 11, font, color: grey });
          break;
      }
    } else {
      // PDF Mobile/WhatsApp 3 pagine
      switch (i) {
        case 0:
          page.drawText("Il tuo impianto FV", { x: 40, y, size: 28, font: fontBold, color: navy });
          y -= 50;
          page.drawText(`+ ${formatEur(input.calcolo?.risparmio_totale_25_anni ?? 0)}`, { x: 40, y, size: 36, font: fontBold, color: orange });
          y -= 30;
          page.drawText("Risparmio in 25 anni", { x: 40, y, size: 14, font, color: grey });
          break;
        case 1:
          page.drawText("Numeri chiave", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 40;
          drawKpi(page, 40, y, "Investimento", formatEur(input.progetto.prezzo_vendita_iva_inclusa), navy, fontBold, font);
          drawKpi(page, 200, y, "Payback", `${input.progetto.payback_anni ?? "—"} anni`, orange, fontBold, font);
          y -= 80;
          drawKpi(page, 40, y, "Risparmio anno 1", formatEur((input.calcolo?.risparmio_bolletta_eur ?? 0) + (input.calcolo?.ricavi_rid_eur ?? 0)), navy, fontBold, font);
          drawKpi(page, 200, y, "TAEG implicito", formatPct(input.calcolo?.irr_pct ?? 0, 1), orange, fontBold, font);
          break;
        case 2:
          page.drawText("Vedi il preventivo completo", { x: 40, y, size: 22, font: fontBold, color: navy });
          y -= 30;
          page.drawText("Apri il PDF completo da computer per la documentazione tecnica.", { x: 40, y, size: 11, font, maxWidth: width - 80 });
          y -= 50;
          page.drawText(`Contatti: ${input.template?.contatto_telefono ?? "—"}`, { x: 40, y, size: 11, font });
          y -= 16;
          page.drawText(`WhatsApp: ${input.template?.contatto_whatsapp ?? "—"}`, { x: 40, y, size: 11, font });
          break;
      }
    }
  }

  return await doc.save();
}

// deno-lint-ignore no-explicit-any
function drawKpi(page: any, x: number, y: number, label: string, value: string, color: { red: number; green: number; blue: number }, fontBold: any, font: any) {
  page.drawRectangle({ x, y: y - 60, width: 130, height: 70, borderColor: color, borderWidth: 1 });
  page.drawText(label, { x: x + 8, y: y - 14, size: 8, font, color });
  page.drawText(value, { x: x + 8, y: y - 38, size: 16, font: fontBold, color });
}
