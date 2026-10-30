/**
 * Il numero dei documenti da confermare nella home da telefono (Attività), e nella barra
 * laterale delle email (30/10/2026). Una riga, e solo se c'è qualcosa da fare.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentiDaConfermareBox } from "@/components/email-ai/DocumentiDaConfermareBox";

const stato = vi.hoisted(() => ({
  permessi: { canViewMarketingEmail: true } as Record<string, boolean>,
  conteggio: 0,
  errore: null as string | null,
  letture: [] as unknown[][][],
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const ops: unknown[][] = [["from", tabella]];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq"]) {
        q[m] = (...a: unknown[]) => {
          ops.push([m, ...a]);
          return q;
        };
      }
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        stato.letture.push(ops);
        const esito = stato.errore ? { count: null as number | null, error: { message: stato.errore } } : { count: stato.conteggio, error: null };
        return Promise.resolve(esito).then(ok, ko);
      };
      return q;
    },
  },
}));

const mostra = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <DocumentiDaConfermareBox />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  stato.permessi = { canViewMarketingEmail: true };
  stato.conteggio = 0;
  stato.errore = null;
  stato.letture = [];
});
afterEach(cleanup);

describe("riquadro «Documenti da confermare» in Attività", () => {
  it("con documenti da confermare: una riga col numero, che porta all'elenco", async () => {
    stato.conteggio = 5;
    mostra();
    const link = await screen.findByRole("link", { name: /Documenti da confermare/ });
    expect(link).toHaveAttribute("href", "/azienda/email/documenti");
    expect(link).toHaveTextContent("5");
  });

  it("conta solo i documenti veri ancora da confermare dell'azienda: l'«altro» non entra", async () => {
    stato.conteggio = 2;
    mostra();
    await screen.findByRole("link");
    const lettura = stato.letture[0];
    expect(lettura).toContainEqual(["from", "email_documento_estratto"]);
    expect(lettura).toContainEqual(["select", "id", { count: "exact", head: true }]);
    expect(lettura).toContainEqual(["eq", "company_id", "azienda"]);
    expect(lettura).toContainEqual(["eq", "stato", "da_confermare"]);
    expect(lettura).toContainEqual(["neq", "tipo", "altro"]);
  });

  it("oltre 99 mostra «99+»", async () => {
    stato.conteggio = 158;
    mostra();
    expect(await screen.findByRole("link")).toHaveTextContent("99+");
  });

  it("a zero non occupa posto", async () => {
    const { container } = mostra();
    await waitFor(() => expect(stato.letture).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("chi non può vedere le email non lo vede e non lo chiede al database", async () => {
    stato.permessi = { canViewMarketingEmail: false };
    stato.conteggio = 9;
    const { container } = mostra();
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    expect(stato.letture).toHaveLength(0);
  });

  it("se la lettura fallisce non mostra numeri inventati", async () => {
    stato.errore = "permission denied";
    const { container } = mostra();
    await waitFor(() => expect(stato.letture).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
