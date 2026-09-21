import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { testoPerPdf, testiPerPdf } from "../../../supabase/functions/_shared/testoPerPdf";
import {
  clausoleDaApprovare, condizioniStandard, perArticoli, righeDaStampare, righeDelleCondizioni,
} from "../../../supabase/functions/_shared/condizioniStandard";

/**
 * Collaudo del 21/09/2026 sui documenti dei preventivi: i difetti trovati
 * rendendo tutti i moduli in tutte le varianti e nei casi limite.
 */

const leggi = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("testoPerPdf: quello che le aziende incollano da WhatsApp e da Word", () => {
  it("il titolo con un'emoji non perde più il resto della frase", () => {
    expect(testoPerPdf("La tua casa 🏠, *finalmente* nuova ✨")).toBe("La tua casa, *finalmente* nuova");
  });

  it("le frecce fanno da trattino, le spunte e le stelle spariscono", () => {
    expect(testoPerPdf("30% alla firma → 40% a metà lavori → 30% al collaudo ✓")).toBe("30% alla firma – 40% a metà lavori – 30% al collaudo");
    expect(testoPerPdf("✓ Chiavi in mano")).toBe("Chiavi in mano");
    expect(testoPerPdf("⭐ 5 stelle")).toBe("5 stelle");
    expect(testoPerPdf("→ Primo punto\n→ Secondo punto")).toBe("Primo punto\nSecondo punto");
  });

  it("i simboli matematici hanno il loro equivalente stampabile", () => {
    expect(testoPerPdf("soddisfatti ≥ 98%, garanzia ≈ 10 anni, sconto −10%")).toBe("soddisfatti >= 98%, garanzia ~ 10 anni, sconto -10%");
  });

  it("una lettera che WinAnsi non ha perde l'accento, non la lettera", () => {
    expect(testoPerPdf("Ivić Đorđević")).toBe("Ivic Dordevic");
  });

  it("il testo già stampabile resta identico (€, virgolette curve, m², ½)", () => {
    const giusto = "Testo con “virgolette”, € 1.200,00 — m² 45, ½ giornata • fine.";
    expect(testoPerPdf(giusto)).toBe(giusto);
  });

  it("su un oggetto: tutti i testi, ma non le immagini incorporate né gli indirizzi", () => {
    const img = "data:image/jpeg;base64,/9j/4AAQ→SkZJRg==";
    const out = testiPerPdf({ a: "casa ✓", b: [{ c: "x → y" }], img, url: "https://x.it/a→b", n: 3, v: null });
    expect(out).toEqual({ a: "casa", b: [{ c: "x – y" }], img, url: "https://x.it/a→b", n: 3, v: null });
  });

  it("i tre motori passano dal filtro", () => {
    expect(leggi("src/components/preventivi/pdf/adattatoreEdile.ts")).toMatch(/return testiPerPdf\(\{/);
    expect(leggi("src/components/serramenti/SerramentoPDF.tsx")).toMatch(/\} = testiPerPdf\(propsGrezze\);/);
    expect(leggi("supabase/functions/generate-quote-pdf/index.ts")).toMatch(/return testoPerPdf\(String\(str\)\)/);
  });
});

describe("condizioni: una lettura sola per tutti i motori", () => {
  const righe = righeDelleCondizioni(condizioniStandard("serramenti"));

  it("titoli, articoli ed elenchi sono riconosciuti: niente «## Art.» stampato", () => {
    expect(righe[0]).toEqual({ tipo: "h1", testo: "Condizioni generali di contratto" });
    expect(righe.some((r) => r.tipo === "h2" && r.testo === "Art. 1 — Oggetto")).toBe(true);
    expect(righe.every((r) => !r.testo.startsWith("#"))).toBe(true);
  });

  it("le clausole della seconda firma escono dal testo e non si ripetono", () => {
    const clausole = clausoleDaApprovare(righe);
    expect(clausole.length).toBe(6);
    const stampate = righeDaStampare(righe, { conRiquadroFirma: true });
    expect(stampate.some((r) => /approvare specificamente/i.test(r.testo))).toBe(false);
    expect(stampate[0].tipo).not.toBe("h1"); // il titolo generale la pagina ce l'ha già
    expect(righeDaStampare(righe, { conRiquadroFirma: false }).some((r) => /approvare specificamente/i.test(r.testo))).toBe(true);
  });

  it("articolo per articolo: ogni gruppo comincia con il suo titolo", () => {
    const gruppi = perArticoli(righeDaStampare(righe, { conRiquadroFirma: true }));
    expect(gruppi.length).toBe(15);
    expect(gruppi.every((g) => g[0].tipo === "h2")).toBe(true);
  });

  it("Serramenti: il PDF legge le condizioni riga per riga e ha il riquadro della seconda firma", () => {
    const src = leggi("src/components/serramenti/SerramentoPDF.tsx");
    expect(src).not.toContain("condizioniLegaliTesto.split(/\\n\\n+/)");
    expect(src).toContain("APPROVAZIONE SPECIFICA (ARTT. 1341 E 1342 C.C.)");
    // Il totale vero: senza, «{{preventivo.totale}}» usciva vuoto nelle condizioni.
    expect(src).toMatch(/totale: totaleDocumento,/);
  });

  it("Serramenti, pagina online: stesso riquadro, stesso elenco non ripetuto", () => {
    const src = leggi("supabase/functions/_shared/srHtmlTemplate.ts");
    expect(src).toContain("Approvazione specifica (artt. 1341 e 1342 c.c.)");
    expect(src).toMatch(/righeDaStampare\(tutte, \{ conRiquadroFirma: clausole\.length > 0 \}\)/);
  });
});

describe("impaginazione: i casi limite del collaudo", () => {
  const doc = leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx");

  it("il titolo lungo non si accavalla: anche il pezzo dritto ha la sua dimensione", () => {
    expect(doc).toContain("<Text key={i} style={{ fontSize: corpo, lineHeight: interlinea }}>{p.testo}</Text>");
  });

  it("una ragione sociale lunga non invade l'intestazione", () => {
    expect(doc).toMatch(/maxWidth: UTILE - 200, maxLines: 1, textOverflow: "ellipsis"/);
  });

  it("un'email lunga va a capo prima della chiocciola", () => {
    expect(doc).toContain("function emailACapo(");
    expect(doc).toContain("emailACapo(dati.azienda.email)");
  });

  it("la validità sta nella fascia del prezzo: niente frase sola su una pagina bianca", () => {
    expect(doc).toContain("offerta valida ${modello.giorniValidita} giorni");
    expect(doc).not.toContain('testo="Validità dell\'offerta"');
  });

  it("la firma dell'impresa non si tronca a metà parola", () => {
    expect(doc).not.toContain(".slice(0, 44)");
    expect(doc).toContain('etichetta="PER L\'IMPRESA" chi={dati.azienda.nome}');
  });

  it("Fotovoltaico: le condizioni stanno in due pagine, non tre mezze vuote", () => {
    expect(leggi("supabase/functions/_shared/fvHtmlTemplate.ts")).toContain("const PIENA = 6400;");
  });

  it("preventivo generico: accanto alla firma si dice che valgono anche le condizioni", () => {
    expect(leggi("supabase/functions/generate-quote-pdf/index.ts")).toContain("accetta il preventivo e le condizioni generali di contratto allegate");
  });
});

describe("Serramenti: le sezioni brevi consecutive condividono le pagine", () => {
  const src = leggi("src/components/serramenti/SerramentoPDF.tsx");

  it("garanzie, confronto, domande e lavori sono sezioni che scorrono", () => {
    expect(src).toContain("const scorrevoli: Record<string, React.ReactNode | null> = {");
    for (const k of ["garanzie:", "confronto:", "faq:", "gallery_lavori:"]) expect(src).toContain(`    ${k} `);
  });

  it("una sezione sale sulla pagina precedente solo se ci sta intera (la galleria può scorrere)", () => {
    expect(src).toContain('wrap={id === "gallery_lavori"}');
  });

  it("da sola, una sezione breve resta una pagina come prima", () => {
    expect(src).toMatch(/\{scorrevoli\.garanzie \? \(\n\s+<Page size="A4" style=\{styles\.page\}>/);
  });
});
