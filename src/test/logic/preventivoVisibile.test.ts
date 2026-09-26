/**
 * Il PDF del preventivo esce solo per chi lo può vedere (26/09/2026).
 *
 * La regola vera è la RLS di quotes, letta col token di chi chiama: qui si
 * prova che la funzione condivisa dice sì solo quando la riga torna, e che
 * generate-quote-pdf la usa col client dell'utente, prima di ogni file.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  preventivoModificabile,
  preventivoVisibile,
  type ClienteDiChiChiama,
  type ClienteRpcDiChiChiama,
} from "../../../supabase/functions/_shared/preventivoVisibile";

const cliente = (risposta: { data: unknown; error: unknown }, chiamate: string[] = []): ClienteDiChiChiama => ({
  from: (tabella) => {
    chiamate.push(`from ${tabella}`);
    return {
      select: (colonne) => {
        chiamate.push(`select ${colonne}`);
        return {
          eq: (colonna, valore) => {
            chiamate.push(`eq ${colonna}=${valore}`);
            return { maybeSingle: () => Promise.resolve(risposta) };
          },
        };
      },
    };
  },
});

describe("preventivoVisibile", () => {
  it("sì quando la RLS restituisce la riga, leggendo solo l'id di quel preventivo", async () => {
    const chiamate: string[] = [];
    expect(await preventivoVisibile(cliente({ data: { id: "q1" }, error: null }, chiamate), "q1")).toBe(true);
    expect(chiamate).toEqual(["from quotes", "select id", "eq id=q1"]);
  });

  it("no quando la RLS non la fa vedere", async () => {
    expect(await preventivoVisibile(cliente({ data: null, error: null }), "q1")).toBe(false);
  });

  it("no quando la lettura va in errore: nel dubbio il PDF non esce", async () => {
    expect(await preventivoVisibile(cliente({ data: { id: "q1" }, error: { message: "JWT expired" } }), "q1")).toBe(false);
  });

  it("no senza id, senza nemmeno chiedere", async () => {
    const chiamate: string[] = [];
    expect(await preventivoVisibile(cliente({ data: { id: "x" }, error: null }, chiamate), "")).toBe(false);
    expect(chiamate).toEqual([]);
  });
});

const clienteRpc = (risposta: { data: unknown; error: unknown }, chiamate: string[] = []): ClienteRpcDiChiChiama => ({
  rpc: (funzione, argomenti) => {
    chiamate.push(`${funzione} ${argomenti.p_quote_id}`);
    return Promise.resolve(risposta);
  },
});

describe("preventivoModificabile", () => {
  it("sì solo quando la funzione del database risponde true, per quel preventivo", async () => {
    const chiamate: string[] = [];
    expect(await preventivoModificabile(clienteRpc({ data: true, error: null }, chiamate), "q1")).toBe(true);
    expect(chiamate).toEqual(["preventivo_modificabile q1"]);
  });

  it("no quando la policy di modifica non lo permette", async () => {
    expect(await preventivoModificabile(clienteRpc({ data: false, error: null }), "q1")).toBe(false);
  });

  it("no su errore o risposta strana: nel dubbio non si manda", async () => {
    expect(await preventivoModificabile(clienteRpc({ data: true, error: { message: "permission denied" } }), "q1")).toBe(false);
    expect(await preventivoModificabile(clienteRpc({ data: "true", error: null }), "q1")).toBe(false);
    expect(await preventivoModificabile(clienteRpc({ data: null, error: null }), "q1")).toBe(false);
  });

  it("no senza id, senza nemmeno chiedere", async () => {
    const chiamate: string[] = [];
    expect(await preventivoModificabile(clienteRpc({ data: true, error: null }, chiamate), "")).toBe(false);
    expect(chiamate).toEqual([]);
  });
});

describe("generate-quote-pdf controlla il preventivo con le regole di chi chiama", () => {
  const pdf = readFileSync(join(process.cwd(), "supabase/functions/generate-quote-pdf/index.ts"), "utf8");
  const posizione = (testo: string) => {
    const i = pdf.indexOf(testo);
    expect(i, testo).toBeGreaterThan(-1);
    return i;
  };

  it("col token della richiesta e la chiave anon, non col service role", () => {
    expect(pdf).toContain('import { preventivoVisibile } from "../_shared/preventivoVisibile.ts";');
    expect(pdf).toMatch(
      /const comeChiChiama = createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, Deno\.env\.get\("SUPABASE_ANON_KEY"\)!, \{\s+global: \{ headers: \{ Authorization: req\.headers\.get\("Authorization"\) \?\? "" \} \},/,
    );
    expect(pdf).toContain("if (!(await preventivoVisibile(comeChiChiama, quote.id))) {");
  });

  it("subito dopo l'azienda e prima del PDF dei moduli, dei file e del caricamento", () => {
    const controllo = posizione("if (!(await preventivoVisibile(comeChiChiama, quote.id))) {");
    expect(posizione("await requireCompanyAccess(supabaseAdmin, userId, quote.company_id, corsH);")).toBeLessThan(controllo);
    expect(controllo).toBeLessThan(posizione('quote.source.startsWith("modulo:")'));
    expect(controllo).toBeLessThan(posizione('supabaseAdmin.storage.from("quote-materials").download(filePath)'));
    expect(controllo).toBeLessThan(posizione('.from("quote-pdfs")\n'));
  });
});
