/**
 * Le scadenze della sicurezza dentro la commessa (09/11/2026): chi apre il
 * cantiere vede subito cosa è in ritardo, senza passare dalla pagina azienda.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScadenzeCommessa } from "@/components/sicurezza/ScadenzeCommessa";

const stato = vi.hoisted(() => ({
  righe: [] as Record<string, unknown>[],
  errore: null as { message: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: stato.righe, error: stato.errore }).then(ok);
      return q;
    },
  },
}));

const mostra = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ScadenzeCommessa companyId="c" orderId="o" />
    </QueryClientProvider>,
  );

beforeEach(() => {
  stato.righe = [];
  stato.errore = null;
});
afterEach(cleanup);

describe("Scadenze del cantiere", () => {
  it("senza scadenze non disegna nessuna scatola vuota", async () => {
    const { container } = mostra();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("mette in cima il ritardo più vecchio e dice da quanti giorni", async () => {
    stato.righe = [
      {
        origine: "adempimento", riferimento_id: "a2", tipo: "cartello_cantiere",
        titolo: null, subappaltatore: null, data_scadenza: "2026-11-20",
        giorni_mancanti: 11, stato: "in_scadenza",
      },
      {
        origine: "durc_ditta", riferimento_id: "d1", tipo: "durc",
        titolo: null, subappaltatore: "Edil Rossi", data_scadenza: "2026-11-05",
        giorni_mancanti: -4, stato: "scaduto",
      },
    ];
    mostra();
    const titolo = await screen.findByRole("heading", {
      name: /Scadenze di questo cantiere/,
    });
    expect(titolo).toHaveTextContent("1 in ritardo, 1 in scadenza");

    const voci = screen.getAllByRole("listitem");
    expect(voci[0]).toHaveTextContent("DURC · Edil Rossi");
    expect(voci[0]).toHaveTextContent("era da fare 4 giorni fa, il 05/11/2026");
    expect(voci[1]).toHaveTextContent("Cartello di cantiere");
    expect(voci[1]).toHaveTextContent("scade fra 11 giorni");
  });

  it("se la lettura fallisce lo dice, non finge che sia tutto a posto", async () => {
    stato.errore = { message: "offline" };
    mostra();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /non disponibili/,
    );
  });
});
