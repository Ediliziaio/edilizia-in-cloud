/**
 * Il rilievo per posizioni: quello che finisce davvero nel preventivo.
 *
 * Il conto è lo standard applicato a Renova: 600 €/m² per la linea base, −8%
 * per la seconda linea. Una 1200×1400 fa 1,68 m² → 1.008 €, e con la seconda
 * linea 927,36 €. Se sbaglia qui, sbaglia su ogni riga di ogni preventivo.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { RilievoPosizioniDialog } from "@/components/marketing/preventivi/RilievoPosizioniDialog";
import type { AxisValue, FamilyWithAxes } from "@/types/articleFamily";
import type { QuoteItemPro } from "@/types/quoteItem";

const valore = (o: Partial<AxisValue> = {}): AxisValue => ({
  id: o.id ?? "v-" + Math.random().toString(36).slice(2, 8),
  axis_id: "ax-linea",
  company_id: "co",
  valore: "v",
  label: "V",
  descrizione: null,
  is_default: false,
  maggiorazione_tipo: "none" as const,
  maggiorazione_valore: 0,
  maggiorazione_acquisto: 0,
  codice: null,
  prezzo_vendita: null,
  prezzo_acquisto: null,
  immagine_url: null,
  sort_order: 0,
  attivo: true,
  created_at: "2026-01-01T00:00:00Z",
  ...o,
});

const famiglia = (): FamilyWithAxes => ({
  id: "fam-1",
  company_id: "co",
  vertical: "serramenti",
  macrocategoria_id: null,
  categoria_id: null,
  nome: "Finestra 2 Ante",
  codice: null,
  supplier_id: null,
  descrizione: null,
  immagine_url: null,
  pdf_scheda_url: null,
  modalita_prezzo_base: "mq",
  prezzo_base_mode: "vendita",
  prezzo_base_vendita: 600,
  prezzo_base_acquisto: 180,
  markup_tipo: "none",
  markup_valore: 0,
  sconto_fornitore_1: 0,
  sconto_fornitore_2: 0,
  vat_rate: 22,
  vat_rate_acquisto: 22,
  unit_of_measure: "mq",
  posa_tariffa_default_id: null,
  posa_quantita_default: 0,
  manodopera_modalita: "nessuna",
  manodopera_costo_acquisto: 0,
  manodopera_prezzo_vendita: 0,
  manodopera_unita: "pz",
  griglia_asse_x_label: "Larghezza",
  griglia_asse_y_label: "Altezza",
  griglia_unita: "mm",
  attivo: true,
  mostra_preventivo: true,
  sort_order: 0,
  custom_field_values: {},
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  axes: [
    {
      id: "ax-linea",
      family_id: "fam-1",
      company_id: "co",
      nome: "Linea",
      codice: "linea",
      descrizione: null,
      tipo: "discrete",
      obbligatorio: true,
      sort_order: -1,
      created_at: "2026-01-01T00:00:00Z",
      values: [
        valore({ id: "v-sala", valore: "salamander", label: "PVC Salamander 76", is_default: true }),
        valore({
          id: "v-alu", valore: "aluplast", label: "PVC Aluplast Ideal 5000",
          maggiorazione_tipo: "percentuale", maggiorazione_valore: -8, maggiorazione_acquisto: -8,
          sort_order: 1,
        }),
      ],
    },
  ],
});

function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return { cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

/** I campi del dialogo vivono in un portale: si cercano su tutto il body. */
const campi = (etichetta: string) =>
  [...document.body.querySelectorAll<HTMLInputElement>(`input[aria-label="${etichetta}"]`)];

const scrivi = async (input: HTMLInputElement, testo: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, testo);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const bottone = (etichetta: string) =>
  [...document.body.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(etichetta));

describe("RilievoPosizioniDialog", () => {
  it("calcola il totale mentre si scrivono le misure", async () => {
    const { cleanup } = render(
      <RilievoPosizioniDialog
        open
        onClose={() => {}}
        onAddItems={() => {}}
        currentSortOrder={0}
        famiglie={[famiglia()]}
      />,
    );

    // Riga aperta ma senza misure: non entra nel totale.
    expect(document.body.textContent).toContain("da misurare");

    await scrivi(campi("Larghezza in millimetri")[0], "1200");
    await scrivi(campi("Altezza in millimetri")[0], "1400");

    // 1,68 m² × 600 €/m² = 1.008 €
    expect(document.body.textContent).toContain("1.008,00");
    expect(document.body.textContent).not.toContain("da misurare");
    cleanup();
  });

  it("manda al preventivo una riga per posizione, col riferimento davanti", async () => {
    const ricevute = vi.fn<(items: QuoteItemPro[], next: number) => void>();
    const { cleanup } = render(
      <RilievoPosizioniDialog
        open
        onClose={() => {}}
        onAddItems={ricevute}
        currentSortOrder={5}
        famiglie={[famiglia()]}
      />,
    );

    await scrivi(campi("Larghezza in millimetri")[0], "1200");
    await scrivi(campi("Altezza in millimetri")[0], "1400");

    await act(async () => {
      bottone("Posizione")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await scrivi(campi("Larghezza in millimetri")[1], "600");
    await scrivi(campi("Altezza in millimetri")[1], "800");

    await act(async () => {
      bottone("Aggiungi 2 righe")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(ricevute).toHaveBeenCalledTimes(1);
    const [items, prossimo] = ricevute.mock.calls[0];
    expect(items).toHaveLength(2);
    expect(items[0].description).toContain("P1 — Finestra 2 Ante · 1200 × 1400 mm");
    expect(items[0].unit_price).toBeCloseTo(1008, 2);
    expect(items[1].description).toContain("P2 —");
    // I sort_order continuano da dove era il preventivo, non da zero.
    expect(items[0].sort_order).toBe(5);
    expect(prossimo).toBe(7);
    cleanup();
  });
});
