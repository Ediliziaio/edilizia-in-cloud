import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bundle, BundleVoce } from "@/hooks/useBundles";
import type { FamilyWithAxes } from "@/types/articleFamily";
import type { QuoteItemPro } from "@/types/quoteItem";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";

/**
 * Applicare un kit/pacchetto al preventivo: IVA, costo e unità delle righe
 * (05/10/2026). Prima: 22% fisso su kit, posa, articoli e tariffe anche coi
 * prodotti al 10%; costo 0 sul kit e sulle tariffe; articoli senza
 * standard_cost; unità legacy («h» per una tariffa a giornata).
 */

const stato = vi.hoisted(() => ({ bundles: [] as unknown[], families: [] as unknown[] }));

vi.mock("@/hooks/useBundles", () => ({
  useBundlesList: () => ({ bundles: stato.bundles, isLoading: false }),
}));
vi.mock("@/hooks/useFamilies", () => ({
  useFamilies: () => ({ families: stato.families, isLoading: false }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-demo" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  // Griglie: nessun punto (le famiglie del test sono a pezzo).
  const builder: Record<string, unknown> = {
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
  };
  for (const metodo of ["select", "in", "eq"]) builder[metodo] = () => builder;
  return { supabase: { from: () => builder } };
});

import ApplyBundleDialog from "@/components/marketing/preventivi/ApplyBundleDialog";

const famiglia = (over: Partial<FamilyWithAxes>): FamilyWithAxes => ({
  id: "fam-10",
  nome: "Piatto doccia",
  modalita_prezzo_base: "pz",
  prezzo_base_mode: "vendita",
  prezzo_base_vendita: 500,
  prezzo_base_acquisto: 300,
  vat_rate: 10,
  unit_of_measure: "pz",
  posa_tariffa_default_id: null,
  posa_quantita_default: 1,
  axes: [],
  ...over,
} as unknown as FamilyWithAxes);

const F10 = famiglia({ id: "fam-10", vat_rate: 10, posa_tariffa_default_id: "posa-1" });
const F22 = famiglia({ id: "fam-22", nome: "Termoarredo", vat_rate: 22, prezzo_base_vendita: 200, prezzo_base_acquisto: 120 });

// Come arriva da usePreventivoCosti: unità a giornata (legacy «h»).
const tariffePro = [
  { id: "posa-1", nome: "Posa piatto doccia", tipo: "posa", prezzo_vendita: 150, prezzo_costo: 70, costo_interno: 70, unita: "h", unita_fatturazione: "gg" },
] as unknown as TariffaPro[];

const voceVuota: BundleVoce = {
  id: "v", bundle_id: "b", prodotto_id: null, tariffa_id: null, family_id: null,
  axis_selections: {}, larghezza_mm_default: null, altezza_mm_default: null, vano_label: null,
  quantita: 1, sort_order: 0, immagine_url: null,
};
const voceFamiglia = (familyId: string, quantita = 1): BundleVoce => ({
  ...voceVuota, id: `v-${familyId}-${quantita}`, family_id: familyId, quantita,
});
const voceArticolo: BundleVoce = {
  ...voceVuota, id: "v-art", prodotto_id: "art-1", sort_order: 1,
  // prezzo_acquisto_netto allo 0 di default: il costo vero è standard_cost.
  article_templates: { name: "Box doccia", prezzo_vendita: 400, prezzo_acquisto_netto: 0, standard_cost: 250, vat_rate: 10, unit_of_measure: "pz" },
};
const voceTariffa: BundleVoce = {
  ...voceVuota, id: "v-tar", tariffa_id: "tar-2", sort_order: 2,
  // costo_interno allo 0 di default, costo vero in prezzo_costo; a giornata.
  tariffe_aziendali: { nome: "Assistenza idraulico", prezzo_vendita: 90, unita: "h", unita_fatturazione: "gg", costo_interno: 0, prezzo_costo: 50, costo_default: null },
};

const bundle = (over: Partial<Bundle>): Bundle => ({
  id: "b", company_id: "company-demo", nome: "Pacchetto", descrizione: null, sconto_bundle_pct: 0,
  attivo: true, vertical: null, tipo_lavoro: null, is_template: false, fv_kwp: null,
  fv_accumulo_kwh: null, prezzo_offerta: null, cover_image_url: null, created_at: "2026-10-05",
  voci: [], ...over,
} as Bundle);

async function applica(b: Bundle): Promise<QuoteItemPro[]> {
  stato.bundles = [b];
  const onAddItems = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ApplyBundleDialog open onClose={vi.fn()} onAddItems={onAddItems} currentSortOrder={3} tariffe={tariffePro} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`Seleziona bundle ${b.nome}`) }));
  const conferma = screen.getByRole("button", { name: /Aggiungi \d+ voci/ });
  await waitFor(() => expect(conferma).toBeEnabled());
  fireEvent.click(conferma);
  expect(onAddItems).toHaveBeenCalledOnce();
  client.clear();
  return onAddItems.mock.calls[0][0] as QuoteItemPro[];
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  stato.families = [F10, F22];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("pacchetto espanso in righe", () => {
  it("prodotti al 10%: posa, articolo e tariffa sciolta al 10%, con i loro costi e unità", async () => {
    const righe = await applica(bundle({
      nome: "Pacchetto bagno",
      voci: [voceFamiglia("fam-10", 2), voceArticolo, voceTariffa],
    }));
    const [prodotto, posa, articolo, tariffa] = righe;

    expect(prodotto).toMatchObject({ name: "Piatto doccia", vat_rate: 10, unit_price: 500, prezzo_acquisto: 300, quantity: 2 });
    // La posa segue l'IVA del prodotto che installa; costo e unità dalla tariffa.
    expect(posa).toMatchObject({ item_category: "posa", vat_rate: 10, prezzo_acquisto: 70, unit_of_measure: "gg", quantity: 2 });
    // Articolo legacy: la sua aliquota, e standard_cost quando il netto è lo 0 di default.
    expect(articolo).toMatchObject({ name: "Box doccia", vat_rate: 10, prezzo_acquisto: 250 });
    // Tariffa sciolta: l'aliquota comune dei prodotti, costo e unità veri.
    expect(tariffa).toMatchObject({ name: "Assistenza idraulico", vat_rate: 10, prezzo_acquisto: 50, unit_of_measure: "gg" });
  });

  it("prodotti con aliquote diverse: la tariffa sciolta va al 22%", async () => {
    const righe = await applica(bundle({
      nome: "Pacchetto misto",
      voci: [voceFamiglia("fam-10"), voceFamiglia("fam-22"), voceTariffa],
    }));
    const tariffa = righe.find((r) => r.name === "Assistenza idraulico");
    expect(tariffa?.vat_rate).toBe(22);
    expect(righe.find((r) => r.name === "Termoarredo")?.vat_rate).toBe(22);
    expect(righe.find((r) => r.name === "Piatto doccia")?.vat_rate).toBe(10);
  });
});

describe("kit a prezzo unico", () => {
  it("IVA dei suoi prodotti e costo = somma delle righe che sostituisce", async () => {
    const righe = await applica(bundle({
      nome: "Kit bagno chiavi in mano",
      prezzo_offerta: 9000,
      voci: [voceFamiglia("fam-10", 2), voceTariffa],
    }));
    expect(righe).toHaveLength(1);
    // 2 × 300 (prodotto) + 2 × 70 (posa del prodotto) + 1 × 50 (tariffa) = 790
    expect(righe[0]).toMatchObject({ unit_price: 9000, quantity: 1, vat_rate: 10, prezzo_acquisto: 790, sort_order: 3 });
  });

  it("kit senza voci: 22% e costo 0 (non si conosce)", async () => {
    const righe = await applica(bundle({ nome: "Kit FV 6 kWp", prezzo_offerta: 7500, voci: [] }));
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({ unit_price: 7500, vat_rate: 22, prezzo_acquisto: 0 });
  });

  it("kit con prodotti a aliquote diverse: 22%", async () => {
    const righe = await applica(bundle({
      nome: "Kit misto",
      prezzo_offerta: 3000,
      voci: [voceFamiglia("fam-10"), voceFamiglia("fam-22")],
    }));
    // 300 + 70 (posa di fam-10) + 120
    expect(righe[0]).toMatchObject({ vat_rate: 22, prezzo_acquisto: 490 });
  });
});
