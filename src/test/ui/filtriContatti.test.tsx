/**
 * Contatti › pannello Filtri (24/09/2026).
 *
 * Com'era: il menu dei tag leggeva l'anagrafica marketing_tags, dove quasi
 * nessun tag in uso è registrato (Il Bagno Group: 21 tag sui contatti, zero
 * nel menu); ogni pipeline era un campo a sé, «Sequenza: privato», con una
 * sola scelta possibile; tutti i campi dicevano «è» anche quando si cercava
 * «contiene»; una condizione lasciata senza valore contava come filtro attivo
 * e non filtrava niente; «OR»/«AND» in inglese. E non si sapeva quanti
 * contatti restavano finché non si applicava.
 */
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContactFiltersSheet,
  countActiveContactFilters,
  type ContactFilters,
} from "@/components/marketing/ContactFiltersSheet";

const chiamate: { funzione: string; argomenti: Record<string, unknown> }[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (funzione: string, argomenti: Record<string, unknown>) => {
      chiamate.push({ funzione, argomenti });
      const voci = argomenti.p_campo === "tags"
        ? [
          { valore: "dvs ai", etichetta: "dvs ai", contatti: 1586 },
          { valore: "Fiera (Milano)", etichetta: "Fiera (Milano)", contatti: 12 },
        ]
        : [{ valore: "BO", etichetta: "Bologna (BO)", contatti: 1879 }];
      return Promise.resolve({ data: voci, error: null });
    },
  },
}));

beforeAll(() => {
  // cmdk e Radix misurano e scorrono gli elementi: jsdom non lo sa fare.
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
  chiamate.length = 0;
});

afterEach(() => cleanup());

const PIPELINE = [
  {
    id: "p-privati",
    name: "Privati",
    marketing_pipeline_stages: [
      { id: "s-2", name: "Preventivo", position: 2 },
      { id: "s-1", name: "Nuovo", position: 1 },
    ],
  },
];

function mostra(filtri: ContactFilters, extra: Partial<Parameters<typeof ContactFiltersSheet>[0]> = {}) {
  const onApply = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ContactFiltersSheet
        open
        onOpenChange={() => {}}
        filters={filtri}
        onApply={onApply}
        companyId="az-1"
        pipelines={PIPELINE}
        {...extra}
      />
    </QueryClientProvider>,
  );
  return { onApply };
}

const regola = (field: string, operator: string, value = "", id = field) =>
  ({ id, field, operator, value }) as ContactFilters["groups"][number]["rules"][number];

describe("Filtri dei contatti", () => {
  it("ogni campo dice cosa fa: «contiene» sul testo, «ha il tag» sui tag, «negli ultimi … giorni» sulle date", () => {
    mostra({
      groups: [
        { id: "g1", rules: [regola("city", "contains", "Milano"), regola("tags", "is", "dvs ai")] },
        { id: "g2", rules: [regola("last_activity_at", "last_days", "30")] },
      ],
    });

    expect(screen.getByText("contiene")).toBeTruthy();
    expect(screen.getByText("ha il tag")).toBeTruthy();
    expect(screen.getByText("negli ultimi … giorni")).toBeTruthy();
    expect(screen.getByText("giorni")).toBeTruthy();
    // In italiano, e con il senso scritto sotto il titolo.
    expect(screen.getByText("e")).toBeTruthy();
    expect(screen.getByText("oppure")).toBeTruthy();
    expect(screen.queryByText("OR")).toBeNull();
    expect(screen.queryByText("AND")).toBeNull();
    expect(screen.getByText(/fra riquadri diversi ne basta uno/)).toBeTruthy();
  });

  it("i tag si scelgono fra quelli presenti nei contatti, con quanti ne hanno", async () => {
    mostra({ groups: [{ id: "g1", rules: [regola("tags", "is")] }] });

    fireEvent.click(screen.getByRole("combobox", { name: "Scegli il valore" }));
    expect(await screen.findByText("dvs ai")).toBeTruthy();
    // In italiano le migliaia hanno il punto da cinque cifre in su: 1586, 21.160.
    expect(screen.getByText("1586")).toBeTruthy();
    expect(chiamate).toContainEqual({
      funzione: "marketing_valori_filtro_contatti",
      argomenti: { p_company: "az-1", p_campo: "tags" },
    });

    fireEvent.click(screen.getByText("Fiera (Milano)"));
    expect(screen.getByRole("combobox", { name: "Valore: Fiera (Milano)" })).toBeTruthy();
  });

  it("la provincia si legge per esteso, con la sigla", async () => {
    mostra({ groups: [{ id: "g1", rules: [regola("province", "is", "BO")] }] });
    expect(await screen.findByRole("combobox", { name: "Valore: Bologna (BO)" })).toBeTruthy();
  });

  it("una pipeline è un campo solo, con tutte le pipeline fra cui scegliere", () => {
    mostra({ groups: [{ id: "g1", rules: [regola("city", "contains", "Roma")] }] });

    fireEvent.click(screen.getByText("Aggiungi alternativa (oppure)"));
    expect(screen.getByText("Pipeline")).toBeTruthy();
    expect(screen.getByText("Fase pipeline")).toBeTruthy();
    expect(screen.queryByText(/Sequenza:/)).toBeNull();
  });

  it("una condizione senza valore si segnala, non conta fra i filtri e «Applica» la toglie", () => {
    const filtri: ContactFilters = {
      groups: [
        { id: "g1", rules: [regola("city", "contains", "Milano"), regola("email", "contains", "")] },
        { id: "g2", rules: [regola("source", "is", "")] },
      ],
    };
    expect(countActiveContactFilters(filtri)).toBe(1);

    const { onApply } = mostra(filtri);
    expect(screen.getAllByText(/Manca il valore/)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Applica" }));
    expect(onApply).toHaveBeenCalledWith({
      groups: [{ id: "g1", rules: [regola("city", "contains", "Milano")] }],
    });
  });

  it("prima di applicare dice quanti contatti restano", async () => {
    const contaContatti = vi.fn().mockResolvedValue(21160);
    mostra({ groups: [{ id: "g1", rules: [regola("city", "contains", "Milano")] }] }, { contaContatti });

    expect(await screen.findByRole("button", { name: "Mostra 21.160 contatti" }, { timeout: 2000 })).toBeTruthy();
    expect(contaContatti).toHaveBeenCalledWith({
      groups: [{ id: expect.any(String), rules: [expect.objectContaining({ field: "city", operator: "contains", value: "Milano" })] }],
    });
  });

  it("cambiando campo, l'operatore torna uno che il campo nuovo conosce", async () => {
    const { onApply } = mostra({ groups: [{ id: "g1", rules: [regola("created_at", "last_days", "30")] }] });

    fireEvent.click(screen.getByTitle("Cambia campo"));
    fireEvent.click(screen.getByText("Città"));
    fireEvent.change(screen.getByPlaceholderText("Scrivi il valore…"), { target: { value: "Bologna" } });
    fireEvent.click(screen.getByRole("button", { name: "Applica" }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].groups[0].rules[0]).toMatchObject({ field: "city", operator: "contains", value: "Bologna" });
  });
});
