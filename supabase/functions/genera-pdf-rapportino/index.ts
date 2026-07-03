/**
 * genera-pdf-rapportino — PDF "classic premium" del rapportino di cantiere.
 *
 * Layout allineato a generate-quote-pdf (brand header + barra bicolore, titolo
 * centrato, chip-box, tabella zebrata, GALLERIA FOTO multi-pagina, box firme,
 * footer band con paginazione). Titolo dinamico: "RAPPORTO DI FINE LAVORI"
 * quando lavoro_completato è true (in quel caso i box firma compaiono sempre,
 * anche vuoti, pronti per la controfirma).
 *
 * POST body: { rapportino_id: string }
 */
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(str: string | null | undefined, max: number): string {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// Rimuove i caratteri fuori WinAnsi (le StandardFonts non li codificano).
function winAnsiSafe(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—…€]/g, "");
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const clean = winAnsiSafe(text);
  const lines: string[] = [];
  for (const paragraph of clean.split(/\n+/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const probe = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(probe, size) <= maxWidth) {
        current = probe;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

async function embedImage(pdfDoc: any, url: string): Promise<any | null> {
  try {
    const resp = await fetchWithTimeout(url, { timeoutMs: 20_000 });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("png") || url.split("?")[0].endsWith(".png")) {
      return await pdfDoc.embedPng(buf);
    }
    return await pdfDoc.embedJpg(buf);
  } catch {
    return null;
  }
}

function hexToRgb(hex: string | null | undefined, fallback: [number, number, number]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return rgb(...fallback);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const METEO_LABEL: Record<string, string> = {
  soleggiato: "Soleggiato",
  nuvoloso: "Nuvoloso",
  pioggia: "Pioggia",
  neve: "Neve",
  vento: "Vento",
};

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const { rapportino_id } = body as { rapportino_id: string };
    if (!rapportino_id) return errorResponse("rapportino_id mancante", 400, corsH);

    // ── Fetch dati in parallelo ───────────────────────────────────────────────
    const { data: rap, error: rapErr } = await supabaseAdmin
      .from("campo_rapportini")
      .select(
        "*, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name), ordine:orders!campo_rapportini_order_id_fkey(order_code, description, client_name, work_address, indirizzo_lavori)",
      )
      .eq("id", rapportino_id)
      .single();

    if (rapErr || !rap) return errorResponse("Rapportino non trovato", 404, corsH);

    const [{ data: profile }, { data: company }, branding] = await Promise.all([
      supabaseAdmin.from("profiles").select("company_id").eq("id", userId).single(),
      supabaseAdmin
        .from("companies")
        .select("name, legal_address, legal_city, email, phone, vat_number")
        .eq("id", rap.company_id)
        .single(),
      getBrandingForCompany(supabaseAdmin, rap.company_id),
    ]);

    if (!profile || profile.company_id !== rap.company_id) {
      return errorResponse("Non autorizzato", 403, corsH);
    }

    const isFineLavori = !!rap.lavoro_completato;

    // ── Setup documento ───────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const pageW = 595;
    const pageH = 842;
    const margin = 46;
    const contentW = pageW - margin * 2;

    const primaryC = hexToRgb(branding?.primaryColor, [0.06, 0.16, 0.34]); // navy fallback
    const accentC = rgb(0.976, 0.455, 0.082); // #F97415
    const textC = rgb(0.09, 0.11, 0.15);
    const mutedC = rgb(0.42, 0.45, 0.5);
    const lightC = rgb(0.89, 0.91, 0.93);
    const chipBg = rgb(0.965, 0.97, 0.98);

    let page = pdfDoc.addPage([pageW, pageH]);
    let y = pageH;

    const drawT = (t: string, x: number, yy: number, font: any, size: number, color = textC) =>
      page.drawText(winAnsiSafe(t), { x, y: yy, font, size, color });
    const drawRight = (t: string, xRight: number, yy: number, font: any, size: number, color = textC) =>
      page.drawText(winAnsiSafe(t), { x: xRight - font.widthOfTextAtSize(winAnsiSafe(t), size), y: yy, font, size, color });
    const hline = (yy: number, color = lightC, thickness = 0.6) =>
      page.drawLine({ start: { x: margin, y: yy }, end: { x: pageW - margin, y: yy }, thickness, color });

    // Nuova pagina quando lo spazio non basta (footer occupa i 60pt bassi).
    const ensureSpace = (needed: number) => {
      if (y - needed < 70) {
        page = pdfDoc.addPage([pageW, pageH]);
        y = pageH - margin;
      }
    };

    // ── Header brand ──────────────────────────────────────────────────────────
    const aziendaNome = truncate(company?.name ?? "Azienda", 48);
    drawT(aziendaNome, margin, pageH - 44, fontBold, 15, primaryC);
    const contactBits = [
      [company?.legal_address, company?.legal_city].filter(Boolean).join(", "),
      company?.phone,
      company?.email,
      company?.vat_number ? `P.IVA ${company.vat_number}` : null,
    ].filter(Boolean) as string[];
    if (contactBits.length) {
      drawT(truncate(contactBits.join("  ·  "), 110), margin, pageH - 60, fontReg, 8, mutedC);
    }
    // Barra bicolore
    page.drawRectangle({ x: 0, y: pageH - 78, width: pageW * 0.68, height: 4, color: primaryC });
    page.drawRectangle({ x: pageW * 0.68, y: pageH - 78, width: pageW * 0.32, height: 4, color: accentC });

    // ── Titolo centrato ───────────────────────────────────────────────────────
    const titolo = isFineLavori ? "RAPPORTO DI FINE LAVORI" : "RAPPORTINO GIORNALIERO";
    const titleSize = 21;
    page.drawText(titolo, {
      x: (pageW - fontBold.widthOfTextAtSize(titolo, titleSize)) / 2,
      y: pageH - 116,
      font: fontBold,
      size: titleSize,
      color: primaryC,
    });
    const dataLavoro = rap.data_lavoro
      ? new Date(rap.data_lavoro + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })
      : "—";
    const metaLine = [
      rap.ordine?.order_code ? `Commessa ${rap.ordine.order_code}` : null,
      truncate(rap.ordine?.description, 44) || null,
      dataLavoro,
    ].filter(Boolean).join("   ·   ");
    page.drawText(winAnsiSafe(metaLine), {
      x: (pageW - fontReg.widthOfTextAtSize(winAnsiSafe(metaLine), 9.5)) / 2,
      y: pageH - 132,
      font: fontReg,
      size: 9.5,
      color: mutedC,
    });
    // Seconda riga meta: cliente + indirizzo cantiere (se noti)
    const metaLine2 = [
      rap.ordine?.client_name ? `Cliente: ${truncate(rap.ordine.client_name, 34)}` : null,
      truncate(rap.ordine?.work_address || rap.ordine?.indirizzo_lavori, 52) || null,
    ].filter(Boolean).join("   ·   ");
    if (metaLine2) {
      page.drawText(winAnsiSafe(metaLine2), {
        x: (pageW - fontReg.widthOfTextAtSize(winAnsiSafe(metaLine2), 8.5)) / 2,
        y: pageH - 145,
        font: fontReg,
        size: 8.5,
        color: mutedC,
      });
    }

    y = pageH - 168;

    // ── Chip-box riepilogo ────────────────────────────────────────────────────
    const autoreName = `${rap.autore?.first_name ?? ""} ${rap.autore?.last_name ?? ""}`.trim() || "—";
    const oreLabel = rap.ore_straordinario > 0
      ? `${rap.ore_lavorate ?? 0}h + ${rap.ore_straordinario}h straord.`
      : `${rap.ore_lavorate ?? 0}h`;
    const chips: [string, string][] = [
      ["OPERAIO", truncate(autoreName, 26)],
      ["ORE LAVORATE", oreLabel],
      ["METEO", rap.meteo ? (METEO_LABEL[rap.meteo] ?? rap.meteo) : "—"],
      ["AVANZAMENTO", `${rap.percentuale_avanzamento ?? 0}%`],
    ];
    const chipGap = 8;
    const chipW = (contentW - chipGap * (chips.length - 1)) / chips.length;
    const chipH = 42;
    chips.forEach(([label, value], i) => {
      const cx = margin + i * (chipW + chipGap);
      page.drawRectangle({ x: cx, y: y - chipH, width: chipW, height: chipH, color: chipBg, borderColor: lightC, borderWidth: 0.7 });
      drawT(label, cx + 8, y - 14, fontBold, 6.5, mutedC);
      drawT(truncate(value, 24), cx + 8, y - 30, fontBold, 10, textC);
    });
    y -= chipH + 18;

    // ── Descrizione lavori ────────────────────────────────────────────────────
    if (rap.descrizione_lavori) {
      ensureSpace(60);
      drawT("DESCRIZIONE LAVORI", margin, y, fontBold, 9.5, primaryC);
      y -= 15;
      const lines = wrapText(rap.descrizione_lavori, fontReg, 9.5, contentW - 4);
      for (const line of lines) {
        ensureSpace(14);
        drawT(line, margin, y, fontReg, 9.5, textC);
        y -= 13;
      }
      y -= 6;
      hline(y);
      y -= 16;
    }

    // ── Materiali ─────────────────────────────────────────────────────────────
    const materiali: any[] = Array.isArray(rap.materiali_usati) ? rap.materiali_usati : [];
    if (materiali.length > 0) {
      ensureSpace(60);
      drawT("MATERIALI UTILIZZATI", margin, y, fontBold, 9.5, primaryC);
      y -= 16;

      const qtyX = margin + contentW - 150;
      const umX = margin + contentW - 105;
      const fonteX = margin + contentW - 60;

      page.drawRectangle({ x: margin, y: y - 4, width: contentW, height: 15, color: primaryC });
      drawT("Materiale", margin + 5, y, fontBold, 7.5, rgb(1, 1, 1));
      drawT("Q.tà", qtyX, y, fontBold, 7.5, rgb(1, 1, 1));
      drawT("U.M.", umX, y, fontBold, 7.5, rgb(1, 1, 1));
      drawT("Fonte", fonteX, y, fontBold, 7.5, rgb(1, 1, 1));
      y -= 17;

      materiali.forEach((m, idx) => {
        ensureSpace(16);
        if (idx % 2 === 1) {
          page.drawRectangle({ x: margin, y: y - 4, width: contentW, height: 14, color: rgb(0.972, 0.976, 0.984) });
        }
        drawT(truncate(m.nome, 52), margin + 5, y, fontReg, 8.5, textC);
        drawT(String(m.quantita ?? ""), qtyX, y, fontReg, 8.5, textC);
        drawT(truncate(m.unita, 8), umX, y, fontReg, 8.5, textC);
        drawT(m.da_furgone ? "Furgone" : "Manuale", fonteX, y, fontReg, 8, mutedC);
        y -= 14;
      });
      y -= 6;
      hline(y);
      y -= 16;
    }

    // ── Note ──────────────────────────────────────────────────────────────────
    if (rap.note) {
      ensureSpace(46);
      drawT("NOTE", margin, y, fontBold, 9.5, primaryC);
      y -= 15;
      for (const line of wrapText(rap.note, fontReg, 9, contentW - 4).slice(0, 12)) {
        ensureSpace(13);
        drawT(line, margin, y, fontReg, 9, textC);
        y -= 12;
      }
      y -= 8;
    }

    // ── Galleria foto ─────────────────────────────────────────────────────────
    const fotoUrls: string[] = Array.isArray(rap.foto_urls) ? rap.foto_urls : [];
    if (fotoUrls.length > 0) {
      const images = await Promise.all(fotoUrls.map((u) => embedImage(pdfDoc, u)));
      const valid = images.filter(Boolean);
      if (valid.length > 0) {
        ensureSpace(40);
        drawT("DOCUMENTAZIONE FOTOGRAFICA", margin, y, fontBold, 9.5, primaryC);
        drawRight(`${valid.length} foto`, pageW - margin, y, fontReg, 8, mutedC);
        y -= 14;

        const cellGap = 10;
        const cellW = (contentW - cellGap) / 2;
        const cellH = 168;
        let col = 0;
        valid.forEach((img: any, idx: number) => {
          if (col === 0) ensureSpace(cellH + 24);
          const cx = margin + col * (cellW + cellGap);
          const cellTop = y;
          page.drawRectangle({
            x: cx, y: cellTop - cellH, width: cellW, height: cellH,
            color: rgb(0.985, 0.985, 0.985), borderColor: lightC, borderWidth: 0.7,
          });
          const dims = img.scaleToFit(cellW - 8, cellH - 8);
          page.drawImage(img, {
            x: cx + (cellW - dims.width) / 2,
            y: cellTop - cellH + (cellH - dims.height) / 2,
            width: dims.width,
            height: dims.height,
          });
          drawT(`Foto ${idx + 1}`, cx + 2, cellTop - cellH - 10, fontReg, 7, mutedC);
          if (col === 1 || idx === valid.length - 1) {
            y -= cellH + 22;
            col = 0;
          } else {
            col = 1;
          }
        });
        y -= 4;
      }
    }

    // ── Firme ─────────────────────────────────────────────────────────────────
    // Sul fine lavori i box compaiono SEMPRE (anche senza immagine, con riga per
    // la firma a penna); sul giornaliero solo se una firma esiste davvero.
    const [firmaOperaioImg, firmaClienteImg] = await Promise.all([
      rap.firma_operaio_url ? embedImage(pdfDoc, rap.firma_operaio_url) : Promise.resolve(null),
      rap.firma_cliente_url ? embedImage(pdfDoc, rap.firma_cliente_url) : Promise.resolve(null),
    ]);
    const showSigs = isFineLavori || firmaOperaioImg || firmaClienteImg;
    if (showSigs) {
      const sigH = 74;
      ensureSpace(sigH + 46);
      y -= 6;
      const sigW = (contentW - 18) / 2;
      const sigDefs: { label: string; img: any; nome: string }[] = [
        { label: "FIRMA OPERAIO", img: firmaOperaioImg, nome: autoreName },
        { label: "FIRMA CLIENTE", img: firmaClienteImg, nome: rap.firma_cliente_nome ?? "" },
      ];
      sigDefs.forEach((sig, i) => {
        const sx = margin + i * (sigW + 18);
        drawT(sig.label, sx, y, fontBold, 7.5, mutedC);
        page.drawRectangle({
          x: sx, y: y - 8 - sigH, width: sigW, height: sigH,
          color: rgb(0.98, 0.98, 0.98), borderColor: lightC, borderWidth: 0.8,
        });
        if (sig.img) {
          const dims = sig.img.scaleToFit(sigW - 12, sigH - 12);
          page.drawImage(sig.img, {
            x: sx + (sigW - dims.width) / 2,
            y: y - 8 - sigH + (sigH - dims.height) / 2,
            width: dims.width,
            height: dims.height,
          });
        } else {
          page.drawLine({
            start: { x: sx + 14, y: y - 8 - sigH + 16 },
            end: { x: sx + sigW - 14, y: y - 8 - sigH + 16 },
            thickness: 0.7,
            color: rgb(0.62, 0.65, 0.7),
          });
        }
        if (sig.nome) drawT(truncate(sig.nome, 34), sx, y - 8 - sigH - 11, fontReg, 7.5, mutedC);
      });
      if (rap.firma_cliente_at) {
        const firmatoIl = new Date(rap.firma_cliente_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" });
        drawRight(`Firmato il ${firmatoIl}`, pageW - margin, y - 8 - sigH - 11, fontReg, 7, mutedC);
      }
      y -= sigH + 34;
    }

    // ── Footer band su tutte le pagine ────────────────────────────────────────
    const pages = pdfDoc.getPages();
    const generatedAt = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    pages.forEach((p, idx) => {
      p.drawRectangle({ x: 0, y: 0, width: pageW, height: 20, color: primaryC });
      p.drawRectangle({ x: 0, y: 20, width: pageW, height: 2.2, color: accentC });
      p.drawText(winAnsiSafe(`${aziendaNome}  ·  Generato il ${generatedAt}  ·  ${branding.platformName}`), {
        x: margin, y: 7, font: fontReg, size: 6.5, color: rgb(1, 1, 1),
      });
      const pageLabel = `Pagina ${idx + 1} di ${pages.length}`;
      p.drawText(pageLabel, {
        x: pageW - margin - fontReg.widthOfTextAtSize(pageLabel, 6.5),
        y: 7, font: fontReg, size: 6.5, color: rgb(1, 1, 1),
      });
    });

    // ── Serialize + upload ────────────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save();

    const pdfPath = `${rap.company_id}/${rapportino_id}/rapportino.pdf`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("campo-rapportini")
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      return errorResponse(`Errore upload PDF: ${uploadErr.message}`, 500, corsH);
    }

    const { data: urlData } = supabaseAdmin.storage.from("campo-rapportini").getPublicUrl(pdfPath);
    const pdfUrl = urlData.publicUrl;

    const { error: updateErr } = await supabaseAdmin
      .from("campo_rapportini")
      .update({ pdf_url: pdfUrl })
      .eq("id", rapportino_id);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return errorResponse(`Errore aggiornamento: ${updateErr.message}`, 500, corsH);
    }

    return jsonResponse({ pdf_url: pdfUrl }, 200, corsH);
  } catch (e: any) {
    console.error("genera-pdf-rapportino error:", e);
    return errorResponse(e.message ?? "Errore interno", 500, corsH);
  }
});
