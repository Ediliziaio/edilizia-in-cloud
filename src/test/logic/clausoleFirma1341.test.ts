/**
 * Seconda firma (art. 1341 c.c.) per ogni firmatario di un contratto, non solo i
 * privati, e il server la pretende.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clausoleDellaFirma } from "../../../supabase/functions/_shared/clausoleFirma";

type Righe = Record<string, Record<string, unknown> | null>;
// Finto client: .from(t).select().eq().eq().maybeSingle() → la riga di quella tabella.
function finto(righe: Righe) {
  return {
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({ data: righe[t] ?? null });
      return q;
    },
  };
}
const base: { company_id: string; quote_id: string; fv_progetto_id: string | null } = {
  company_id: "c1", quote_id: "q1", fv_progetto_id: null,
};

describe("clausole da approvare a parte", () => {
  it("un'azienda (b2b) che firma un preventivo di modulo approva le clausole del settore", async () => {
    const c = await clausoleDellaFirma(finto({ quotes: { source: "modulo:sr:0afd020b-0f5e-3fff-84f0-4f51a853acd4" } }), {
      ...base, tipo_documento: "quote", tipo_firmatario: "b2b",
    });
    expect(c.length).toBeGreaterThan(3);
    expect(c[0].id).toBe("std-1");
    expect(c.some((x) => /Pagamenti/.test(x.testo))).toBe(true);
  });

  it("il fotovoltaico e il preventivo generico le hanno, per privati e aziende", async () => {
    for (const tipo_firmatario of ["b2b", "b2c"]) {
      const fv = await clausoleDellaFirma(finto({}), { company_id: "c1", tipo_documento: "fv", tipo_firmatario, fv_progetto_id: "f1" });
      const generico = await clausoleDellaFirma(finto({ quotes: { source: null } }), { ...base, tipo_documento: "quote", tipo_firmatario });
      expect(fv.length).toBeGreaterThan(0);
      expect(generico.length).toBeGreaterThan(0);
    }
  });

  it("le clausole scritte dall'azienda hanno la precedenza", async () => {
    const c = await clausoleDellaFirma(
      finto({ fea_configurazione: { clausole_vess: [{ id: "a", testo: "Penale del 10%" }, { id: "", testo: "senza id" }] } }),
      { ...base, tipo_documento: "quote", tipo_firmatario: "b2b" },
    );
    expect(c).toEqual([{ id: "a", testo: "Penale del 10%" }]);
  });

  it("ordini e verbali non sono contratti: niente clausole per un'azienda", async () => {
    for (const tipo_documento of ["order", "odv", "sessione"]) {
      expect(await clausoleDellaFirma(finto({}), { company_id: "c1", tipo_documento, tipo_firmatario: "b2b" })).toEqual([]);
    }
  });

  it("il server rifiuta la firma se manca un'approvazione, e la pagina le chiede a tutti", () => {
    const srv = readFileSync(resolve(process.cwd(), "supabase/functions/fea-completa-firma/index.ts"), "utf8");
    expect(srv).toContain("clausoleDellaFirma(supabaseAdmin, sigReq)");
    expect(srv).toContain("approva ogni clausola specifica");
    const pag = readFileSync(resolve(process.cwd(), "src/pages/public/FirmaDocumento.tsx"), "utf8");
    expect(pag).toContain("clausole_approvate: clausoleApprovate");
    expect(pag).toContain("clausoleDaApprovare(sessione).length > 0 ? 'b2c_clausole' : 'firma'");
  });
});
