import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { erroreStatoFirma } from "../../../supabase/functions/_shared/statoFirma";
import { TOKEN_RIPRESA_BACKUP } from "../../../supabase/functions/_shared/backupBlocchi";
import { pianoDellaProva } from "../../../supabase/functions/_shared/ripristinoBlocchi";

function caricaFile(file: string, fine: string, contesto: Record<string, unknown>) {
  const sorgente = readFileSync(file, "utf8").replace(/^import\s+[^;]+;\n/gm, "");
  const js = ts.transpileModule(sorgente + "\n" + fine, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(js, contesto);
}

describe("firme congiunte e backup ripetuti", () => {
  it("se la chiusura del gruppo fallisce, la firma resta ripetibile e non si annuncia il completamento", async () => {
    let handler!: (input: Request) => Promise<Response>;
    const sig = {
      id: "richiesta", status: "otp_verified", expires_at: "2099-01-01T00:00:00Z",
      gruppo_firma_id: "gruppo", signer_name: "Giulia", tipo_firmatario: "b2b",
      sessione_firma_hash: "hash",
    };
    const audit = vi.fn();
    function from(tabella: string) {
      const query = {
        update: (valori: Partial<typeof sig>) => { if (tabella === "signature_requests") Object.assign(sig, valori); return query; },
        select: () => query, in: () => query, eq: () => query, gt: () => query,
        order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: { ...sig } }),
        insert: audit,
      };
      return query;
    }
    const operazione = vi.fn().mockResolvedValueOnce({ error: { code: "XX000" } })
      .mockImplementationOnce(async () => {
        sig.status = "signed";
        return { data: { completo: true, chiude: true, firmati: 2, richiesti: 2, nomi: "Giulia e Paolo" } };
      });
    const rpc = vi.fn(() => ({ maybeSingle: operazione }));
    caricaFile("supabase/functions/fea-completa-firma/index.ts", "", {
      Request, Response,
      console: { error: vi.fn(), warn: vi.fn() },
      Deno: { env: { get: () => "locale" }, serve: (fn: typeof handler) => { handler = fn; } },
      createClient: () => ({ from, rpc }),
      getCorsHeaders: () => ({}), variantiTokenFirma: () => ["token"], ipDellaRichiesta: (): null => null,
      erroreStatoFirma, missingCampoDocument: () => false, controllaSessioneFirma: async () => true,
      clausoleDellaFirma: async (): Promise<[]> => [], informativaPrivacyDellaFirma: async (): Promise<null> => null,
      assicuraPdfFirmato: async () => { throw new Error("PDF simulato"); },
      conservaProveFirma: async () => {}, brandingFirma: async () => ({}),
      getBrandingForCompany: async () => ({}), titoloDelDocumento: async () => "",
    });
    const chiama = () => handler(new Request("https://example.invalid/firma", { method: "POST", body: "{}" }));
    const primo = await chiama();
    const dopoErrore = sig.status;
    const secondo = await chiama();
    expect({ primo: primo.status, dopoErrore, secondo: secondo.status }).toEqual({
      primo: 503, dopoErrore: "otp_verified", secondo: 200,
    });
    expect(await secondo.json()).toMatchObject({ completo: true, firmati: 2 });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fea_registra_firma_congiunta", expect.objectContaining({ p_richiesta: sig.id }));
  });

  it("se manca capienza per la variante, la firma non è annunciata né salvata separatamente", async () => {
    let handler!: (input: Request) => Promise<Response>;
    const richiesta = {
      id: "richiesta-odv", status: "otp_verified", expires_at: "2099-01-01T00:00:00Z",
      tipo_documento: "odv", odv_id: "variante", tipo_firmatario: "b2b", sessione_firma_hash: "hash",
    };
    const scritturaSeparata = vi.fn();
    const audit = vi.fn();
    const pdf = vi.fn();
    const rpc = vi.fn(async () => ({ data: null, error: { code: "PVA01" } }));
    const from = (tabella: string) => {
      const query = {
        select: () => query, in: () => query, eq: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: tabella === "ordini_variazione" ? { status: "in_attesa" } : richiesta }),
        update: scritturaSeparata, insert: audit,
      };
      return query;
    };
    caricaFile("supabase/functions/fea-completa-firma/index.ts", "", {
      Request, Response, console,
      Deno: { env: { get: () => "locale" }, serve: (fn: typeof handler) => { handler = fn; } },
      createClient: () => ({ from, rpc }),
      getCorsHeaders: () => ({}), variantiTokenFirma: () => ["token"], ipDellaRichiesta: (): null => null,
      erroreStatoFirma, missingCampoDocument: () => false, controllaSessioneFirma: async () => true,
      clausoleDellaFirma: async (): Promise<[]> => [], informativaPrivacyDellaFirma: async (): Promise<null> => null,
      assicuraPdfFirmato: pdf,
    });
    const res = await handler(new Request("http://localhost/firma", { method: "POST", body: "{}" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("residuo del contratto") });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("fea_registra_firma_variante", expect.objectContaining({
      p_richiesta: richiesta.id, p_sessione_hash: richiesta.sessione_firma_hash,
    }));
    expect(scritturaSeparata).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(pdf).not.toHaveBeenCalled();
  });

  it("preserva l'indice e i blocchi completi mentre un nuovo backup si interrompe e poi riparte", async () => {
    const azienda = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const giorno = new Date().toISOString().slice(0, 10);
    const base = `${azienda}/${giorno}`;
    const bloccoVecchio = `${base}/orders/001.json`;
    const indiceVecchio = `${base}/indice.json`;
    const originali = new Map<string, string>([
      [`${base}/azienda.json`, JSON.stringify({ id: azienda, name: "Versione precedente" })],
      [bloccoVecchio, JSON.stringify({ n: 1, righe: [{ id: "vecchio" }], finito: true })],
      [indiceVecchio, JSON.stringify({
        azienda: { id: azienda }, completo: true, a_blocchi: true,
        tabelle: [{ tabella: "orders", file: [bloccoVecchio], righe_salvate: 1 }],
      })],
    ]);
    const oggetti = new Map(originali);
    let erroreIndice = true;
    let mode: "interrotto" | "continua" | "chiude" = "interrotto";
    let esegui!: (admin: unknown, dati: unknown, riprendi?: string) => Promise<Record<string, unknown>>;
    let tokenRipresa!: (indice: Record<string, unknown>) => string | null;
    const admin = {
      rpc: async () => ({ data: [{ tabella: "orders", righe: mode === "interrotto" ? 1 : 2 }] }),
      storage: { from: () => ({
        download: async (path: string) => ({ data: oggetti.has(path) ? new Blob([oggetti.get(path)!]) : null }),
        upload: async (path: string, blob: Blob, opzioni: { upsert: boolean }) => {
          if (path.endsWith("/indice.json") && erroreIndice) return { error: { message: "interruzione su indice" } };
          const testo = await blob.text();
          if (!opzioni.upsert && oggetti.has(path)) return { error: { message: "esiste già" } };
          oggetti.set(path, testo);
          return { error: null };
        },
      }) },
    };
    caricaFile("supabase/functions/company-backup/index.ts", "porta(backupABlocchi, tokenDaRiprendere);", {
      Blob, Response, TOKEN_RIPRESA_BACKUP, crypto: { randomUUID }, console: { error: vi.fn(), warn: vi.fn() },
      Deno: { env: { get: () => "locale" } },
      serveConMetricheRapida: () => {}, BLOCCO_INIZIALE: 500, BLOCCO_MASSIMO: 500,
      TETTO_TESTO_PER_CHIAMATA: 100, MASSIMO_CHIAMATE: 8,
      prossimoLimite: (x: number) => x, limiteDopoErrore: (): null => null,
      fetch: async () => {
        const filiera = mode === "continua";
        return new Response(JSON.stringify({
          n: 1, righe: [{ id: filiera ? "nuovo-1" : "nuovo-2", testo: "a".repeat(120) }],
          finito: !filiera, ultimo: filiera ? "nuovo-1" : null,
        }));
      },
      porta: (fn: typeof esegui, ripresa: typeof tokenRipresa) => { esegui = fn; tokenRipresa = ripresa; },
    });
    const dati = { id: azienda, name: "Versione nuova" };
    await expect(esegui(admin, dati)).rejects.toThrow("interruzione su indice");
    expect([...originali].map(([k]) => oggetti.get(k))).toEqual([...originali.values()]);
    erroreIndice = false;
    mode = "continua";
    const fermo = await esegui(admin, dati);
    expect(fermo.completo).toBe(false);
    const ripresa = tokenRipresa(fermo);
    expect(ripresa).toBeTruthy();
    mode = "chiude";
    const [finito, ripetuto] = await Promise.all([esegui(admin, dati, ripresa!), esegui(admin, dati, ripresa!)]);
    expect(finito.completo).toBe(true);
    expect(ripetuto).toEqual(finito);
    expect(await esegui(admin, dati, ripresa!)).toEqual(finito);
    const nuovo = [...oggetti.keys()].find((k) => k.endsWith("/indice.json") && k !== indiceVecchio)!;
    const piano = pianoDellaProva(finito, nuovo);
    expect(piano.ok).toBe(true);
    if (piano.ok === false) throw new Error(piano.errore);
    expect(piano.piano.map((x) => JSON.parse(oggetti.get(x.file)!))).toMatchObject([
      dati, { righe: [{ id: "nuovo-1" }] }, { righe: [{ id: "nuovo-2" }] },
    ]);
  });
});
