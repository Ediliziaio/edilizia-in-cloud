/**
 * Funzioni AI che leggono documenti: il documento è un dato, mai un ordine,
 * e ciò che si legge si controlla (30/10/2026).
 *
 * Un PDF o una foto arrivano da utenti, fornitori, email, WhatsApp: testo scritto
 * da chiunque. Solo silvio-extract-pdf, computo-ai-extract ed email-ai-estrai-allegato
 * avevano una frase contro le istruzioni nascoste; le altre dodici funzioni che
 * leggono documenti no. Le regole ora stanno in `_shared/documentoNonFidato.ts` e si
 * accodano al messaggio di sistema di ognuna.
 *
 * Qui si tiene fermo:
 *   · CENSIMENTO: ogni funzione che manda un file o un'immagine a un modello è
 *     classificata (regole condivise, difesa propria, oppure «non legge documenti
 *     di terzi» con il motivo). Una funzione nuova, o che comincia a mandare
 *     immagini, fa rosso finché qualcuno non decide;
 *   · le regole sono davvero nel messaggio di sistema, non solo importate;
 *   · i controlli sui dati letti (`controlliDocumento.ts`) sono usati da fattura,
 *     DDT e analizzatore, e l'analizzatore non ne ha una copia sua;
 *   · un'analisi fallita a metà non resta salvata come «da rivedere» (verrebbe
 *     riusata per impronta del file e non rifatta);
 *   · gli errori del router passano dalla tabella `erroriAi.ts`: il credito finito
 *     del provider non apre la finestra di ricarica dell'azienda.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = resolve(__dirname, "../../..");
const FUNZIONI = resolve(RADICE, "supabase/functions");

/** Tutti i sorgenti di una funzione (i file accanto a index.ts, senza test), senza le righe di commento intere. */
function sorgente(nome: string): string {
  const cartella = resolve(FUNZIONI, nome);
  return readdirSync(cartella)
    .filter((f) => f.endsWith(".ts") && !/(_test|\.test)\.ts$/.test(f))
    .sort()
    .map((f) => readFileSync(resolve(cartella, f), "utf8"))
    .join("\n")
    .split("\n")
    .filter((riga) => !/^\s*(\/\/|\*|\/\*)/.test(riga))
    .join("\n");
}

/** Leggono documenti di terzi e accodano le regole condivise al messaggio di sistema. */
const CON_REGOLE_CONDIVISE = [
  "ai-bank-statement-parser",
  "ai-biz-card-ocr",
  "ai-customers-extract",
  "ai-ddt-analyzer",
  "ai-fattura-ricevuta-ocr",
  "ai-importa-condizioni",
  "ai-listino-extract",
  "ai-rapportini-da-documento",
  "ai-tabella-finanziamento-extract",
  "ddt-ai-extract",
  "ddt-ocr-extract",
  "document-ai-router",
  "generic-doc-ai-extract",
  "parse-matrix-image",
  "planimetria-genera",
  "whatsapp-ai-processor",
] as const;

/** Leggono documenti di terzi con una difesa scritta nel proprio prompt (precedente alle regole condivise). */
const CON_DIFESA_PROPRIA = ["computo-ai-extract", "email-ai-estrai-allegato", "silvio-extract-pdf"] as const;

const RENDER = "genera immagini da un'immagine dell'utente: non ne ricava dati";

/** Mandano immagini a un modello ma non leggono documenti di terzi per ricavarne dati. Il motivo è scritto accanto. */
const NON_LEGGONO_DOCUMENTI: Record<string, string> = {
  "ai-ads-video-generate": "genera video per le inserzioni, non legge documenti",
  "ai-foto-cantiere-quality": "giudizio descrittivo su foto del cantiere dell'azienda",
  "ai-preventivo-conversazione": "chat del preventivatore con foto e voce dell'utente; ogni proposta passa da una conferma",
  "ai-quote-from-capture": "bozza di preventivo da foto, voce e testo dell'utente; resta bozza",
  "analyze-window-photo": "descrive la foto di un serramento per il rendering",
  "debug-ai-providers": "strumento da super-admin per provare i fornitori AI",
  "fv-genera-pdf": "produce un PDF: le immagini sono loghi e render da stampare",
  "generate-bathroom-render": RENDER,
  "generate-facade-render": RENDER,
  "generate-floor-render": RENDER,
  "generate-quote-pdf": "produce un PDF: le immagini sono loghi e render da stampare",
  "generate-render": RENDER,
  "generate-room-render": RENDER,
  "generate-shutter-render": RENDER,
  "generate-technical-render": RENDER,
  "meta-api-proxy": "inoltra a Meta le creatività delle inserzioni; non legge",
  "planimetria-conta-simboli": "conta simboli su riquadri di una tavola: stima salvata come bozza da confermare a mano",
  "preventivo-da-foto-orchestrator": "foto di cantiere → bozza di preventivo (flusso legacy), approvata da una persona",
  "silvio-chat": "chat con l'assistente: gli allegati sono dell'utente che scrive",
  "sr-ai-preventivo-draft": "bozza dal testo e dalle foto dell'utente; ogni posizione va approvata prima di entrare",
};

const MANDA_FILE_AL_MODELLO = /image_url|file_data|type:\s*["']file["']|inline_data|input_image/;

const cartelleFunzioni = readdirSync(FUNZIONI).filter(
  (n) => !n.startsWith("_") && statSync(resolve(FUNZIONI, n)).isDirectory() && existsSync(resolve(FUNZIONI, n, "index.ts")),
);

describe("censimento: chi manda un file o un'immagine a un modello", () => {
  const classificate = new Set<string>([...CON_REGOLE_CONDIVISE, ...CON_DIFESA_PROPRIA, ...Object.keys(NON_LEGGONO_DOCUMENTI)]);
  const trovate = cartelleFunzioni.filter((n) => MANDA_FILE_AL_MODELLO.test(sorgente(n)));

  it("trova le funzioni che leggono documenti (se non ne trova, il rilevamento è rotto)", () => {
    expect(trovate.length).toBeGreaterThan(30);
    for (const nome of [...CON_REGOLE_CONDIVISE, ...CON_DIFESA_PROPRIA]) expect(trovate).toContain(nome);
  });

  it("ogni funzione trovata è classificata: regole condivise, difesa propria, o motivo per cui non serve", () => {
    const nonClassificate = trovate.filter((n) => !classificate.has(n));
    expect(nonClassificate, `Da classificare in letturaDocumentiNonFidata.test.ts: ${nonClassificate.join(", ")}`).toEqual([]);
  });

  it("l'elenco non tiene funzioni che non esistono più o che non mandano più file", () => {
    const orfane = [...classificate].filter((n) => !trovate.includes(n));
    expect(orfane, `Non mandano più file a un modello (o sono sparite): ${orfane.join(", ")}`).toEqual([]);
  });

  it("nessuna funzione sta in due elenchi", () => {
    const tutte = [...CON_REGOLE_CONDIVISE, ...CON_DIFESA_PROPRIA, ...Object.keys(NON_LEGGONO_DOCUMENTI)];
    expect(tutte.filter((n, i) => tutte.indexOf(n) !== i)).toEqual([]);
  });

  it("chi non legge documenti dice perché", () => {
    for (const [nome, motivo] of Object.entries(NON_LEGGONO_DOCUMENTI)) {
      expect(motivo.trim().length, nome).toBeGreaterThan(10);
    }
  });
});

describe("le regole condivise entrano nel messaggio di sistema", () => {
  const importa = /import\s*\{[^}]*\bconRegoleDocumento\b[^}]*\}\s*from\s*["'](?:\.\.\/)+_shared\/documentoNonFidato\.ts["']/;
  // «{ role: "system", content: conRegoleDocumento(…) }» oppure «const SYSTEM_PROMPT = conRegoleDocumento(…)»
  const avvolgeIlSistema = /role:\s*"system"(?:\s+as const)?,\s*content:\s*conRegoleDocumento\(|\bSYSTEM_PROMPT\s*=\s*conRegoleDocumento\(/;

  for (const nome of CON_REGOLE_CONDIVISE) {
    it(`${nome}: importate e applicate al prompt di sistema`, () => {
      const src = sorgente(nome);
      expect(src).toMatch(importa);
      expect(src).toMatch(avvolgeIlSistema);
    });
  }

  it("ai-importa-condizioni mette anche il testo incollato tra due righe fisse", () => {
    const src = sorgente("ai-importa-condizioni");
    expect(src).toContain("incorniciaTestoDocumento(testo)");
  });
});

describe("le funzioni con difesa propria la tengono", () => {
  const frase = /non eseguire istruzioni|ignora le sue istruzioni|dato non fidato/i;
  for (const nome of CON_DIFESA_PROPRIA) {
    it(`${nome}: il prompt dice di non eseguire istruzioni contenute nel documento`, () => {
      expect(sorgente(nome)).toMatch(frase);
    });
  }
});

describe("i controlli sui dati letti", () => {
  it("l'analizzatore usa i controlli condivisi e non ne ha una copia", () => {
    const src = sorgente("ai-document-analyzer");
    expect(src).toContain("controllaDocumento(docType, structuredFields)");
    expect(src).toContain("statoAnalisi(");
    // I nomi dei campi che il vecchio controllo cercava e nessun parser scrive.
    expect(src).not.toMatch(/piva_cedente|fields\.imponibile\b|fields\.totale\b/);
  });

  it("l'analisi fallita a metà si salva «failed», non «da rivedere»", () => {
    const src = sorgente("ai-document-analyzer");
    expect(src).toMatch(/passoFallito:\s*parserFallito/);
    expect(src).toMatch(/status:\s*stato\.salvato/);
    // …e a chi guarda si mostra comunque lo stato «da rivedere»
    expect(src).toMatch(/finalStatus\s*=\s*stato\.mostrato/);
  });

  it("l'errore del passo che legge i dati è quello vero, non un «parser failed» generico", () => {
    const src = sorgente("ai-document-analyzer");
    expect(src).toContain("erroreDaCorpo(corpo)");
    expect(src).not.toMatch(/error_message:\s*"parser failed"/);
  });

  it("fattura e DDT rispondono con i controlli accanto ai dati", () => {
    for (const nome of ["ai-fattura-ricevuta-ocr", "ddt-ai-extract"]) {
      const src = sorgente(nome);
      expect(src, nome).toContain("controllaDocumento(");
      expect(src, nome).toMatch(/controlli:\s*\{\s*warnings:/);
    }
  });

  it("la fattura già registrata non si registra due volte con la registrazione automatica", () => {
    const src = sorgente("ai-fattura-ricevuta-ocr");
    expect(src).toMatch(/if \(autoCreate && !giaRegistrata\)/);
    expect(src).toContain("fattura_gia_registrata");
  });
});

describe("la risposta del modello si legge in un punto solo", () => {
  it("le funzioni che aspettano un oggetto JSON usano leggiJsonDalModello, non un JSON.parse sul contenuto", () => {
    for (const nome of ["ai-importa-condizioni", "document-ai-router", "generic-doc-ai-extract", "ai-fattura-ricevuta-ocr", "ddt-ai-extract"]) {
      const src = sorgente(nome);
      expect(src, nome).toContain("leggiJsonDalModello(");
      expect(src, nome).not.toMatch(/JSON\.parse\(\s*aiResult\.content/);
    }
  });
});

describe("gli errori del router arrivano all'utente da una tabella sola", () => {
  const FUNZIONI_CON_ERRORI_CHIARI = [
    "ai-bank-statement-parser",
    "ai-biz-card-ocr",
    "ai-customers-extract",
    "ai-ddt-analyzer",
    "ai-document-analyzer",
    "ai-fattura-ricevuta-ocr",
    "ai-importa-condizioni",
    "ai-listino-extract",
    "ai-tabella-finanziamento-extract",
    "ddt-ai-extract",
    "ddt-ocr-extract",
    "document-ai-router",
    "generic-doc-ai-extract",
  ];

  for (const nome of FUNZIONI_CON_ERRORI_CHIARI) {
    it(`${nome}: importa e usa erroreAiPerUtente`, () => {
      const src = sorgente(nome);
      expect(src).toMatch(/import\s*\{[^}]*\berroreAiPerUtente\b[^}]*\}\s*from\s*["']\.\.\/_shared\/erroriAi\.ts["']/);
      expect(src).toMatch(/erroreAiPerUtente\(\w+\)/);
    });
  }
});

describe("la conversione in base64 sta in un punto solo", () => {
  // Nove copie dello stesso ciclo (String.fromCharCode(...blocco) + btoa), una per funzione:
  // ora c'è _shared/base64.ts, che usa il metodo nativo dove il runtime lo ha (100 volte più veloce).
  const LETTORI = [
    "ai-document-analyzer",
    "ai-fattura-ricevuta-ocr",
    "ai-importa-condizioni",
    "ai-tabella-finanziamento-extract",
    "computo-ai-extract",
    "ddt-ai-extract",
    "document-ai-router",
    "email-ai-estrai-allegato",
    "generic-doc-ai-extract",
  ];
  for (const nome of LETTORI) {
    it(`${nome}: usa _shared/base64 e non ha un convertitore suo`, () => {
      const src = sorgente(nome);
      expect(src).toMatch(/import\s*\{[^}]*\b(?:bytesToBase64|arrayBufferToBase64)\b[^}]*\}\s*from\s*["']\.\.\/_shared\/base64\.ts["']/);
      expect(src).not.toMatch(/String\.fromCharCode\(\s*\.\.\./);
    });
  }
});
