import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";
import type { RapportinoCompleto } from "@/hooks/useRapportiniMese";
import type { ReactNode } from "react";

const stato = vi.hoisted(() => ({ rpc: vi.fn(), errore: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: stato.rpc },
}));
vi.mock("@/lib/documentiOperativi/destinatarioRapporto", () => ({ leggiDestinatarioRapporto: async (_azienda: string, commessa: string) => ({ nome: commessa === "o2" ? "Secondo SIM" : "Cliente SIM", email: null as string | null }) }));
vi.mock("sonner", () => ({ toast: { error: stato.errore } }));
vi.mock("@/components/documentiOperativi/DocumentoInvioDialog", () => ({
  DocumentoInvioDialog: ({ documento }: { documento: DocumentoOperativo }) => (
    <div role="dialog" aria-label="Documento pronto">
      <output data-testid="documento">{JSON.stringify(documento)}</output>
    </div>
  ),
}));
vi.mock("@/components/orders/OfficeSelect", () => ({
  OfficeSelect: ({
    label,
    value,
    onValueChange,
    options,
  }: {
    label: string;
    value: string;
    onValueChange: (v: string) => void;
    options: { value: string; label: ReactNode }[];
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

import { RapportiPeriodoDialog } from "@/components/documentiOperativi/RapportiPeriodoDialog";
const r: RapportinoCompleto = {
  id: "r1",
  order_id: "o1",
  data_lavoro: "2026-11-04",
  stato: "approvato",
  descrizione_lavori: "SIM posa porta",
  ore_lavorate: 0,
  order: { client_name: "Cliente SIM", order_code: "SIM-1" },
};
const apri = (righe = [r], conDatiEconomici = true) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RapportiPeriodoDialog
        companyId="azienda-1"
        mese="2026-11"
        righe={righe}
        conDatiEconomici={conDatiEconomici}
      />
    </QueryClientProvider>,
  );
const menu = () =>
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Crea documento PDF" }),
    { key: "Enter" },
  );
beforeEach(() => {
  stato.rpc
    .mockReset()
    .mockResolvedValue({ data: { persone: [], voci: [] }, error: null });
  stato.errore.mockReset();
});
afterEach(cleanup);

describe("Riepilogo automatico dei rapportini approvati", () => {
  it("compila cliente e voci economiche registrate, senza costi interni", async () => {
    stato.rpc.mockResolvedValue({
      data: {
        persone: [],
        voci: [
          {
            descrizione: "Trasporto registrato",
            quantita: 2,
            unita: "viaggio",
            vendita_unitaria: 25,
            costo_unitario: 98765,
          },
        ],
      },
      error: null,
    });
    apri();
    menu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Riepilogo lavori approvati/ }),
    );
    await screen.findByRole("dialog", { name: "Documento pronto" });
    const documento = JSON.parse(
      screen.getByTestId("documento").textContent!,
    ) as DocumentoOperativo;
    expect(documento.destinatario.nome).toBe("Cliente SIM");
    expect(documento.righe[0]).toMatchObject({
      descrizione: "Trasporto registrato",
      quantita: 2,
      prezzo: 25,
    });
    expect(JSON.stringify(documento)).not.toContain("98765");
    expect(stato.rpc).toHaveBeenCalledWith("rapportino_quadro_economico", {
      p_rapportino_id: "r1",
    });
  });
  it("senza permesso economico prepara il testo approvato e non interroga i costi", async () => {
    apri([r], false);
    menu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Riepilogo lavori approvati/ }),
    );
    await screen.findByRole("dialog", { name: "Documento pronto" });
    expect(screen.getByTestId("documento")).toHaveTextContent("SIM posa porta");
    expect(stato.rpc).not.toHaveBeenCalled();
  });
  it("non prepara documenti dai rapportini ancora da approvare", () => {
    apri([{ ...r, stato: "inviato" }]);
    menu();
    expect(
      screen.getByRole("menuitem", { name: /Riepilogo lavori approvati/ }),
    ).toHaveAttribute("data-disabled");
    expect(stato.rpc).not.toHaveBeenCalled();
  });
  it("con più cantieri chiede quale documento preparare, senza mescolare i destinatari", async () => {
    apri([
      r,
      { ...r, id: "r2", order_id: "o2", order: { client_name: "Secondo SIM" } },
    ]);
    menu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Riepilogo lavori approvati/ }),
    );
    expect(
      screen.getByRole("button", { name: "Apri bozza compilata" }),
    ).toBeDisabled();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Cantiere del documento" }),
      { target: { value: "o2" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apri bozza compilata" }),
    );
    await screen.findByRole("dialog", { name: "Documento pronto" });
    expect(screen.getByTestId("documento")).toHaveTextContent("Secondo SIM");
    expect(stato.rpc).toHaveBeenCalledTimes(1);
    expect(stato.rpc).toHaveBeenCalledWith("rapportino_quadro_economico", {
      p_rapportino_id: "r2",
    });
  });
  it("se la lettura economica fallisce mostra l’errore e non esporta una bozza incompleta", async () => {
    stato.rpc.mockResolvedValue({
      data: null,
      error: { message: "Rete non disponibile" },
    });
    apri();
    menu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Riepilogo lavori approvati/ }),
    );
    await waitFor(() =>
      expect(stato.errore).toHaveBeenCalledWith("Rete non disponibile"),
    );
    expect(
      screen.queryByRole("dialog", { name: "Documento pronto" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Crea documento PDF" }),
    ).toBeEnabled();
  });
});
