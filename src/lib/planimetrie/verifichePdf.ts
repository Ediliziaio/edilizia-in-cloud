/**
 * Relazione PDF delle verifiche igienico-sanitarie (shared/planimetrie/verifiche.ts): A4,
 * riepilogo e una riga per verifica, con l'esito. Da allegare alla pratica come bozza per il tecnico.
 */
import type { Verifica } from "../../../shared/planimetrie/verifiche.ts";
import { riepilogoVerifiche } from "../../../shared/planimetrie/verifiche.ts";

const MM = 72 / 25.4;
const NOMI = { rai: "Aeroilluminazione", altezza: "Altezza", superficie: "Superficie", bagno: "Bagno", alloggio: "Alloggio", interferenza: "Interferenza", scala: "Scala", contenimento: "Contenimento" } as const;
const ESITI = { ok: "Conforme", attenzione: "Da verificare", non_conforme: "Non conforme" } as const;

export async function pdfVerifiche(d: { titolo: string; stato: string; azienda?: string; verifiche: Verifica[] }): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.titolo} — verifiche igienico-sanitarie`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pulito = (s: string) => s.replace(/[^ -ÿ€’‘“”–—²]/g, "");
  const W = 210 * MM, H = 297 * MM, M = 14 * MM;
  const scuro = rgb(0.1, 0.1, 0.12), grigio = rgb(0.42, 0.42, 0.45);
  const colore = { ok: rgb(0.13, 0.55, 0.3), attenzione: rgb(0.75, 0.5, 0.05), non_conforme: rgb(0.75, 0.12, 0.12) };
  let p = doc.addPage([W, H]);
  let y = H - M - 16;
  const testo = (t: string, x: number, size = 8.5, f = font, c = scuro, max?: number) => {
    let s = pulito(t);
    if (max) while (s.length > 3 && f.widthOfTextAtSize(s, size) > max) s = s.slice(0, -2);
    p.drawText(s === pulito(t) ? s : `${s}...`, { x, y, size, font: f, color: c });
  };
  testo(`${d.titolo} — verifiche igienico-sanitarie`, M, 15, bold);
  y -= 16;
  testo(`${d.stato}. DM 5 luglio 1975 e regolamenti edilizi tipici. Controllo di massima: la verifica vera la firma il tecnico.`, M, 8.5, font, grigio);
  if (d.azienda) { y -= 11; testo(d.azienda, M, 8.5, font, grigio); }
  const r = riepilogoVerifiche(d.verifiche);
  y -= 20;
  testo(`Conformi: ${r.ok}    Da verificare: ${r.attenzione}    Non conformi: ${r.nonConformi}`, M, 10.5, bold);
  y -= 20;
  const col = { piano: M, oggetto: M + 26 * MM, verifica: M + 64 * MM, valore: M + 92 * MM, richiesto: M + 128 * MM, esito: M + 154 * MM };
  const intestazione = () => {
    for (const [t, x] of [["Piano", col.piano], ["Locale", col.oggetto], ["Verifica", col.verifica], ["Misurato", col.valore], ["Richiesto", col.richiesto], ["Esito", col.esito]] as const) testo(t, x, 8, bold, grigio);
    y -= 12;
  };
  intestazione();
  // prima i problemi
  const ordine = { non_conforme: 0, attenzione: 1, ok: 2 } as const;
  for (const v of [...d.verifiche].sort((a, b) => ordine[a.esito] - ordine[b.esito])) {
    if (y < M + 30) { p = doc.addPage([W, H]); y = H - M - 16; intestazione(); }
    testo(v.livello, col.piano, 8, font, scuro, 24 * MM);
    testo(v.oggetto, col.oggetto, 8, font, scuro, 36 * MM);
    testo(NOMI[v.codice], col.verifica, 8, font, scuro, 27 * MM);
    testo(v.valore ?? "", col.valore, 8, font, scuro, 35 * MM);
    testo(v.richiesto ?? "", col.richiesto, 8, font, grigio, 25 * MM);
    testo(ESITI[v.esito], col.esito, 8, bold, colore[v.esito]);
    y -= 10;
    if (v.esito !== "ok") { testo(v.messaggio, col.oggetto, 7.5, font, grigio, W - M - col.oggetto); y -= 10; }
    y -= 2;
  }
  return doc.save();
}
