import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { leggiPdfVincolato } from "../../../supabase/functions/generate-quote-pdf/pdfVincolato";

function leggiTra(file: string, inizio: string, fine: string) {
  const sorgente = readFileSync(file, "utf8");
  const da = sorgente.indexOf(inizio);
  const a = sorgente.indexOf(fine, da + inizio.length);
  if (da < 0 || a < 0) throw new Error(`Sorgente non trovato in ${file}`);
  return sorgente.slice(da, a);
}

function carica(sorgente: string, globale: Record<string, unknown>) {
  const js = ts.transpileModule(sorgente, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(js, globale);
}

function queryConEsito(data: unknown, error?: Error) {
  const esito = typeof data === "function" ? data : () => data;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    in: vi.fn(() => query),
    gt: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    delete: vi.fn(() => query),
    update: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: esito(), error })),
  };
  return query;
}

describe("copie PDF in firma", () => {
  const quote = { id: "q", company_id: "azienda", pdf_storage_path: null as string | null, signed_at: "2026-11-20" };

  it("legge l'originale firmato anche con la voce PDF del preventivo assente", async () => {
    const query = queryConEsito({ documento_path: "azienda/congelato.pdf", signed_pdf_path: "azienda/firmato.pdf" });
    const link = vi.fn(async () => ({ data: { signedUrl: "https://example.invalid/firmato" } }));
    const client = { from: () => query, storage: { from: () => ({ createSignedUrl: link }) } };
    expect(await leggiPdfVincolato(client as never, quote)).toMatchObject({
      gia_firmato: true, pdf_path: "azienda/firmato.pdf",
    });
    expect(link).toHaveBeenCalledWith("azienda/firmato.pdf", 3600);
    expect(query.eq).toHaveBeenCalledWith("company_id", "azienda");
  });

  it("mantiene vincolato il PDF quando il file o lo stato sono indisponibili", async () => {
    const link = vi.fn(async () => ({ data: null, error: new Error("Storage non raggiungibile") }));
    const admin = (query: ReturnType<typeof queryConEsito>) => ({
      from: () => query, storage: { from: () => ({ createSignedUrl: link }) },
    });
    expect(await leggiPdfVincolato(admin(queryConEsito({ documento_path: "azienda/originale.pdf" })) as never, quote))
      .toMatchObject({ stato: 503 });
    expect(await leggiPdfVincolato(admin(queryConEsito(null, new Error("rete"))) as never, { ...quote, signed_at: null }))
      .toMatchObject({ stato: 503 });
    expect(await leggiPdfVincolato(admin(queryConEsito(null)) as never, quote)).toMatchObject({ stato: 409 });
    expect(await leggiPdfVincolato(admin(queryConEsito(null)) as never, { ...quote, signed_at: null })).toBeNull();
  });
});

describe("originali dei documenti aziendali e del personale", () => {
  const fonte = leggiTra("src/hooks/useDocumentiAzienda.ts", "async function collegaFileDocumento(", "/** Link temporaneo");
  const originale = { id: "d", file_path: "azienda/vecchio.pdf", updated_at: "2026-11-20T09:00:00Z" };
  const caricato = { path: "azienda/nuovo.pdf", name: "nuovo.pdf" };

  function provaCollegamento(data: unknown, problema?: Error) {
    const query = queryConEsito(data, problema);
    const rimuoviFileDocumento = vi.fn(async (_path: string) => {});
    const collega = carica(fonte + "\ncollegaFileDocumento", {
      db: { from: () => query }, rimuoviFileDocumento,
    });
    const esito = collega("azienda", originale, caricato);
    return { esito, query, rimuoviFileDocumento };
  }

  it("conserva il file storico se il documento è stato rinnovato durante l'upload", async () => {
    const { esito, query, rimuoviFileDocumento } = provaCollegamento(null);
    await expect(esito).rejects.toThrow("rinnovato");
    expect(query.is).toHaveBeenCalledWith("archiviato_il", null);
    expect(query.eq).toHaveBeenCalledWith("updated_at", originale.updated_at);
    expect(rimuoviFileDocumento.mock.calls).toEqual([[caricato.path]]);
  });

  it("con risposta persa conserva entrambe le copie finché il riferimento è incerto", async () => {
    const { esito, rimuoviFileDocumento } = provaCollegamento(null, new Error("rete"));
    await expect(esito).rejects.toThrow("rete");
    expect(rimuoviFileDocumento).not.toHaveBeenCalled();
  });

  it("rimuove solo il vecchio file dopo il collegamento confermato", async () => {
    const { esito, rimuoviFileDocumento } = provaCollegamento({ id: originale.id });
    await esito;
    expect(rimuoviFileDocumento.mock.calls).toEqual([[originale.file_path]]);
  });

  it("mantiene il file del personale quando il database non conferma la cancellazione", async () => {
    const parte = leggiTra("src/components/employees/EmployeeAttachments.tsx", "const deleteMutation = useMutation({", "    onSuccess: (fileRimosso)");
    const esegui = async (data: unknown, error?: Error) => {
      const query = queryConEsito(data, error);
      const remove = vi.fn(async (files: string[]) => ({ files }));
      const mutazione = carica(parte + "\n});\ndeleteMutation", {
        useMutation: (x: unknown) => x,
        supabase: { from: () => query, storage: { from: () => ({ remove }) } },
        employee: { id: "dipendente" },
        getStoragePath: (x: string) => x,
      });
      const esito = mutazione.mutationFn({ id: "allegato", file_url: originale.file_path });
      return { esito, remove };
    };

    const negata = await esegui(null, new Error("Non puoi eliminare questo documento"));
    await expect(negata.esito).rejects.toThrow("Non puoi");
    expect(negata.remove).not.toHaveBeenCalled();
    const ignorata = await esegui(null);
    await expect(ignorata.esito).rejects.toThrow("non è stata confermata");
    expect(ignorata.remove).not.toHaveBeenCalled();
    const riuscita = await esegui({ id: "allegato" });
    await expect(riuscita.esito).resolves.toBe(true);
    expect(riuscita.remove).toHaveBeenCalledWith([originale.file_path]);
  });
});

it("rinnova alla fine del mese di destinazione", () => {
  const file = "src/pages/azienda/settings/SettingsDocumentiAzienda.tsx";
  const sorgente = leggiTra(file, "function dataISO(", "const OGGI") +
    leggiTra(file, "function scadenzaDaRinnovo(", "/**") + "\nscadenzaDaRinnovo";
  const calcola = carica(sorgente, {});
  expect(calcola("2026-01-31", 3)).toBe("2026-04-30");
  expect(calcola("2028-01-31", 1)).toBe("2028-02-29");
  expect(calcola("2026-12-15", 1)).toBe("2027-01-15");
});
