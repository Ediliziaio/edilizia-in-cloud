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

  it("una sezione sale sulla pagina precedente solo se ci sta intera (la galleria e le recensioni possono scorrere)", () => {
    expect(src).toContain('wrap={id === "gallery_lavori" || id === "recensioni"}');
  });

  it("da sola, una sezione breve resta una pagina come prima", () => {
    expect(src).toMatch(/\{scorrevoli\.garanzie \? \(\n\s+<Page size="A4" style=\{styles\.page\}>/);
  });
});

describe("preventivo generico: l'impaginato classico parla la lingua del documento edile", () => {
  const src = leggi("supabase/functions/generate-quote-pdf/index.ts");

  it("il piè di pagina è un filetto con nome e pagina, non una banda piena", () => {
    expect(src).toContain("drawRight(page, `Pag. ${pageNum} / ${totalPages}`");
    expect(src).not.toContain("page.drawRectangle({ x: pageWidth * 0.78, y: 22, width: pageWidth * 0.22, height: 3, color: accentStrongC });");
  });

  it("intestazione: occhiello, titolo con il corsivo, la riga dei dati, le due parti senza riquadri", () => {
    expect(src).toContain('const occhiello = "LA NOSTRA OFFERTA";');
    expect(src).toContain('titolino("L\'IMPRESA", margin, y, boxW);');
    expect(src).not.toContain('chipBox(margin, boxTop, boxW, boxH, "DATI AZIENDA");');
  });

  it("il totale è la fascia a tutta larghezza nel colore dell'azienda, staccata dall'ultima riga", () => {
    expect(src).toContain("page.drawRectangle({ x: 0, y: y - h + 22, width: pageWidth, height: h, color: fondoEdC });");
    expect(src).toMatch(/y -= 18;\n\s+const h = 42;/);
  });

  it("le firme sono righe da firmare con il nome sotto", () => {
    expect(src).toContain('sigBox(margin, "LUOGO, DATA E FIRMA DEL CLIENTE", String(quote.client_name ?? ""));');
  });

  it("gli altri impaginati (moderno, minimale, bold) restano com'erano", () => {
    expect(src).toContain('page.drawText("OFFERTA", { x: contentX, y, size: 26, font: fontBold, color: textC });');
    expect(src).toMatch(/if \(classicPremium\) \{\n\s+\/\/ Come il computo del documento edile/);
  });
});

describe("modulo di recesso e pagina della firma in tutti i documenti", () => {
  it("un testo solo per il modulo, per tutti i documenti", async () => {
    const { MODULO_RECESSO } = await import("../../../supabase/functions/_shared/condizioniStandard");
    expect(MODULO_RECESSO.dichiarazione("RST-1")).toContain("preventivo RST-1.");
    expect(MODULO_RECESSO.campi).toHaveLength(3);
  });

  // Dal 21/09/2026 il modulo lo accende l'azienda nel modello, spento di serie: serve
  // solo a chi firma con un privato a casa sua o a distanza. Prima usciva ogni volta
  // che le condizioni nominavano il recesso, cioè sempre con il testo di base.
  it("i quattro motori allegano il modulo solo quando l'azienda lo accende", () => {
    expect(leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx")).toContain("MODULO_RECESSO.dichiarazione(dati.codice)");
    expect(leggi("src/components/preventivi/pdf/adattatoreEdile.ts")).toContain("conRecesso: t.modulo_recesso_attivo === true,");
    expect(leggi("supabase/functions/_shared/fvHtmlTemplate.ts")).toContain("if (haModuloRecesso(d)) pages.push(pageModuloRecesso(d, ++pageN, TOTAL));");
    expect(leggi("supabase/functions/_shared/fvHtmlTemplate.ts")).toContain("return haPaginaCondizioni(d) && d.template?.modulo_recesso_attivo === true;");
    expect(leggi("supabase/functions/fv-genera-pdf/index.ts")).toContain("modulo_recesso_attivo: template.modulo_recesso_attivo === true,");
    expect(leggi("supabase/functions/generate-quote-pdf/index.ts")).toContain("if (t.modulo_recesso_attivo === true) {");
    expect(leggi("src/components/serramenti/SerramentoPDF.tsx")).toContain("condizioniLegaliTesto && moduloRecessoAttivo && (");
    expect(leggi("src/components/serramenti/SerramentoPDF.tsx")).toContain("const moduloRecessoAttivo = tpl.modulo_recesso_attivo === true;");
    expect(leggi("supabase/functions/_shared/srHtmlTemplate.ts")).toContain("${renderModuloRecesso(d, totalPages(d), totalPages(d))}");
    expect(leggi("supabase/functions/_shared/srHtmlTemplate.ts")).toContain("return haCondizioni(d) && d.modulo_recesso_attivo === true;");
    expect(leggi("supabase/functions/sr-genera-pdf/index.ts")).toContain("modulo_recesso_attivo: tpl?.modulo_recesso_attivo === true,");
    // Nessuno decide più dal testo: la vecchia regola non esiste.
    expect(leggi("supabase/functions/_shared/condizioniStandard.ts")).not.toContain("prevedeRecesso");
  });

  it("la colonna nasce spenta in tutti gli undici modelli, e gli editor la mostrano", () => {
    const sql = leggi("supabase/migrations/20280921170000_modulo_recesso_interruttore.sql");
    for (const tabella of [
      "rst_template_pdf", "bgn_template_pdf", "tet_template_pdf", "clm_template_pdf", "ele_template_pdf",
      "idr_template_pdf", "pav_template_pdf", "pis_template_pdf", "sr_template_pdf", "fv_template_pdf", "quote_templates",
    ]) expect(sql).toContain(`'${tabella}'`);
    expect(sql).toContain("add column if not exists modulo_recesso_attivo boolean not null default false");
    for (const editor of [
      "src/components/preventivi/CondizioniContratto.tsx",
      "src/components/serramenti/SerramentiTemplateEditor.tsx",
      "src/components/fotovoltaico/FotovoltaicoTemplateEditor.tsx",
      "src/pages/azienda/settings/SettingsQuoteTemplates.tsx",
    ]) expect(leggi(editor)).toContain('aria-label="Allega il modulo di recesso"');
  });

  it("il conto delle pagine tiene conto del modulo (Fotovoltaico e pagina online dei Serramenti)", () => {
    expect(leggi("supabase/functions/_shared/fvHtmlTemplate.ts")).toContain("return quantePagineCondizioni(d) + 1 + (haModuloRecesso(d) ? 1 : 0);");
    expect(leggi("supabase/functions/_shared/srHtmlTemplate.ts")).toContain("(haCondizioni(d) ? 1 : 0) + (haModuloRecesso(d) ? 1 : 0)");
  });

  it("Serramenti: c'è una firma su carta, con il riepilogo, prima della seconda firma", () => {
    const src = leggi("src/components/serramenti/SerramentoPDF.tsx");
    const firma = src.indexOf("Firma del contratto</Text>");
    const seconda = src.indexOf("SECONDA FIRMA DEL COMMITTENTE");
    expect(firma).toBeGreaterThan(0);
    expect(seconda).toBeGreaterThan(firma);
    expect(src).toContain('{ e: "FIRMA DEL COMMITTENTE", chi: clienteNome, w: 0 }');
    // La partita IVA non si legge da `vat`, dichiarata più sotto: sarebbe un errore a runtime.
    expect(src).toContain("const partitaIvaFirma = template?.partita_iva || company?.partita_iva || null;");
  });
});

describe("Fotovoltaico: pagine meno vuote in fondo", () => {
  const src = leggi("supabase/functions/_shared/fvHtmlTemplate.ts");

  it("il riquadro di conclusione sta in fondo alla pagina, il resto no", () => {
    expect(src).toContain(".content { padding: 23mm 16mm 21mm; height: 100%; display: flex; flex-direction: column; }");
    expect(src).toContain(".content > .callout:last-child:not(:first-child) { margin-top: auto; }");
    // Una regola su tutti gli ultimi blocchi apriva buchi nel mezzo (schede, condizioni, modulo).
    expect(src).not.toContain(".content > :last-child:not(:first-child) { margin-top: auto; }");
  });

  it("caratteri più leggibili su un A4", () => {
    expect(src).toContain(".page-title { font-size: 25pt;");
    expect(src).toMatch(/\.callout \{[^}]*font-size: 9\.5pt;/);
  });
});
