/**
 * Le regole email si salvano, e offrono solo le azioni che il server esegue
 * (26/09/2026).
 *
 * Fino ad allora una regola nuova non si salvava mai: il salvataggio non mandava
 * company_id, obbligatorio e senza valore predefinito (zero regole in tutte le
 * aziende). E la pagina offriva «Etichetta», «Salta AI» e priorità («Normale»,
 * «Urgente») che la posta in arrivo non conosce. Cosa fanno le azioni sul server
 * lo prova src/test/logic/emailRegole.test.ts.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const inserite: unknown[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const elenco = {
    select: () => elenco,
    eq: () => elenco,
    order: async (): Promise<{ data: unknown[]; error: null }> => ({ data: [], error: null }),
  };
  return {
    supabase: {
      from: () => ({
        ...elenco,
        insert: (riga: unknown) => {
          inserite.push(riga);
          const salvata = async (): Promise<{ data: { id: string }; error: null }> => ({ data: { id: "regola-1" }, error: null });
          return { select: () => ({ single: salvata }) };
        },
      }),
    },
  };
});
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));
// Il dialogo vero, in jsdom, si rimbalza il focus con la tendina aperta dentro di
// lui e il test non finisce più: qui basta il suo contenuto.
vi.mock("@/components/ui/dialog", () => {
  const Contenuto = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: Contenuto, DialogContent: Contenuto, DialogHeader: Contenuto,
    DialogTitle: Contenuto, DialogFooter: Contenuto, DialogTrigger: Contenuto,
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EmailRulesSettings } from "@/components/email-ai/EmailRulesSettings";

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
});

beforeEach(() => {
  inserite.length = 0;
});

afterEach(() => cleanup());

function apriNuovaRegola() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <EmailRulesSettings />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Nuova regola/ }));
}

/** Apre la tendina che oggi mostra `scelta` e ne restituisce le voci. */
async function voci(scelta: string) {
  const tendina = screen.getAllByRole("combobox").find((c) => c.textContent === scelta);
  if (!tendina) throw new Error(`nessuna tendina mostra «${scelta}»`);
  fireEvent.pointerDown(tendina, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return (await screen.findAllByRole("option")).map((o) => o.textContent);
}

describe("Regole email", () => {
  it("una regola nuova si salva con l'azienda", async () => {
    apriNuovaRegola();
    fireEvent.change(screen.getByPlaceholderText("es. Preventivi Edil Forniture"), {
      target: { value: "Ordini Edil Forniture" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva regola" }));

    await waitFor(() => expect(inserite).toHaveLength(1));
    expect(inserite[0]).toMatchObject({
      company_id: "azienda-1",
      nome: "Ordini Edil Forniture",
      stato: "attiva",
      azioni: [{ tipo: "categoria", valore: "fornitore" }],
    });
  });

  it("le azioni sono solo quelle che il server esegue", async () => {
    apriNuovaRegola();
    expect(await voci("Assegna categoria")).toEqual([
      "Assegna categoria",
      "Imposta priorità",
      "Silenzia (segna come letta)",
      "Marca da fare (stella)",
    ]);
  });

  it("la priorità ha i valori della posta in arrivo", async () => {
    apriNuovaRegola();
    fireEvent.click(screen.getByRole("button", { name: /Azione/ }));
    expect(await voci("Alta")).toEqual(["Alta", "Media", "Bassa"]);
  });
});
