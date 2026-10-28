import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, it, expect, vi } from "vitest";
const t = vi.hoisted(() => ({
  rpc: vi.fn(),
  tables: {} as Record<string, unknown[]>,
  readonly: false,
  error: false,
  close: vi.fn(),
  verbale: vi.fn(),
  storico: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewCosts: true,
    canViewSubappaltatoriAmministrazione: true,
    canEditOrders: !t.readonly,
    solaLettura: t.readonly,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: t.rpc,
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const name of ["select", "eq", "order", "limit"]) q[name] = () => q;
      q.then = (fn: (r: unknown) => unknown) =>
        Promise.resolve({
          data: t.tables[table] ?? [],
          error: t.error ? { message: "offline" } : null,
        }).then(fn);
      return q;
    },
  },
}));
import { LavoriMisureSubDialog } from "@/components/subappaltatori/LavoriMisureSubDialog";
const c = {
  id: "c",
  order_id: "o",
  numero_contratto: "DEMO",
  descrizione_lavori: "Bagno a corpo",
  importo_contrattuale: 1000,
  oneri_sicurezza: 0,
  ritenuta_garanzia_pct: 5,
};
const voce = {
  id: "v",
  fase_id: null as null,
  descrizione: "Bagno a corpo",
  base: "corpo",
  unita: "quota",
  quantita: 1,
  prezzo: 1000,
};
const quadro = {
  id: "q",
  revisione: 1,
  voci: [voce],
  maturazione: "sal_periodici",
  giorni_pagamento: 30,
  importo_lavori: 1000,
  motivo: "Impostazione demo",
};
function mostra(sezioneIniziale: "lavori" | "misure" | "sal" = "lavori") {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <LavoriMisureSubDialog
        sezioneIniziale={sezioneIniziale}
        companyId="company"
        contratto={c}
        onClose={t.close}
        onApriVerbale={t.verbale}
        onApriStorico={t.storico}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  t.tables = {};
  t.readonly = false;
  t.error = false;
  t.rpc.mockResolvedValue({
    data: { id: "saved", numero_sal: 3 },
    error: null,
  });
});
describe("flusso lavori e quantità sub", () => {
  it("propone i dati del contratto ma richiede la scelta di maturazione e la conferma", async () => {
    mostra();
    fireEvent.click(
      await screen.findByRole("button", { name: "Imposta elenco lavori" }),
    );
    expect(screen.getByLabelText("Lavoro affidato")).toHaveValue(
      "Bagno a corpo",
    );
    expect(
      screen.getByRole("button", { name: "Conferma base lavori" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Quando matura il compenso"), {
      target: { value: "sal_periodici" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma base lavori" }),
    );
    await waitFor(() =>
      expect(t.rpc).toHaveBeenCalledWith(
        "subappalto_quadro_registra",
        expect.objectContaining({
          p_company: "company",
          p_contratto: "c",
          p_importo_atteso: 1000,
          p_voci: [
            expect.objectContaining({
              base: "corpo",
              quantita: 1,
              prezzo: 1000,
            }),
          ],
        }),
      ),
    );
  });
  it("un contratto con SAL storici non riparte da quantità zero", async () => {
    t.tables.sal_subappaltatori = [
      { id: "storico", stato: "verificato", importo_lordo: 100 },
    ];
    mostra();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "riconciliare lo storico",
    );
    expect(
      screen.queryByRole("button", { name: "Imposta elenco lavori" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Consulta SAL registrati" }),
    );
    expect(t.storico).toHaveBeenCalledOnce();
    expect(t.rpc).not.toHaveBeenCalled();
  });
  it("verifica una quota parziale senza convertirla in pagamento o SAL", async () => {
    t.tables.subappalto_quadri_lavori = [quadro];
    t.tables.subappalto_misure = [
      {
        id: "m",
        quadro_id: "q",
        voce_id: "v",
        data_rilievo: "2026-10-27",
        quantita_dichiarata: 0.6,
        quantita_riconosciuta: null,
        importo_riconosciuto: null,
        stato: "dichiarata",
        riferimento: "Rilievo demo",
        revisione: 1,
        sal_id: null,
      },
    ];
    mostra();
    fireEvent.click(
      await screen.findByRole("button", { name: "Rilevazioni e verifiche" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Verifica" }));
    fireEvent.change(screen.getByLabelText(/Quantità riconosciuta/), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText(/Riscontro e riferimento/), {
      target: { value: "Misura verificata DEMO" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Riconosci quantità" }));
    await waitFor(() =>
      expect(t.rpc).toHaveBeenCalledWith(
        "subappalto_misura_verifica",
        expect.objectContaining({ p_id: "m", p_quantita: 0.5, p_revisione: 1 }),
      ),
    );
    expect(
      t.rpc.mock.calls.every((c) => c[0] !== "subappalto_sal_da_misure"),
    ).toBe(true);
  });
  it("invia soltanto i riferimenti delle misure disponibili e apre il verbale dopo conferma", async () => {
    t.tables.subappalto_quadri_lavori = [quadro];
    t.tables.subappalto_misure = [
      {
        id: "m",
        quadro_id: "q",
        voce_id: "v",
        data_rilievo: "2026-10-27",
        quantita_dichiarata: 0.5,
        quantita_riconosciuta: 0.5,
        importo_riconosciuto: 500,
        stato: "riconosciuta",
        riferimento: "Rilievo demo",
        revisione: 2,
        sal_id: null,
      },
      {
        id: "gia",
        voce_id: "v",
        stato: "riconosciuta",
        sal_id: "sal",
        importo_riconosciuto: 100,
      },
    ];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Prepara SAL" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Lavori affidati" }));
    fireEvent.click(screen.getByRole("button", { name: "Prepara SAL" }));
    expect(screen.getByRole("checkbox")).toBeChecked();
    fireEvent.click(
      screen.getByRole("button", { name: "Registra SAL verificato" }),
    );
    await waitFor(() =>
      expect(t.rpc).toHaveBeenCalledWith(
        "subappalto_sal_da_misure",
        expect.objectContaining({ p_misure: ["m"], p_ritenuta: 5 }),
      ),
    );
    expect(t.rpc.mock.calls[0][1]).not.toHaveProperty("p_lordo");
    expect(t.verbale).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: "Prepara verbale SAL" }),
    );
    await waitFor(() => expect(t.verbale).toHaveBeenCalledWith("saved"));
  });
  it("mostra errore di lettura e non un elenco falsamente vuoto", async () => {
    t.error = true;
    mostra();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Lettura lavori",
    );
    expect(
      screen.queryByText("Definisci che cosa è affidato al subappaltatore"),
    ).not.toBeInTheDocument();
  });
  it("la sola lettura non può impostare o riconoscere lavori", async () => {
    t.readonly = true;
    mostra();
    expect(
      await screen.findByRole("button", { name: "Imposta elenco lavori" }),
    ).toBeDisabled();
    expect(t.rpc).not.toHaveBeenCalled();
  });
  it("mostra la voce storica e consente l’annullamento di una rilevazione della vecchia base", async () => {
    t.tables.subappalto_quadri_lavori = [
      { ...quadro, id: "q2", revisione: 2, voci: [] },
      quadro,
    ];
    t.tables.subappalto_misure = [
      {
        id: "vecchia",
        quadro_id: "q",
        voce_id: "v",
        data_rilievo: "2026-10-27",
        quantita_dichiarata: 0.6,
        stato: "dichiarata",
        riferimento: "DEMO vecchia base",
        revisione: 1,
        sal_id: null,
      },
    ];
    mostra();
    fireEvent.click(
      await screen.findByRole("button", { name: "Rilevazioni e verifiche" }),
    );
    expect(screen.getByText("Bagno a corpo")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verifica" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Annulla" }),
    ).toBeEnabled();
  });
  it("da Nuovo SAL apre subito la preparazione e indica il passo utile se mancano misure", async () => {
    t.tables.subappalto_quadri_lavori = [quadro];
    t.tables.subappalto_misure = [
      {
        id: "m",
        quadro_id: "q",
        voce_id: "v",
        data_rilievo: "2026-10-27",
        quantita_dichiarata: 0.6,
        stato: "dichiarata",
        riferimento: "DEMO",
        revisione: 1,
        sal_id: null,
      },
    ];
    mostra("sal");
    expect(
      await screen.findByRole("heading", {
        name: "Nessun lavoro pronto per un nuovo SAL",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Data SAL")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vai alle verifiche" }));
    expect(
      screen.getByRole("button", { name: "Rilevazioni e verifiche" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Verifica" }),
    ).toBeEnabled();
  });
  it("consente di consultare il verbale dalla rilevazione già contabilizzata", async () => {
    t.tables.subappalto_quadri_lavori = [quadro];
    t.tables.subappalto_misure = [
      {
        id: "m",
        quadro_id: "q",
        voce_id: "v",
        data_rilievo: "2026-10-27",
        quantita_dichiarata: 0.5,
        quantita_riconosciuta: 0.5,
        importo_riconosciuto: 500,
        stato: "riconosciuta",
        sal_id: "sal-esistente",
        riferimento: "DEMO",
        revisione: 3,
      },
    ];
    mostra("misure");
    fireEvent.click(await screen.findByRole("button", { name: "Verbale SAL" }));
    await waitFor(() =>
      expect(t.verbale).toHaveBeenCalledWith("sal-esistente"),
    );
    expect(t.rpc).not.toHaveBeenCalled();
  });
});
