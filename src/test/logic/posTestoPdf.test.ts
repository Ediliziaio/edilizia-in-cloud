/**
 * Il font del PDF (Roboto) non ha frecce, spunte, avvisi, emoji, lo spazio stretto U+202F: chi incolla un testo da
 * Word, WhatsApp o dall'AI («Prima → durante → dopo», «⚠ attenzione») si vedeva fermare anteprima e approvazione con
 * un codice Unicode. E le parole lunghe senza spazi (indirizzi e-mail, impronte SHA-256, URL) uscivano dalla pagina
 * e i valori sparivano dal documento.
 */
import { describe, expect, it } from "vitest";
import { sostituisciSimboliPdf, spezzaParoleLunghe, testoPerPdf } from "../../../supabase/functions/_shared/posTestoPdf";

const ZWSP = "​";

describe("simboli che il font del PDF non ha", () => {
  it("frecce, spunte, avvisi e unità compatte diventano testo equivalente", () => {
    expect(sostituisciSimboliPdf("Prima → durante → dopo")).toBe("Prima -> durante -> dopo");
    expect(sostituisciSimboliPdf("✓ Elmetto  ✔ Scarpe  ✅ Guanti")).toBe("[x] Elmetto  [x] Scarpe  [x] Guanti");
    expect(sostituisciSimboliPdf("✗ Fumare ❌ Telefono")).toBe("X Fumare X Telefono");
    expect(sostituisciSimboliPdf("⚠ Carichi sospesi")).toBe("(!) Carichi sospesi");
    expect(sostituisciSimboliPdf("tubo ⌀48 a 20℃ su 12㎡")).toBe("tubo Ø48 a 20°C su 12m²");
    expect(sostituisciSimboliPdf("☎ 02 1234567")).toBe("Tel. 02 1234567");
  });
  it("lo spazio stretto e gli spazi tipografici diventano spazi normali; i selettori invisibili spariscono", () => {
    expect(sostituisciSimboliPdf("1 200 €")).toBe("1 200 €");
    expect(sostituisciSimboliPdf("Mario Rossi")).toBe("Mario Rossi");
    expect(sostituisciSimboliPdf("a️b‍c﻿d")).toBe("abcd");
  });
  it("le emoji decorative spariscono senza lasciare doppi spazi", () => {
    expect(sostituisciSimboliPdf("📞 Chiama 🚧 il cantiere 👷")).toBe("Chiama il cantiere");
    expect(sostituisciSimboliPdf("Via Roma 1 📍")).toBe("Via Roma 1");
  });
  it("lascia stare ciò che il font ha e ciò che non sa sostituire (il PDF lo segnalerà)", () => {
    const coperti = "Città è à ù ò ì é ° ² ³ € ≥ ≤ ± × § ½ µ Ø — – … • · ’ “ ” Ș ț";
    expect(sostituisciSimboliPdf(coperti)).toBe(coperti);
    expect(sostituisciSimboliPdf("测试")).toBe("测试");
  });
});

describe("parole lunghe senza spazi", () => {
  it("le parole corte non si toccano", () => {
    const t = "Via Roma 14, 20121 Milano (MI) — tel. 02 1234567 — info@demo.it";
    expect(spezzaParoleLunghe(t)).toBe(t);
  });
  it("un'e-mail lunga si spezza dopo @ e dopo i punti; senza zero-width resta identica", () => {
    const mail = "amministrazione.contabilita@costruzionirossi-edilizia.it";
    const spezzata = spezzaParoleLunghe(mail);
    expect(spezzata).toContain(`@${ZWSP}`);
    expect(spezzata.replaceAll(ZWSP, "")).toBe(mail);
    for (const pezzo of spezzata.split(ZWSP)) expect(pezzo.length).toBeLessThanOrEqual(28);
  });
  it("un'impronta SHA-256 di 64 caratteri si spezza a blocchi, e la si ritrova togliendo i separatori", () => {
    const sha = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const spezzata = spezzaParoleLunghe(sha);
    expect(spezzata.split(ZWSP).length).toBeGreaterThanOrEqual(3);
    expect(spezzata.replaceAll(ZWSP, "")).toBe(sha);
    for (const pezzo of spezzata.split(ZWSP)) expect(pezzo.length).toBeLessThanOrEqual(24);
  });
  it("un percorso di file e un UUID con trattini si spezzano ai separatori", () => {
    const path = "11111111-1111-4111-8111-111111111111/pos/22222222-2222-4222-8222-222222222222/scheda-sicurezza.pdf";
    const spezzata = spezzaParoleLunghe(path);
    expect(spezzata.replaceAll(ZWSP, "")).toBe(path);
    for (const pezzo of spezzata.split(ZWSP)) expect(pezzo.length).toBeLessThanOrEqual(28);
  });
  it("testoPerPdf applica prima i simboli e poi le parole lunghe", () => {
    expect(testoPerPdf("Frase → con freccia")).toBe("Frase -> con freccia");
    expect(testoPerPdf("x".repeat(60)).replaceAll(ZWSP, "")).toBe("x".repeat(60));
  });
});
