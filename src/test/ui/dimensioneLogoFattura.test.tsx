import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import type { AnagraficaAzienda } from "@/types/fatturazione";
import { documentoHtml } from "../../../supabase/functions/generate-native-pdf/documentoHtml";
import { PGlite } from "@electric-sql/pglite";

afterEach(cleanup);
describe("logo delle fatture", () => {
  it.each([undefined, 25, 85, 100, 175, 250, Infinity])("la misura %s arriva nello stesso modo all'anteprima e al documento stampato", scala_logo => {
    const azienda = { ragione_sociale: "Impresa", logo_url: "/logo.png", scala_logo } as AnagraficaAzienda;
    const doc = { tipo: "fattura" as const, numero: "FT-1", totale_documento: 1220, imponibile_totale: 1000, iva_totale: 220 };
    const { container } = render(<PreviewFattura documento={doc} azienda={azienda} />);
    const stampato = new DOMParser().parseFromString(documentoHtml(doc, azienda), "text/html");
    const cssAnteprima = container.querySelector("style")!.textContent!;
    expect(stampato.querySelector("style")!.textContent).toContain(cssAnteprima);
    const altezza = typeof scala_logo === "number" && Number.isFinite(scala_logo) ? 22 * scala_logo / 100 : 22;
    expect(cssAnteprima).toContain(`height: ${altezza}mm;`);
    expect(container.querySelector(".fd-logo")).toHaveAttribute("src", "/logo.png");
    expect(stampato.querySelector(".fd-logo")?.getAttribute("src")).toBe("/logo.png");
  });
  it("la migrazione conserva i dati, dà 100% ai documenti precedenti e salva solo misure valide", async () => {
    const db = new PGlite();
    try {
      await db.exec("create table public.anagrafica_azienda (id int primary key, ragione_sociale text); insert into public.anagrafica_azienda values (1, 'Impresa esistente');");
      const sql = readFileSync(path.resolve("supabase/migrations/20290421130000_dimensione_logo_fatture.sql"), "utf8");
      await db.exec(`begin; ${sql} commit;`);
      expect((await db.query("select * from public.anagrafica_azienda")).rows).toEqual([{ id: 1, ragione_sociale: "Impresa esistente", scala_logo: 100 }]);
      await db.exec("update public.anagrafica_azienda set scala_logo = 175 where id = 1;");
      expect((await db.query("select scala_logo from public.anagrafica_azienda where id = 1")).rows).toEqual([{ scala_logo: 175 }]);
      await expect(db.exec("update public.anagrafica_azienda set scala_logo = 0;")).rejects.toThrow(/check constraint/);
      await expect(db.exec("update public.anagrafica_azienda set scala_logo = 251;")).rejects.toThrow(/check constraint/);
      // Rilanciare la migrazione non azzera la preferenza già salvata.
      await db.exec(`begin; ${sql} commit;`);
      expect((await db.query("select scala_logo from public.anagrafica_azienda where id = 1")).rows).toEqual([{ scala_logo: 175 }]);
    } finally { await db.close(); }
  }, 15000);
});
