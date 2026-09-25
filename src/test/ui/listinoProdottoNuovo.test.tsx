/**
 * Prodotto nuovo nel listino: la prima cosa è scegliere come si vende (25/09/2026).
 *
 * Renova ha creato «PORTONCINO ALLUMINIO SALAMANDER» e non riusciva a mettergli
 * il prezzo. L'editor partiva dalla griglia L×H senza dirlo: Fabio ha scritto le
 * misure (900 e 2100) nei campi del NOME delle misure, la tabella è rimasta vuota
 * e nel passo Prezzo non c'era nessun campo prezzo, solo la tabella da compilare.
 *
 * Ora, come ha chiesto il titolare, con un prodotto nuovo si sceglie per prima
 * la modalità (a pezzo, al mq, griglia, misura libera): nessuna è preselezionata
 * e il resto dell'editor compare dopo la scelta. Con la griglia l'editor dice
 * che lì va il nome della misura e che le misure vanno nella tabella. Un
 * prodotto già salvato si apre con la sua modalità e tutto visibile.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ famiglia: null as Record<string, unknown> | null }));

vi.mock("@/integrations/supabase/client", () => {
  const risposta: { data: unknown[]; error: null } = { data: [], error: null };
  const catena: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "is", "in", "order", "limit"]) catena[m] = () => catena;
  catena.then = (r: (v: unknown) => unknown) => Promise.resolve(risposta).then(r);
  return { supabase: { from: () => catena, rpc: vi.fn() } };
});
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));
vi.mock("@/hooks/useFamilies", () => ({ useFamily: () => ({ family: stato.famiglia, isLoading: false }) }));
vi.mock("@/hooks/useFamilyMutations", () => ({
  useFamilyMutations: () => ({
    createFamily: { mutateAsync: vi.fn(), isPending: false },
    updateFamily: { mutateAsync: vi.fn(), isPending: false },
    duplicateFamily: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock("@/hooks/useArticleImageUpload", () => ({
  useArticleImageUpload: () => ({ upload: vi.fn(), remove: vi.fn(), isUploading: false, isRemoving: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/hooks/useListinoMacrocategorie", () => ({ useListinoMacrocategorie: () => ({ macrocategorie: [] as unknown[] }) }));
vi.mock("@/hooks/useListinoCategorie", () => ({ useListinoCategorie: () => ({ categorie: [] as unknown[], isLoading: false }) }));
// Le parti che qui non servono (documenti, varianti, tabella, foto) restano fuori.
vi.mock("@/components/listino/ArticlePdfDocumentsSection", () => ({ ArticlePdfDocumentsSection: (): null => null }));
vi.mock("@/components/listino/FamilyAxesEditor", () => ({ FamilyAxesEditor: (): null => null }));
vi.mock("@/components/listino/FamilyGridEditor", () => ({ FamilyGridEditor: (): null => null }));
vi.mock("@/components/listino/PhotoTemplatePicker", () => ({ PhotoTemplatePicker: (): null => null }));
vi.mock("@/components/listino/FamilyPricePreview", () => ({ FamilyPricePreview: (): null => null }));
vi.mock("@/components/listino/MacroCategorieManager", () => ({ MacroCategorieManager: (): null => null }));
vi.mock("@/components/listino/DynamicFieldsRenderer", () => ({ DynamicFieldsRenderer: (): null => null }));

import { FamilyEditor } from "@/components/listino/FamilyEditor";

function apri(percorso: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[percorso]}>
          <Routes>
            <Route path="/azienda/impostazioni/listino/:id" element={<FamilyEditor />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  return () => {
    act(() => root.unmount());
    container.remove();
  };
}

const MODALITA = ["pz", "mq", "griglia", "misura_libera"];
const scelta = (valore: string) => document.getElementById(`mod-${valore}`);
const selezionata = (valore: string) => scelta(valore)?.getAttribute("aria-checked") === "true";
const testo = () => document.body.textContent ?? "";
const scegli = async (valore: string) => {
  await act(async () => {
    scelta(valore)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

afterEach(() => {
  stato.famiglia = null;
});

describe("listino: prodotto nuovo, prima la modalità", () => {
  it("nessuna modalità scelta e il resto non c'è ancora", () => {
    const chiudi = apri("/azienda/impostazioni/listino/nuova");
    try {
      expect(testo()).toContain("Come si vende questo prodotto?");
      expect(testo()).toContain("Scegli prima questo");
      expect(MODALITA.filter(selezionata)).toEqual([]);
      // la prima scelta è la più semplice
      expect([...document.querySelectorAll('[id^="mod-"]')].map((n) => n.id)).toEqual(MODALITA.map((m) => `mod-${m}`));
      expect(document.getElementById("f-nome")).toBeNull();
      expect(testo()).not.toContain("Crea articolo");
      expect(testo()).not.toContain("Default serramenti");
    } finally {
      chiudi();
    }
  });

  it("scelto «A pezzo», compare il resto e niente griglia", async () => {
    const chiudi = apri("/azienda/impostazioni/listino/nuova");
    try {
      await scegli("pz");
      expect(MODALITA.filter(selezionata)).toEqual(["pz"]);
      expect(document.getElementById("f-nome")).not.toBeNull();
      expect(document.getElementById("f-griglia-x")).toBeNull();
      expect(testo()).not.toContain("Scegli prima questo");
      expect(testo()).toContain("Crea articolo");
    } finally {
      chiudi();
    }
  });

  it("scelta la griglia, dice che lì va il nome della misura, non la misura", async () => {
    const chiudi = apri("/azienda/impostazioni/listino/nuova");
    try {
      await scegli("griglia");
      expect(MODALITA.filter(selezionata)).toEqual(["griglia"]);
      expect((document.getElementById("f-griglia-x") as HTMLInputElement | null)?.value).toBe("Larghezza (mm)");
      expect((document.getElementById("f-griglia-y") as HTMLInputElement | null)?.value).toBe("Altezza (mm)");
      expect(testo()).toContain("Nome della misura in orizzontale");
      expect(testo()).toContain("Nome della misura in verticale");
      expect(testo()).toContain("Qui va solo il nome");
      expect(testo()).toContain("Per un prezzo unico scegli «A pezzo»");
      expect(document.getElementById("f-nome")).not.toBeNull();
    } finally {
      chiudi();
    }
  });

  it("un prodotto già salvato si apre con la sua modalità e tutto visibile", () => {
    const famiglia: Record<string, unknown> = {
      id: "fam-1",
      company_id: "azienda-1",
      nome: "Finestra 2 ante",
      codice: null,
      macrocategoria_id: null,
      categoria_id: null,
      descrizione: null,
      immagine_url: null,
      modalita_prezzo_base: "mq",
      unit_of_measure: "pz",
      vat_rate: 10,
      griglia_asse_x_label: "Larghezza (mm)",
      griglia_asse_y_label: "Altezza (mm)",
      prezzo_base_vendita: 600,
      prezzo_base_acquisto: 180,
      updated_at: "2026-09-25T08:00:00Z",
    };
    stato.famiglia = famiglia;
    const chiudi = apri("/azienda/impostazioni/listino/fam-1");
    try {
      expect(MODALITA.filter(selezionata)).toEqual(["mq"]);
      expect((document.getElementById("f-nome") as HTMLInputElement | null)?.value).toBe("Finestra 2 ante");
      expect(testo()).not.toContain("Scegli prima questo");
      expect(testo()).toContain("Salva dati base");
    } finally {
      chiudi();
    }
  });
});
