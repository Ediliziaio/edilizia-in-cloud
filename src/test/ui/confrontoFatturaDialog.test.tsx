import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const fake = vi.hoisted(() => ({
  documenti: [] as unknown[],
  isError: false,
  originali: false,
  salva: vi.fn(),
}));
vi.mock("@/hooks/useConfrontoFattura", () => ({
  useConfrontoFattura: () => ({
    data: {
      documenti: fake.documenti,
      riferimenti: [] as unknown[],
      nonDisponibili: 0,
    },
    isError: fake.isError,
    error: { message: "RLS" },
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useOriginaliConfronto: (
    _company: string,
    doc: { id: string } | undefined,
  ) => ({
    data:
      fake.originali && doc
        ? [
            {
              id: doc.id,
              nome: doc.id === "d" ? "bolla.pdf" : "ordine.png",
              mime: doc.id === "d" ? "application/pdf" : "image/png",
              bucket: "qa",
              path: doc.id,
            },
          ]
        : [],
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useRiconciliazioneFatturaAI", () => ({
  useUltimaSelezioneConfrontoAI: () => ({
    data: null as { ddt: string[]; oda: string[] } | null,
  }),
  useRiconciliazioneFatturaAI: () => ({
    dati: {},
    analizza: { isPending: false },
    salva: {},
  }),
}));
vi.mock("@/components/fatturazione/VerificaFatturaPill", () => ({
  VerificaFatturaPill: () => <span>Verifica fattura</span>,
}));
vi.mock("@/components/fatturazione/PdfRigaConfronto", () => ({
  PdfRigaConfronto: ({ nome }: { nome: string }) => <canvas title={`Originale ${nome}`} />,
}));
vi.mock("@/components/fatturazione/CollegaDdtFattura", () => ({
  CollegaDdtFattura: () => <span>Scelta bolle reali</span>,
}));
vi.mock("@/lib/fatturazione/collegaDdt", () => ({
  salvaCollegamentoDdt: (...p: unknown[]) => fake.salva(...p),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: async (p: string) => ({
          data: { signedUrl: `https://files.example.test/${p}` },
          error: null as Error | null,
        }),
      }),
    },
  },
}));
import { ConfrontoFatturaDialog } from "@/components/fatturazione/ConfrontoFatturaDialog";
const fattura = {
  id: "f",
  numero_fattura: "QA-F",
  cedente_ragione_sociale: "Fornitore DEMO",
  data_fattura: "2026-11-11",
  fornitore_id: "fornitore",
  imponibile_totale: 540,
  iva_totale: 118.8,
  totale_documento: 658.8,
  righe: [
    {
      descrizione: "Malta A81",
      codice_articolo: "A81",
      unita_misura: "pz",
      quantita: 45,
      prezzo_unitario: 12,
      imponibile: 540,
    },
  ],
};
const r = {
  id: "r1",
  descrizione: "Malta A81",
  codice: "A81",
  um: "pz",
  quantita: 40,
  prezzo: 11.5,
  importo: 460,
};
beforeEach(() => {
  fake.isError = false;
  fake.originali = false;
  fake.salva.mockReset().mockResolvedValue({ id: "link" });
  fake.documenti = [
    {
      id: "d",
      tipo: "ddt",
      numero: "DDT-341",
      data: "2026-11-11",
      fornitore: "Fornitore DEMO",
      collegato: true,
      righe: [r],
      bolle: [
        { ...r, documentoId: "d", giaFatturata: 20, residuoIncerto: false },
      ],
      dati: { destinazione: "cantiere" },
      avviso: null,
    },
    {
      id: "o",
      tipo: "oda",
      numero: "ODA-108",
      data: "2026-11-10",
      fornitore: "Fornitore DEMO",
      collegato: true,
      righe: [{ ...r, id: "o1", quantita: 70 }],
      bolle: [],
      dati: {},
      avviso: null,
    },
  ];
});
const monta = (props = {}) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <ConfrontoFatturaDialog
          fattura={fattura}
          companyId="a"
          ordineIds={["o"]}
          puoModificare={false}
          onClose={vi.fn()}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
describe("confronto affiancato della fattura", () => {
  it("allinea le righe all’ordine della fattura e consente di tornare all’ordine del documento", () => {
    const rete = { ...r, id: "rete", descrizione: "Rete", codice: "RET" };
    fake.documenti[0] = { ...(fake.documenti[0] as object), righe: [rete, r] };
    monta({
      fattura: {
        ...fattura,
        righe: [
          ...fattura.righe,
          {
            descrizione: "Rete",
            codice_articolo: "RET",
            unita_misura: "mq",
            quantita: 10,
            prezzo_unitario: 2,
            imponibile: 20,
          },
        ],
      },
    });
    const destra = screen.getByRole("region", {
      name: "DDT e ordini di confronto",
    });
    let righe = within(destra).getAllByRole("row");
    expect(righe[1]).toHaveTextContent("Malta A81");
    expect(righe[2]).toHaveTextContent("Rete");
    fireEvent.click(
      screen.getByRole("button", { name: "Allinea righe alla fattura" }),
    );
    righe = within(destra).getAllByRole("row");
    expect(righe[1]).toHaveTextContent("Rete");
    expect(righe[2]).toHaveTextContent("Malta A81");
    expect(fake.salva).not.toHaveBeenCalled();
  });
  it("collega visivamente la voce F1 alle righe con codice uguale senza salvare associazioni", () => {
    monta();
    fireEvent.click(
      screen.getByRole("button", { name: "Metti a confronto la voce F1" }),
    );
    expect(
      screen.getByRole("button", { name: "Seleziona voce F1 della fattura" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /F1 selezionata/ })).toBeTruthy();
    expect(fake.salva).not.toHaveBeenCalled();
  });
  it("esclude dal controllo un DDT di un fornitore diverso e segnala il collegamento da correggere", () => {
    fake.documenti[0] = {
      ...(fake.documenti[0] as object),
      dati: { supplier_id: "altro" },
    };
    monta();
    expect(screen.getByRole("alert")).toHaveTextContent(/Fornitore diverso/);
    expect(
      screen.getByRole("checkbox", { name: "Includi DDT-341 nel controllo" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Controlla quantità e prezzi" }),
    );
    expect(screen.getByText("Da abbinare")).toBeTruthy();
  });
  it("mostra una fattura importata come foto usando il suo formato reale", async () => {
    monta({
      fattura: {
        ...fattura,
        pdf_storage_path: "azienda/fattura.png",
        pdf_storage_bucket: "fatture-ricevute",
      },
    });
    const sinistra = screen.getByRole("region", { name: "Fattura ricevuta" });
    fireEvent.mouseDown(
      within(sinistra).getByRole("tab", { name: "File originale" }),
      { button: 0, ctrlKey: false },
    );
    expect(await screen.findByAltText("Originale fattura.png")).toBeTruthy();
  });
  it("mostra fattura a sinistra, documenti selezionabili a destra e gli scostamenti reali", () => {
    monta();
    expect(
      screen.getByRole("region", { name: "Fattura ricevuta" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "DDT e ordini di confronto" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Controlla quantità e prezzi" }),
    );
    expect(screen.getByText("Scostamento")).toBeTruthy();
    expect(screen.getByText(/Disponibili: 20/)).toBeTruthy();
    expect(screen.getByText(/differenza 0,50/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Collega DDT" })).toBeNull();
  });
  it("togliere un DDT dal confronto ricalcola le quantità senza rimuovere il collegamento", () => {
    monta();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Includi DDT-341 nel controllo" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Controlla quantità e prezzi" }),
    );
    expect(screen.getByText("Da abbinare")).toBeTruthy();
    expect(screen.getByLabelText("Documento da visualizzare")).toHaveValue("d");
    expect(screen.getByText("Collegato alla fattura")).toBeTruthy();
    expect(fake.salva).not.toHaveBeenCalled();
  });
  it("permette di vedere l’originale anche dall’ordine e dichiara quando manca", () => {
    monta();
    const destra = screen.getByRole("region", {
      name: "DDT e ordini di confronto",
    });
    fireEvent.change(
      within(destra).getByLabelText("Documento da visualizzare"),
      { target: { value: "o" } },
    );
    fireEvent.mouseDown(
      within(destra).getByRole("tab", { name: "PDF / foto originali" }),
      { button: 0, ctrlKey: false },
    );
    expect(
      within(destra).getByText(/Nessun file originale conservato/),
    ).toBeTruthy();
  });
  it("mantiene la vista originale e carica subito il nuovo PDF o la nuova foto cambiando documento", async () => {
    fake.originali = true;
    monta();
    const destra = screen.getByRole("region", {
      name: "DDT e ordini di confronto",
    });
    fireEvent.mouseDown(
      within(destra).getByRole("tab", { name: "PDF / foto originali" }),
      { button: 0, ctrlKey: false },
    );
    expect(await screen.findByTitle("Originale bolla.pdf")).toBeTruthy();
    fireEvent.change(
      within(destra).getByLabelText("Documento da visualizzare"),
      { target: { value: "o" } },
    );
    expect(await screen.findByAltText("Originale ordine.png")).toBeTruthy();
    expect(screen.queryByTitle("Originale bolla.pdf")).toBeNull();
    expect(
      within(destra).getByRole("tab", { name: "PDF / foto originali" }),
    ).toHaveAttribute("aria-selected", "true");
  });
  it("collega direttamente la bolla visualizzata usando ID e azienda della fattura", async () => {
    fake.documenti[0] = { ...(fake.documenti[0] as object), collegato: false };
    monta({ puoModificare: true });
    fireEvent.click(
      screen.getByRole("button", { name: "Collega questa bolla" }),
    );
    await waitFor(() =>
      expect(fake.salva).toHaveBeenCalledWith({
        companyId: "a",
        fatturaId: "f",
        ddtId: "d",
        numero: "",
        data: null as { ddt: string[]; oda: string[] } | null,
      }),
    );
  });
  it("non presenta un confronto riuscito se i documenti non sono leggibili", () => {
    fake.isError = true;
    monta();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Documenti non disponibili/,
    );
    expect(
      screen.getByRole("button", { name: "Controlla quantità e prezzi" }),
    ).toBeDisabled();
  });
});
