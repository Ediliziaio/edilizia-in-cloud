/**
 * Listino → finestra «Tipologie»: ogni campo ha il suo nome (10/10/2026).
 *
 * Nella finestra di una tipologia solo 1 etichetta su 6 era collegata al suo campo, e le quattro azioni di ogni riga
 * (scheda tecnica, importa i modelli pronti, modifica, elimina) si chiamavano uguali per tutte le tipologie: chi usa un
 * lettore di schermo non sapeva su quale agiva.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const macro = {
  id: "m1", company_id: "azienda-1", nome: "Serramenti WND", descrizione: null as string | null, descrizione_estesa: null as string | null,
  verticali_abilitati: ["serramentista"], immagine_url: null as string | null, categoria_tipo: "principale", tipologia: null as string | null,
  fv_categoria: null as string | null, sort_order: 0, attivo: true,
};
const altra = { ...macro, id: "m2", nome: "Tapparelle", sort_order: 1 };
const scrittura = () => ({ mutateAsync: vi.fn(), isPending: false });

vi.mock("@/hooks/useListinoMacrocategorie", () => ({
  useListinoMacrocategorie: () => ({ macrocategorie: [macro, altra], isLoading: false }),
  useMacrocategorieMutations: () => ({ createMacrocategoria: scrittura(), updateMacrocategoria: scrittura(), deleteMacrocategoria: scrittura() }),
}));
vi.mock("@/hooks/useListinoEntityImage", () => ({
  useListinoEntityImage: () => ({ upload: vi.fn(), remove: vi.fn(), isUploading: false, isRemoving: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuthSelector: (scegli: (c: { effectiveCompany: { id: string } }) => unknown) => scegli({ effectiveCompany: { id: "azienda-1" } }),
}));
vi.mock("@/components/listino/SchedaTecnicaEditor", () => ({ SchedaTecnicaEditor: (): null => null }));
vi.mock("@/components/listino/PhotoTemplatePicker", () => ({ PhotoTemplatePicker: (): null => null }));
vi.mock("@/components/listino/FamilyTemplateBulkDialog", () => ({ FamilyTemplateBulkDialog: (): null => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { MacroCategorieManager } from "@/components/listino/MacroCategorieManager";

Object.assign(Element.prototype, { hasPointerCapture: () => false, releasePointerCapture: () => {}, setPointerCapture: () => {}, scrollIntoView: () => {} });
afterEach(() => cleanup());

describe("Tipologie: le azioni di ogni riga dicono su quale tipologia agiscono", () => {
  it("scheda tecnica, modelli pronti, modifica ed elimina portano il nome della tipologia", () => {
    render(<MacroCategorieManager />);
    for (const nome of ["Serramenti WND", "Tapparelle"]) {
      expect(screen.getByRole("button", { name: `Scheda tecnica di ${nome}` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Importa i modelli pronti in ${nome}` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Modifica ${nome}` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Elimina ${nome}` })).toBeInTheDocument();
    }
  });
});

describe("Tipologie: la finestra di modifica", () => {
  function apriModifica() {
    render(<MacroCategorieManager />);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Serramenti WND" }));
    return screen.getByRole("dialog");
  }

  it("«Come compare nel preventivo» è un gruppo con i due pulsanti, e quello scelto è premuto", () => {
    const finestra = apriModifica();
    const gruppo = within(finestra).getByRole("group", { name: "Come compare nel preventivo" });
    const principale = within(gruppo).getByRole("button", { name: /Prodotto principale/ });
    const accessorio = within(gruppo).getByRole("button", { name: /Accessorio/ });
    expect(principale).toHaveAttribute("aria-pressed", "true");
    expect(accessorio).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(accessorio);
    expect(accessorio).toHaveAttribute("aria-pressed", "true");
    expect(principale).toHaveAttribute("aria-pressed", "false");
  });

  it("«Tipologia listino (per i preventivatori)» è l'etichetta del suo campo", () => {
    const finestra = apriModifica();
    expect(within(finestra).getByLabelText("Tipologia listino (per i preventivatori)")).toBe(finestra.querySelector("#mc-tipologia"));
  });

  it("la foto e i verticali hanno il loro gruppo con il nome della sezione", () => {
    const finestra = apriModifica();
    const foto = within(finestra).getByRole("group", { name: "Foto della tipologia (facoltativa)" });
    expect(within(foto).getByRole("button", { name: /Carica foto/ })).toBeInTheDocument();
    const verticali = within(finestra).getByRole("group", { name: "Verticali abilitati" });
    expect(within(verticali).getAllByRole("checkbox").length).toBeGreaterThanOrEqual(9);
    expect(within(verticali).getByRole("checkbox", { name: "Serramenti" })).toBeChecked();
    expect(within(verticali).getByRole("checkbox", { name: "Bagno" })).not.toBeChecked();
  });

  it("scelto «Fotovoltaico» compare il secondo campo, e ha un nome", () => {
    const finestra = apriModifica();
    // il campo della tipologia è una tendina Radix: si apre con il puntatore, come fa il browser
    fireEvent.pointerDown(within(finestra).getByLabelText("Tipologia listino (per i preventivatori)"), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(screen.getByRole("option", { name: "Fotovoltaico" }));
    expect(within(finestra).getByLabelText("Componente fotovoltaico")).toBeInTheDocument();
  });
});
