/**
 * Funzioni AI che leggono un file scelto da chi chiama (30/10/2026).
 *
 * Mappando chi legge hr-documenti sono emerse sei edge function che ricevono
 * `storage_bucket` e `storage_path` e scaricano con la chiave di servizio:
 * ai-importa-condizioni, ai-document-analyzer, document-ai-router e
 * ddt-ai-extract senza alcun controllo; generic-doc-ai-extract e
 * ai-fattura-ricevuta-ocr con il solo prefisso della cartella, bucket libero.
 * ai-document-analyzer in più COPIAVA il file in altri bucket.
 *
 * Il prefisso non basta nemmeno da solo: supabase-js attacca bucket e percorso
 * all'indirizzo senza codificarli e il parser degli indirizzi legge `%2e%2e` come
 * «sali di una cartella», quindi `<azienda>/%2e%2e/…/rest/v1/<tabella>` supera
 * `startsWith` e `includes("..")` e la richiesta esce dallo storage con la
 * chiave di servizio. Stesso difetto nei parser a bucket fisso (silvio-extract-pdf,
 * ai-listino-extract, ai-tabella-finanziamento-extract).
 *
 * La regola sta in `_shared/storageAmmesso.ts`. Qui si tiene fermo:
 *   · il premio del problema (il parser degli indirizzi sale davvero) e che la
 *     regola rifiuta quelle stringhe e accetta i percorsi che l'app genera;
 *   · l'elenco dei bucket ammessi coincide con quello che le schermate mandano;
 *   · le nove funzioni chiamano la regola PRIMA di toccare lo storage, con
 *     l'elenco giusto, e chi non è tra gli ammessi è rifiutato (403);
 *   · una funzione nuova che legge `storage_bucket` dalla richiesta deve usare la
 *     regola, o entrare nell'elenco delle eccezioni scritte con il motivo.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUCKET_ANALISI_DOCUMENTI,
  BUCKET_IMPORT_CONDIZIONI,
  BUCKET_LETTURA_GENERICA,
  BUCKET_OCR_FATTURA,
  nomeBucketSicuro,
  percorsoStorageSicuro,
  valutaFile,
  type BucketAmmesso,
} from "../../../supabase/functions/_shared/storageAmmesso";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(resolve(RADICE, p), "utf8");

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const ALTRA_AZIENDA = "e7bc8fd0-fcab-4c02-bcfe-98a1488c3e7e";
const UTENTE = "1dbe6ceb-6b04-4d43-a617-8a709cb22f07";
const ALTRO_UTENTE = "13e2ca50-d885-abaf-e847-adebbe582452";
const SCHEDA = "c365dc8d-2b09-0bcc-b68c-0361b9ddc2cb";
const CHI = { companyId: AZIENDA, userId: UTENTE };

describe("il problema: il parser degli indirizzi sale davvero", () => {
  const indirizzo = (bucket: string, percorso: string) =>
    new URL(`https://progetto.supabase.co/storage/v1/object/${bucket}/${percorso}`);

  it("un percorso con %2e%2e esce dallo storage e arriva alle API del database", () => {
    const u = indirizzo("computi", `${AZIENDA}/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/rest/v1/profiles?select=*`);
    expect(u.pathname).toBe("/rest/v1/profiles");
    // …e passa i controlli che c'erano: stesso inizio, nessun «..» scritto
    const percorso = `${AZIENDA}/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/rest/v1/profiles?select=*`;
    expect(percorso.startsWith(`${AZIENDA}/`) && !percorso.includes("..")).toBe(true);
  });

  it("lo stesso vale per un bucket scritto così", () => {
    const u = indirizzo("computi/%2e%2e/%2e%2e/%2e%2e/rest/v1/profiles?select=*&x=", "qualunque.pdf");
    expect(u.pathname.startsWith("/storage/v1/object/")).toBe(false);
  });

  it("la regola rifiuta tutte queste stringhe", () => {
    const percorsi = [
      `${AZIENDA}/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/rest/v1/profiles?select=*`,
      `${AZIENDA}/%2E%2E/x.pdf`,
      `${AZIENDA}/.%2e/x.pdf`,
      `${AZIENDA}/%2e./x.pdf`,
      `${AZIENDA}/../x.pdf`,
      `${AZIENDA}/./x.pdf`,
      `${AZIENDA}//x.pdf`,
      `/${AZIENDA}/x.pdf`,
      `${AZIENDA}/x.pdf/`,
      `${AZIENDA}/x.pdf?download=1`,
      `${AZIENDA}/x.pdf#frammento`,
      `${AZIENDA}\\..\\x.pdf`,
      `${AZIENDA}/x%00.pdf`,
      `${AZIENDA}/x\u0000.pdf`,
      `${AZIENDA}/x\u202e.pdf`,
      `${AZIENDA}/${"a".repeat(1100)}.pdf`,
      "",
    ];
    for (const p of percorsi) expect(percorsoStorageSicuro(p), JSON.stringify(p).slice(0, 80)).toBe(false);
    for (const p of [undefined, null, 5, {}, ["a/b"]] as unknown[]) expect(percorsoStorageSicuro(p)).toBe(false);
  });

  it("e accetta i percorsi che l'app genera, che non cambiano l'indirizzo", () => {
    const percorsi: Array<[string, string]> = [
      ["documenti-smart", `${AZIENDA}/smart-1730300000000-Contratto-di-prova.pdf`], // SmartDocumentImportModal
      ["order-attachments", `${AZIENDA}/ai-contratti/0123456789abcdef0123456789abcdef-contratto.pdf`], // ContractImportDialog
      ["mezzi-documenti", `${AZIENDA}/${SCHEDA}/${UTENTE}-libretto.pdf`], // useMezzi
      ["silvio-uploads", `${UTENTE}/silvio_1730300000000_ab12cd.pdf`], // InternalChat
      ["silvio-uploads", `${AZIENDA}/${UTENTE}/1730300000000-fattura_di_prova.pdf`], // SilvioChatSheet
      ["quote-template-assets", `${AZIENDA}/import-condizioni-1730300000000.pdf`], // ImportaCondizioniBar
      ["finanziamenti-tabelle", `${AZIENDA}/ai-staging/1730300000000-tabella_BNL.pdf`], // SettingsFinanziamentiNuova
      ["listini-tmp", `${UTENTE}/1730300000000-listino.pdf`], // ListinoAIImport
      ["whatsapp-media", `${AZIENDA}/2026-10/${UTENTE}.pdf`], // whatsapp-ai-processor
    ];
    for (const [bucket, percorso] of percorsi) {
      expect(nomeBucketSicuro(bucket), bucket).toBe(true);
      expect(percorsoStorageSicuro(percorso), percorso).toBe(true);
      const u = new URL(`https://progetto.supabase.co/storage/v1/object/${bucket}/${percorso}`);
      expect(u.pathname.startsWith(`/storage/v1/object/${bucket}/`), percorso).toBe(true);
    }
  });

  it("i nomi di bucket sono quelli di produzione, non altro", () => {
    for (const b of ["computi", "documenti-smart", "silvio-uploads", "quote-template-assets", "hr-documenti", "ddt_attachments"]) {
      expect(nomeBucketSicuro(b), b).toBe(true);
    }
    for (const b of [
      "computi/%2e%2e/rest/v1/x", "a/b", "A", "", ".", "..", "x?y", "x%2e", "-x", " x", "x".repeat(64),
      undefined, null, 7, {},
    ] as unknown[]) {
      expect(nomeBucketSicuro(b), JSON.stringify(b)).toBe(false);
    }
  });
});

describe("valutaFile: la chiave di servizio solo per le coppie ammesse", () => {
  const servizio = (
    bucket: unknown,
    path: unknown,
    ammessi: readonly BucketAmmesso[],
    chi: { companyId: unknown; userId: unknown } = CHI,
  ) => valutaFile({ bucket, path }, ammessi, chi);

  it("bucket ammesso e cartella dell'azienda di chi chiama → chiave di servizio", () => {
    expect(servizio("documenti-smart", `${AZIENDA}/smart-1-a.pdf`, BUCKET_ANALISI_DOCUMENTI)).toEqual({ ok: true, conChiaveDiServizio: true });
    expect(servizio("quote-template-assets", `${AZIENDA}/import-condizioni-1.pdf`, BUCKET_IMPORT_CONDIZIONI)).toEqual({ ok: true, conChiaveDiServizio: true });
  });

  it("la cartella di un'altra azienda no", () => {
    expect(servizio("documenti-smart", `${ALTRA_AZIENDA}/smart-1-a.pdf`, BUCKET_ANALISI_DOCUMENTI)).toEqual({ ok: true, conChiaveDiServizio: false });
  });

  it("un bucket fuori elenco no, nemmeno nella cartella della propria azienda (hr-documenti)", () => {
    for (const ammessi of [BUCKET_IMPORT_CONDIZIONI, BUCKET_ANALISI_DOCUMENTI, BUCKET_LETTURA_GENERICA, BUCKET_OCR_FATTURA]) {
      for (const bucket of ["hr-documenti", "buste-paga", "documenti-fiscali", "pos-emissioni"]) {
        expect(servizio(bucket, `${AZIENDA}/${SCHEDA}/${UTENTE}-carta.pdf`, ammessi), bucket).toEqual({ ok: true, conChiaveDiServizio: false });
      }
    }
  });

  it("la cartella dell'utente vale solo dove è scritta", () => {
    const mio = `${UTENTE}/silvio_1_a.pdf`;
    expect(servizio("silvio-uploads", mio, BUCKET_OCR_FATTURA)).toEqual({ ok: true, conChiaveDiServizio: true });
    expect(servizio("silvio-uploads", mio, BUCKET_ANALISI_DOCUMENTI)).toEqual({ ok: true, conChiaveDiServizio: false });
    expect(servizio("documenti-smart", mio, BUCKET_OCR_FATTURA)).toEqual({ ok: true, conChiaveDiServizio: false });
    // la cartella di un altro utente no
    expect(servizio("silvio-uploads", `${ALTRO_UTENTE}/silvio_1_a.pdf`, BUCKET_OCR_FATTURA)).toEqual({ ok: true, conChiaveDiServizio: false });
  });

  it("serve un file vero dentro la cartella: l'id da solo, o con un'estensione, no", () => {
    expect(servizio("documenti-smart", AZIENDA, BUCKET_ANALISI_DOCUMENTI)).toEqual({ ok: true, conChiaveDiServizio: false });
    expect(servizio("documenti-smart", `${AZIENDA}x/a.pdf`, BUCKET_ANALISI_DOCUMENTI)).toEqual({ ok: true, conChiaveDiServizio: false });
    expect(servizio("documenti-smart", `${AZIENDA}/`, BUCKET_ANALISI_DOCUMENTI)).toEqual({ ok: false, motivo: "percorso" });
  });

  it("un id di azienda o utente che non è un uuid non apre nulla", () => {
    for (const id of ["", "x", "/", undefined, null, 5, `${AZIENDA}/..`]) {
      const r = servizio("documenti-smart", `${AZIENDA}/smart-1-a.pdf`, BUCKET_ANALISI_DOCUMENTI, { companyId: id, userId: id });
      expect(r, String(id)).toEqual({ ok: true, conChiaveDiServizio: false });
    }
  });

  it("forma sbagliata → rifiuto, prima ancora di guardare l'elenco", () => {
    expect(servizio("documenti-smart/%2e%2e/rest/v1/x", "a.pdf", BUCKET_ANALISI_DOCUMENTI)).toEqual({ ok: false, motivo: "bucket" });
    expect(servizio("documenti-smart", `${AZIENDA}/%2e%2e/%2e%2e/rest/v1/x`, BUCKET_ANALISI_DOCUMENTI)).toEqual({ ok: false, motivo: "percorso" });
    expect(servizio(undefined, `${AZIENDA}/a.pdf`, BUCKET_ANALISI_DOCUMENTI)).toEqual({ ok: false, motivo: "bucket" });
    expect(servizio("documenti-smart", 5, BUCKET_ANALISI_DOCUMENTI)).toEqual({ ok: false, motivo: "percorso" });
  });

  it("i flussi dell'app restano ammessi: bucket e percorso come li genera la schermata", () => {
    const sha = "0123456789abcdef0123456789abcdef";
    const smart = [
      ["documenti-smart", `${AZIENDA}/smart-1730300000000-Contratto-di-prova.pdf`],
      ["computi", `${AZIENDA}/smart-1730300000000-Computo.xlsx`],
    ] as const;
    // modale «Importa documento» → analizzatore, router, DDT (da storage), OCR fattura, lettura generica
    for (const [bucket, path] of smart) {
      for (const elenco of [BUCKET_ANALISI_DOCUMENTI, BUCKET_LETTURA_GENERICA, BUCKET_OCR_FATTURA]) {
        expect(servizio(bucket, path, elenco), `${bucket} ${path}`).toEqual({ ok: true, conChiaveDiServizio: true });
      }
    }
    // import condizioni
    expect(servizio("quote-template-assets", `${AZIENDA}/import-condizioni-1730300000000.pdf`, BUCKET_IMPORT_CONDIZIONI))
      .toEqual({ ok: true, conChiaveDiServizio: true });
    // import contratti di commessa e libretti dei mezzi → lettura generica
    expect(servizio("order-attachments", `${AZIENDA}/ai-contratti/${sha}-contratto.pdf`, BUCKET_LETTURA_GENERICA))
      .toEqual({ ok: true, conChiaveDiServizio: true });
    expect(servizio("mezzi-documenti", `${AZIENDA}/${SCHEDA}/${UTENTE}-libretto.pdf`, BUCKET_LETTURA_GENERICA))
      .toEqual({ ok: true, conChiaveDiServizio: true });
    // OCR fattura dalla chat interna (cartella dell'utente) e allegati di Silvio (cartella dell'azienda)
    expect(servizio("silvio-uploads", `${UTENTE}/silvio_1730300000000_ab12cd.pdf`, BUCKET_OCR_FATTURA))
      .toEqual({ ok: true, conChiaveDiServizio: true });
    expect(servizio("silvio-uploads", `${AZIENDA}/${UTENTE}/1730300000000-fattura_di_prova.pdf`, BUCKET_OCR_FATTURA))
      .toEqual({ ok: true, conChiaveDiServizio: true });
  });

  it("generic-doc-ai-extract: un file di Silvio o di un'analisi vecchia resta leggibile, ma con i diritti di chi chiama", () => {
    // fuori dall'elenco → forma pulita, nessuna chiave di servizio: la funzione scarica con il JWT dell'utente
    expect(servizio("silvio-uploads", `${AZIENDA}/${UTENTE}/1730300000000-contratto.pdf`, BUCKET_LETTURA_GENERICA))
      .toEqual({ ok: true, conChiaveDiServizio: false });
    expect(servizio("documenti-smart", `${ALTRA_AZIENDA}/smart-1-a.pdf`, BUCKET_LETTURA_GENERICA))
      .toEqual({ ok: true, conChiaveDiServizio: false });
  });

  it("gli elenchi hanno solo bucket e cartelle noti, senza doppioni", () => {
    for (const [nome, elenco] of Object.entries({ BUCKET_IMPORT_CONDIZIONI, BUCKET_ANALISI_DOCUMENTI, BUCKET_LETTURA_GENERICA, BUCKET_OCR_FATTURA })) {
      const nomi = elenco.map((b) => b.bucket);
      expect(new Set(nomi).size, nome).toBe(nomi.length);
      for (const b of elenco) {
        expect(nomeBucketSicuro(b.bucket), `${nome}: ${b.bucket}`).toBe(true);
        expect(b.cartelle.length, `${nome}: ${b.bucket}`).toBeGreaterThan(0);
        for (const c of b.cartelle) expect(["azienda", "utente"]).toContain(c);
      }
    }
    // hr-documenti e gli altri bucket riservati non sono in nessun elenco
    const tutti = new Set([...BUCKET_IMPORT_CONDIZIONI, ...BUCKET_ANALISI_DOCUMENTI, ...BUCKET_LETTURA_GENERICA, ...BUCKET_OCR_FATTURA].map((b) => b.bucket));
    for (const riservato of ["hr-documenti", "buste-paga", "documenti-fiscali", "pos-emissioni", "fascicoli-cantiere", "sicurezza-documenti"]) {
      expect(tutti.has(riservato), riservato).toBe(false);
    }
  });
});

describe("l'elenco coincide con quello che l'app manda davvero", () => {
  const ha = (elenco: readonly BucketAmmesso[], bucket: string, cartella: "azienda" | "utente") =>
    elenco.find((b) => b.bucket === bucket)?.cartelle.includes(cartella) === true;

  it("import condizioni: quote-template-assets, cartella dell'azienda", () => {
    const s = leggi("src/components/quote-templates/ImportaCondizioniBar.tsx");
    expect(s).toContain('const BUCKET_IMPORT = "quote-template-assets";');
    expect(s).toContain("const path = `${companyId}/import-condizioni-");
    expect(ha(BUCKET_IMPORT_CONDIZIONI, "quote-template-assets", "azienda")).toBe(true);
  });

  it("modale «Importa documento»: documenti-smart, o computi se manca, cartella dell'azienda", () => {
    const s = leggi("src/components/documenti/SmartDocumentImportModal.tsx");
    expect(s).toMatch(/storageBucket = "documenti-smart",/);
    expect(s).toContain('usedBucket = "computi";');
    expect(s).toContain("const path = `${companyId}/smart-");
    for (const b of ["documenti-smart", "computi"]) {
      expect(ha(BUCKET_ANALISI_DOCUMENTI, b, "azienda"), b).toBe(true);
      expect(ha(BUCKET_LETTURA_GENERICA, b, "azienda"), b).toBe(true);
      expect(ha(BUCKET_OCR_FATTURA, b, "azienda"), b).toBe(true);
    }
    // nessuna pagina passa un bucket diverso al modale
    const pagine = ["src/components/silvio/SilvioFAB.tsx", "src/pages/azienda/ContenutiMultimediali.tsx", "src/pages/azienda/marketing/Preventivi.tsx"];
    for (const p of pagine) expect(leggi(p), p).not.toMatch(/storageBucket=/);
  });

  it("import contratti di commessa: order-attachments, cartella dell'azienda", () => {
    const s = leggi("src/components/orders/ContractImportDialog.tsx");
    expect(s).toContain('const BUCKET = "order-attachments";');
    expect(s).toContain("path = `${companyId}/ai-contratti/");
    expect(ha(BUCKET_LETTURA_GENERICA, "order-attachments", "azienda")).toBe(true);
  });

  it("libretti dei mezzi: mezzi-documenti, cartella dell'azienda", () => {
    const s = leggi("src/hooks/useMezzi.ts");
    expect(s).toContain('const BUCKET = "mezzi-documenti";');
    expect(s).toContain("const path = `${companyId}/${mezzoId}/");
    expect(ha(BUCKET_LETTURA_GENERICA, "mezzi-documenti", "azienda")).toBe(true);
  });

  it("OCR fattura dalla chat interna: silvio-uploads, cartella dell'utente", () => {
    const s = leggi("src/pages/azienda/InternalChat.tsx");
    expect(s).toContain("const path = `${userId}/silvio_");
    expect(s).toContain('body: { storage_path: path, bucket: "silvio-uploads", auto_create: false }');
    expect(ha(BUCKET_OCR_FATTURA, "silvio-uploads", "utente")).toBe(true);
    // gli allegati di Silvio stanno sotto l'azienda
    expect(leggi("src/components/silvio/SilvioChatSheet.tsx")).toContain("const path = `${companyId}/${userId}/${ts}-${safeName}`;");
    expect(ha(BUCKET_OCR_FATTURA, "silvio-uploads", "azienda")).toBe(true);
  });

  it("i parser a bucket fisso ricevono ancora un percorso con il prefisso e il nome ripulito", () => {
    expect(leggi("src/pages/azienda/settings/SettingsFinanziamentiNuova.tsx")).toContain(
      "const path = `${effectiveCompany.id}/ai-staging/${ts}-${file.name.replace(/[^\\w.-]/g, \"_\")}`;",
    );
    expect(leggi("src/components/listino-import/ListinoAIImport.tsx")).toContain(
      "const storagePath = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, \"_\")}`;",
    );
  });
});

describe("le funzioni chiamano la regola prima di toccare lo storage", () => {
  const funzione = (nome: string) => leggi(`supabase/functions/${nome}/index.ts`);
  /** Il corpo della richiesta: dopo l'avvio del server, non le funzioni d'aiuto definite sopra. */
  const gestore = (sorgente: string) => {
    const m = /\b(?:Deno\.)?serve\(\s*async/.exec(sorgente);
    expect(m, "avvio del server").not.toBeNull();
    return sorgente.slice(m!.index);
  };
  const primo = (testo: string, cerca: string[]) => {
    const posizioni = cerca.map((c) => testo.indexOf(c)).filter((i) => i >= 0);
    return posizioni.length ? Math.min(...posizioni) : -1;
  };
  const LETTURE = [".download(", "hashStorageFile(", "buildParserInvocation(", ".createSignedUrl(", "downloadPdfBase64("];

  const CON_ELENCO: Array<[string, string]> = [
    ["ai-importa-condizioni", "BUCKET_IMPORT_CONDIZIONI"],
    ["ai-document-analyzer", "BUCKET_ANALISI_DOCUMENTI"],
    ["document-ai-router", "BUCKET_ANALISI_DOCUMENTI"],
    ["ddt-ai-extract", "BUCKET_ANALISI_DOCUMENTI"],
    ["generic-doc-ai-extract", "BUCKET_LETTURA_GENERICA"],
    ["ai-fattura-ricevuta-ocr", "BUCKET_OCR_FATTURA"],
  ];

  it.each(CON_ELENCO)("%s usa l'elenco %s, prima del download", (nome, elenco) => {
    const s = funzione(nome);
    expect(s).toContain(`from "../_shared/storageAmmesso.ts"`);
    const g = gestore(s);
    const m = /valutaFile\(\s*\{[^}]*\},\s*(BUCKET_[A-Z_]+),/.exec(g);
    expect(m, `${nome}: chiamata a valutaFile`).not.toBeNull();
    expect(m![1]).toBe(elenco);
    const dentro = g.indexOf("valutaFile(");
    const lettura = primo(g, LETTURE);
    expect(lettura, `${nome}: lettura dallo storage`).toBeGreaterThan(-1);
    expect(dentro, `${nome}: il controllo viene prima della lettura`).toBeLessThan(lettura);
    // forma sbagliata → 400
    expect(g).toMatch(/if \(!\w+\.ok\) return errorResponse\("Bucket o percorso del file non validi", 400, /);
  });

  it.each(CON_ELENCO.filter(([n]) => n !== "generic-doc-ai-extract"))("%s rifiuta (403) ciò che non è tra gli ammessi", (nome) => {
    const g = gestore(funzione(nome));
    expect(g).toMatch(/if \(!\w+\.conChiaveDiServizio\)\s*(?:\{\s*)?return errorResponse\("[^"]+", 403, /);
  });

  it("generic-doc-ai-extract fuori dagli ammessi scarica con i diritti di chi chiama, mai con la chiave di servizio", () => {
    const g = gestore(funzione("generic-doc-ai-extract"));
    expect(g).toMatch(/const nellaCartellaDellAzienda = ammesso\.conChiaveDiServizio;/);
    expect(g).toMatch(/const scaricatore = nellaCartellaDellAzienda\s*\?\s*supabaseAdmin\s*:\s*createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, Deno\.env\.get\("SUPABASE_ANON_KEY"\)!/);
    // il vecchio controllo, aggirabile con %2e%2e, non c'è più (nel codice: i commenti lo raccontano)
    expect(g.replace(/^\s*\/\/.*$/gm, "")).not.toContain('includes("..")');
  });

  it("ai-document-analyzer controlla prima del pagamento, della copia e dell'inoltro ai parser", () => {
    const g = gestore(funzione("ai-document-analyzer"));
    const dentro = g.indexOf("valutaFile(");
    expect(dentro).toBeGreaterThan(-1);
    for (const dopo of ["gateAiPayment(", "hashStorageFile(", "document-ai-router", "buildParserInvocation("]) {
      expect(g.indexOf(dopo), dopo).toBeGreaterThan(dentro);
    }
  });

  it("ddt-ai-extract controlla solo dove legge dallo storage (l'app manda il file in base64)", () => {
    const g = gestore(funzione("ddt-ai-extract"));
    const ramoStorage = g.indexOf("if (!storage_bucket || !storage_path || !file_name)");
    expect(ramoStorage).toBeGreaterThan(-1);
    expect(g.indexOf("valutaFile(")).toBeGreaterThan(ramoStorage);
    expect(g.indexOf("valutaFile(")).toBeLessThan(g.indexOf(".download("));
  });

  const SOLO_FORMA: Array<[string, string]> = [
    ["silvio-extract-pdf", "storage_path non autorizzato (cross-company)"],
    ["ai-listino-extract", "storage_path fuori scope utente"],
    ["ai-tabella-finanziamento-extract", "storage_path fuori dalla cartella company"],
  ];
  it.each(SOLO_FORMA)("%s controlla anche la forma del percorso (il prefisso da solo si aggira)", (nome, messaggioPrefisso) => {
    const s = funzione(nome);
    expect(s).toContain(`from "../_shared/storageAmmesso.ts"`);
    const g = gestore(s);
    expect(g).toContain(messaggioPrefisso); // il controllo del prefisso resta
    const forma = g.indexOf("percorsoStorageSicuro(");
    expect(forma, `${nome}: percorsoStorageSicuro`).toBeGreaterThan(-1);
    expect(forma).toBeLessThan(primo(g, LETTURE));
  });

  it("silvio-extract-pdf controlla anche il nome del bucket (lo manda solo il server, ma finisce nell'indirizzo)", () => {
    expect(gestore(funzione("silvio-extract-pdf"))).toContain("nomeBucketSicuro(bucket)");
  });
});

describe("una funzione nuova con storage_bucket dalla richiesta", () => {
  // Funzioni che nominano `storage_bucket` e non usano la regola, con il perché.
  // Una nuova va qui con il suo motivo, oppure chiama valutaFile come le altre.
  const ECCEZIONI: Record<string, string> = {
    "ai-ads-image-generate": "il bucket è una costante; storage_bucket compare solo nel risultato scritto in tabella",
    "ai-ads-video-status": "il bucket è una costante; storage_bucket compare solo nel risultato scritto in tabella",
    "document-ai-linker": "non scarica: il bucket arriva dalla riga document_analysis_results dell'azienda e serve solo a collegare",
    "email-ai-estrai-allegato": "bucket costante (allegati email), percorso dalla riga della casella dell'azienda",
    "silvio-extract-pdf": "per gli utenti il bucket è fisso; solo il server (segreto interno) lo sceglie, e ne controlla la forma",
    "silvio-kb-ingest-mega": "solo super_admin o segreto interno",
  };

  it("tutte le altre passano da storageAmmesso", () => {
    const cartella = resolve(RADICE, "supabase/functions");
    const nominano: string[] = [];
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      if (!voce.isDirectory() || voce.name.startsWith("_")) continue;
      for (const f of readdirSync(resolve(cartella, voce.name))) {
        if (!/\.(ts|mjs)$/.test(f) || /_test\.ts$|\.test\.ts$/.test(f)) continue;
        const sorgente = readFileSync(resolve(cartella, voce.name, f), "utf8");
        if (/\bstorage_bucket\b/.test(sorgente)) nominano.push(`${voce.name}/${f}`);
      }
    }
    const senzaRegola = nominano
      .filter((p) => !leggi(`supabase/functions/${p}`).includes("storageAmmesso"))
      .map((p) => p.split("/")[0])
      .sort();
    expect(senzaRegola).toEqual(Object.keys(ECCEZIONI).filter((n) => nominano.some((p) => p.startsWith(`${n}/`))).sort());
  });
});
