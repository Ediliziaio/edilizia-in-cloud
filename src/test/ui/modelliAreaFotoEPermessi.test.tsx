/**
 * Impostazioni → Modelli di preventivo → scheda «Moduli»: la foto in testa a ogni area esiste davvero, e l'editor del
 * modello dell'area non si apre a chi non può modificare nemmeno scrivendo l'indirizzo a mano (`modello=generale`).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ModuleTemplateLibrary from "@/components/preventivi/modules/ModuleTemplateLibrary";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";

const state = vi.hoisted(() => ({ canEdit: true }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-a" }));
vi.mock("@/hooks/useCompanyAnagraficaForTemplate", () => ({ useCompanyAnagraficaForTemplate: () => ({ ragione_sociale: "Impresa esempio" }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditSettingsPricing: state.canEdit, isLoading: false }),
}));
vi.mock("@/lib/moduli-vendita", () => ({
  useModuliVisibilita: () => ({ isModuloVisibile: () => true, setModuloVisibile: vi.fn(), isSaving: false, isLoading: false }),
}));
// I modelli dell'azienda stanno anche online; qui il database non c'è e non serve.
vi.mock("@/lib/moduli-vendita/archivioModelli", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/moduli-vendita/archivioModelli")>()),
  sincronizzaModelliAzienda: async (): Promise<void> => undefined,
  modelliDaMandareOnline: () => [] as unknown[],
}));

function apri(ricerca = "") {
  return render(
    <MemoryRouter initialEntries={[`/azienda/impostazioni/template-preventivi?tab=moduli-vendita${ricerca}`]}>
      <ModuleTemplateLibrary renderLegacy={() => <p>Editor online</p>} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.canEdit = true;
  localStorage.clear();
});
afterEach(() => cleanup());

describe("Moduli: la foto in testa a ogni area esiste davvero", () => {
  it.each(SALES_AREAS.map((a) => [a.title, a.id, a.sourceModule] as const))("%s", (_nome, id, modulo) => {
    // Le aree che dividono il preventivatore con un'altra (Pareti e soffitti, Pergole, Facciate, Giardini) portano area=<id>.
    const primaDelModulo = SALES_AREAS.find((a) => a.sourceModule === modulo)!;
    apri(`&modulo=${modulo}${primaDelModulo.id === id ? "" : `&area=${id}`}`);
    const foto = [...document.querySelectorAll("img")].find((i) => (i.getAttribute("alt") ?? "").startsWith("Illustrazione dell'area"));
    expect(foto, "la testata dell'area non ha la foto").toBeTruthy();
    const percorso = foto!.getAttribute("src")!;
    expect(existsSync(join(process.cwd(), "public", percorso)), `manca public${percorso}`).toBe(true);
  });
});

describe("Moduli: il modello dell'area non si apre a chi non può modificare", () => {
  it("scrivendo l'indirizzo a mano (modello=generale) si legge che mancano i permessi", () => {
    state.canEdit = false;
    apri("&modulo=pavimenti&modello=generale");
    expect(screen.queryByText("Editor online")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Non hai i permessi per modificare i modelli");
  });

  it("chi può modificare lo apre", () => {
    apri("&modulo=pavimenti&modello=generale");
    expect(screen.getByText("Editor online")).toBeTruthy();
  });
});
