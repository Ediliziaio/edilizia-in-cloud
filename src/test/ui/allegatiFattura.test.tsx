import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 30/10/2026 — Allegati della fattura: si caricano nel contenitore privato sotto
// la cartella dell'azienda, la riga dice a quale fattura appartengono.

const finto = vi.hoisted(() => ({ righe: [] as unknown[], op: [] as Array<[string, unknown]> }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (): any => {
    const c: any = {};
    for (const m of ["select", "eq", "order"]) c[m] = () => c;
    c.insert = (v: unknown) => { finto.op.push(["insert", v]); return { then: (ok: any) => ok({ error: null }) }; };
    c.update = (v: unknown) => { finto.op.push(["update", v]); return c; };
    c.delete = () => { finto.op.push(["delete", null]); return c; };
    c.then = (ok: (v: unknown) => unknown) => ok({ data: finto.righe, error: null as null });
    return c;
  };
  return {
    supabase: {
      from: catena,
      storage: { from: () => ({
        upload: async (p: string) => { finto.op.push(["upload", p]); return { error: null as null }; },
        remove: async (p: string[]) => { finto.op.push(["remove", p]); return { error: null as null }; },
        createSignedUrl: async () => ({ data: { signedUrl: "https://x" }, error: null as null }),
      }) },
    },
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { AllegatiFattura, nomeFileSicuro } from "@/components/fatturazione/AllegatiFattura";

const ALLEGATO = { id: "a1", tipo: "contabile_pagamento", descrizione: null as string | null, file_name: "bonifico.pdf", mime_type: "application/pdf", size_bytes: 120000, storage_path: "co/fattura_ricevuta/f1/u-bonifico.pdf", includi_nell_invio: false, created_at: "2026-10-30T10:00:00Z" };

function apri(props: Partial<Parameters<typeof AllegatiFattura>[0]> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AllegatiFattura companyId="co" madre={{ fatturaRicevutaId: "f1" }} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => { finto.righe = []; finto.op = []; });

describe("allegati della fattura", () => {
  it("carica nella cartella dell'azienda e registra la riga sulla fattura ricevuta, come contabile", async () => {
    apri();
    await screen.findByText(/Nessun allegato/);
    const file = new File(["%PDF"], "Bonifico Rossi.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("File da allegare"), { target: { files: [file] } });
    await waitFor(() => expect(finto.op.find(([o]) => o === "insert")).toBeTruthy());
    const percorso = finto.op.find(([o]) => o === "upload")![1] as string;
    expect(percorso).toMatch(/^co\/fattura_ricevuta\/f1\/.+-Bonifico_Rossi\.pdf$/);
    expect(finto.op.find(([o]) => o === "insert")![1]).toMatchObject({
      company_id: "co", fattura_ricevuta_id: "f1", tipo: "contabile_pagamento", file_name: "Bonifico Rossi.pdf", storage_path: percorso,
    });
  });

  it("mostra gli allegati e li toglie col file", async () => {
    finto.righe = [ALLEGATO];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    apri();
    expect(await screen.findByText("bonifico.pdf")).toBeTruthy();
    expect(screen.getByText(/Contabile del pagamento · 117 KB/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Togli bonifico.pdf" }));
    await waitFor(() => expect(finto.op).toContainEqual(["remove", [ALLEGATO.storage_path]]));
  });

  it("sul documento SDI da inviare si sceglie cosa parte con la fattura", async () => {
    finto.righe = [{ ...ALLEGATO, storage_path: "co/documento_fiscale/d1/u-contratto.pdf", file_name: "contratto.pdf", tipo: "contratto" }];
    apri({ madre: { documentoFiscaleId: "d1" }, invioSdi: true });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Manda «contratto.pdf» allo SDI con la fattura" }));
    await waitFor(() => expect(finto.op).toContainEqual(["update", { includi_nell_invio: true }]));
  });

  it("nome di file sicuro per il percorso", () => {
    expect(nomeFileSicuro("Fattura n° 12/2026 — è ok.pdf")).toBe("Fattura_n_12_2026_e_ok.pdf");
    expect(nomeFileSicuro("../../etc")).toBe("etc");
  });
});
