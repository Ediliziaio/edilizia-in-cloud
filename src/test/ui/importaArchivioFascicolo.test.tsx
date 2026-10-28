import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useImportaArchivioFascicolo } from "@/hooks/useImportaArchivioFascicolo";
import type { ReactNode } from "react";
const stato = vi.hoisted(() => ({
  fonte: {
    id: "00000000-0000-4000-a000-000000000001",
    company_id: "azienda",
    subappaltatore_id: "ditta",
    tipo: "visura_camerale",
    nome_file: "visura.pdf",
    url: "azienda/ditta/file.pdf",
    data_rilascio: null,
    data_scadenza: null,
    note: null,
    created_at: "2026-10-27",
  },
  dest: null as Record<string, unknown> | null,
  oggetto: null as Blob | null,
  uploads: 0,
  download: 0,
  fallisceUpdate: false,
  cambiaFonte: false,
  readonly: false,
}));
vi.mock(
  "@/hooks/usePermissions",
  () => ({
    usePermissions: () => ({
      canViewSicurezzaCantiere: true,
      solaLettura: stato.readonly,
    }),
  }),
);
vi.mock(
  "@/hooks/useFascicoloCantiere",
  () => ({ chiaviFascicolo: ["fascicolo-cantiere"] }),
);
vi.mock(
  "@/integrations/supabase/client",
  () => ({
    supabase: {
      from: (table: string) => {
        let operazione = "select";
        let dati: Record<string, unknown> = {};
        const q = {
          select: () => q,
          eq: () => q,
          is: () => q,
          insert: (v: Record<string, unknown>) => {
            operazione = "insert";
            dati = v;
            return q;
          },
          update: (v: Record<string, unknown>) => {
            operazione = "update";
            dati = v;
            return q;
          },
          single: async () => esegui(),
          maybeSingle: async () => esegui(),
        };
        function esegui() {
          if (table === "documenti_subappaltatore") {
            return {
              data: { ...stato.fonte },
              error: null,
            };
          }
          if (operazione === "insert") {
            stato.dest = { ...dati };
            return { data: { id: dati.id }, error: null };
          }
          if (operazione === "update") {
            if (stato.fallisceUpdate) {
              stato.fallisceUpdate = false;
              return {
                data: null,
                error: new Error("TEST errore metadata dopo upload"),
              };
            }
            stato.dest = { ...stato.dest, ...dati };
            return { data: { id: stato.fonte.id }, error: null };
          }
          return { data: stato.dest, error: null };
        }
        return q;
      },
      storage: {
        from: (bucket: string) => ({
          download: async () => {
            stato.download++;
            if (bucket === "subappaltatori-documenti") {
              const data = new Blob(["%PDF-1.7\nTEST"]);
              if (stato.cambiaFonte) {
                stato.fonte = {
                  ...stato.fonte,
                  url: "azienda/ditta/cambiato.pdf",
                };
              }
              return { data, error: null };
            }
            return { data: stato.oggetto, error: null };
          },
          upload: async (_path: string, blob: Blob) => {
            stato.uploads++;
            if (stato.oggetto) {
              return {
                error: { statusCode: "409", message: "already exists" },
              };
            }
            stato.oggetto = blob;
            return { error: null };
          },
        }),
      },
    },
  }),
);
function mostra() {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return renderHook(() => useImportaArchivioFascicolo(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}
const args = () => ({
  fonte: { ...stato.fonte },
  destinazione: {
    companyId: "azienda",
    subId: "ditta",
    orderId: null,
    titolo: "Visura",
  },
});
beforeEach(() => {
  stato.dest = null;
  stato.oggetto = null;
  stato.uploads = 0;
  stato.download = 0;
  stato.fallisceUpdate = false;
  stato.cambiaFonte = false;
  stato.readonly = false;
  stato.fonte.url = "azienda/ditta/file.pdf";
});
describe("Importazione archivio e recupero interruzioni", () => {
  it("conserva PDF e impronta senza ereditare verifiche e non duplica al secondo tentativo", async () => {
    const h = mostra();
    await act(async () => {
      await h.result.current.mutateAsync(args());
    });
    expect(stato.dest).toMatchObject({
      id: stato.fonte.id,
      stato: "ricevuto",
      tipo: "visura",
      operaio_id: null,
    });
    expect(stato.dest?.verificato_da).toBeUndefined();
    expect(stato.oggetto?.type).toBe("application/pdf");
    expect(stato.dest?.note).toContain("SHA-256");
    await act(async () => {
      const r = await h.result.current.mutateAsync(args());
      expect(r.giaPresente).toBe(true);
    });
    expect(stato.uploads).toBe(1);
    expect(stato.download).toBe(1);
  });
  it("riprende metadata falliti senza sovrascrivere il file o creare altra evidenza", async () => {
    const h = mostra();
    stato.fallisceUpdate = true;
    await act(async () => {
      await expect(h.result.current.mutateAsync(args())).rejects.toThrow(
        /metadata/,
      );
    });
    expect(stato.dest?.stato).toBe("da_richiedere");
    expect(stato.oggetto).toBeTruthy();
    await act(async () => {
      await h.result.current.mutateAsync(args());
    });
    expect(stato.dest?.stato).toBe("ricevuto");
    expect(stato.dest?.id).toBe(stato.fonte.id);
  });
  it("non sovrascrive un oggetto differente trovato dopo l’interruzione", async () => {
    const h = mostra();
    stato.oggetto = new Blob(["%PDF-1.7\nDIVERSO"]);
    await act(async () => {
      await expect(h.result.current.mutateAsync(args())).rejects.toThrow(
        /diverso/,
      );
    });
    expect(stato.dest?.stato).toBe("da_richiedere");
  });
  it("rifiuta una fonte cambiata durante la lettura prima di creare metadati o file", async () => {
    const h = mostra();
    stato.cambiaFonte = true;
    await act(async () => {
      await expect(h.result.current.mutateAsync(args())).rejects.toThrow(
        /cambiato/,
      );
    });
    expect(stato.dest).toBeNull();
    expect(stato.uploads).toBe(0);
  });
  it("impedisce scritture in sola lettura", async () => {
    stato.readonly = true;
    const h = mostra();
    await act(async () => {
      await expect(h.result.current.mutateAsync(args())).rejects.toThrow(
        /permesso/,
      );
    });
    expect(stato.download).toBe(0);
  });
});
