/**
 * «Genera dal computo» (14/11/2026): le voci rivedute diventano il computo della
 * commessa, e lo stesso file caricato una seconda volta non crea un doppione.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { improntaVoci, rigaDaVoce } from "@/lib/computo/computoDaVoci";
import type { VoceImportata } from "@/lib/computo/importaVoci";
import { voceVuota } from "@/lib/computo/editorNativo";

/** Un database finto: ricorda i computi salvati e la loro impronta. */
const db = vi.hoisted(() => ({
  uploads: [] as { id: string; order_id: string; stato: string; raw_extracted_json: { impronta: string } }[],
  voci: [] as Record<string, unknown>[],
  misure: [] as Record<string, unknown>[],
  file: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const tabella = (nome: string) => {
    const filtri: Record<string, unknown> = {};
    let inserite: Record<string, unknown>[] | null = null;
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (c: string, v: unknown) => { filtri[c] = v; return q; };
    q.neq = (c: string, v: unknown) => { filtri[`!${c}`] = v; return q; };
    q.limit = () => q;
    q.update = () => q;
    q.delete = () => q;
    q.insert = (righe: Record<string, unknown> | Record<string, unknown>[]) => {
      const elenco = Array.isArray(righe) ? righe : [righe];
      inserite = elenco.map((r, i) => ({ id: `${nome}-${(nome === "computo_uploads" ? db.uploads : nome === "computo_voci_estratte" ? db.voci : db.misure).length + i + 1}`, ...r }));
      if (nome === "computo_uploads") db.uploads.push(...(inserite as never[]));
      else if (nome === "computo_voci_estratte") db.voci.push(...inserite);
      else db.misure.push(...inserite);
      return q;
    };
    q.single = () => Promise.resolve({ data: inserite?.[0] ?? null, error: null });
    q.then = (ok: (v: unknown) => unknown) => {
      if (inserite) return Promise.resolve({ data: inserite, error: null }).then(ok);
      const trovati = db.uploads.filter((u) => u.order_id === filtri.order_id && u.stato !== filtri["!stato"]
        && u.raw_extracted_json.impronta === filtri["raw_extracted_json->>impronta"]);
      return Promise.resolve({ data: trovati, error: null }).then(ok);
    };
    return q;
  };
  return {
    supabase: {
      from: tabella,
      storage: { from: () => ({ upload: (p: string) => { db.file.push(p); return Promise.resolve({ error: null }); } }) },
    },
  };
});

import { useSalvaComputoImportato } from "@/hooks/useComputoCommessa";

const voce = (p: Partial<VoceImportata>): VoceImportata => ({ ...voceVuota(), avvisi: [], origine: "prova.csv", ...p } as VoceImportata);
const VOCI = [
  voce({ id: "a", capitolo: "Opere murarie", tariffa: "01.A10", descrizione: "Intonaco civile\nspessore 2 cm", unita: "mq", quantita: "100", prezzo: "24" }),
  voce({ id: "b", capitolo: "Bagni", descrizione: "Fornitura e posa in opera di piatto doccia", unita: "cad", quantita: "2", prezzo: "300",
    misure: [{ id: "m1", descrizione: "Bagno 1", parti: "1", lunghezza: "", larghezza: "", altezza: "", formula: "" }, { id: "m2", descrizione: "Bagno 2", parti: "1", lunghezza: "", larghezza: "", altezza: "", formula: "" }] }),
];

const wrapper = ({ children }: { children: ReactNode }) =>
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

beforeEach(() => { db.uploads = []; db.voci = []; db.misure = []; db.file = []; });

describe("computo dalle voci importate", () => {
  it("le righe del computo della commessa: codici, capitolo, misure", () => {
    const { voce: r, misure } = rigaDaVoce(VOCI[0], 0);
    expect(r).toMatchObject({ codice_prezzario: "01.A10", descrizione_breve: "Intonaco civile", descrizione_estesa: "spessore 2 cm", unita_misura: "mq", quantita: 100, importo_computo: 2400, super_categoria: "Opere murarie" });
    expect(misure).toEqual([]);
    expect(rigaDaVoce(VOCI[1], 1).misure.map((m) => m.quantita)).toEqual([1, 1]);
  });

  it("l'impronta è la stessa per le stesse voci e cambia se una voce cambia", () => {
    expect(improntaVoci(VOCI)).toBe(improntaVoci(VOCI.map((v) => ({ ...v, id: `${v.id}-bis` }))));
    expect(improntaVoci(VOCI)).not.toBe(improntaVoci([{ ...VOCI[0], quantita: "101" }, VOCI[1]]));
  });

  it("al secondo import dello stesso file riusa il computo: nessun doppione", async () => {
    const { result } = renderHook(() => useSalvaComputoImportato("o1", "c1", "u1"), { wrapper });
    const file = [{ file: new File(["x"], "prova.csv"), formato: "CSV", via: "browser" as const }];
    const primo = await result.current.mutateAsync({ voci: VOCI, file, totaleDocumento: 3000 });
    expect(primo.riusato).toBe(false);
    expect(db.uploads).toHaveLength(1);
    expect(db.uploads[0]).toMatchObject({ order_id: "o1", stato: "bozza", extraction_status: "completed", extraction_method: "xlsx_parse", file_type: "xlsx", titolo: "prova" });
    expect(db.voci).toHaveLength(2);
    expect(db.misure).toHaveLength(2);

    const secondo = await result.current.mutateAsync({ voci: VOCI, file, totaleDocumento: 3000 });
    await waitFor(() => expect(secondo).toEqual({ id: primo.id, riusato: true }));
    expect(db.uploads).toHaveLength(1);
    expect(db.voci).toHaveLength(2);
    expect(db.file).toHaveLength(1);
  });
});
