import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DiscountRule } from "@/hooks/useDiscountRules";

/**
 * ScontoGlobaleField è il controllo condiviso che porta le regole di scontistica
 * nei dieci preventivatori. Qui si verifica la cosa che conta: uno sconto oltre
 * il massimo NON arriva al preventivo, e lo dice invece di correggersi da solo.
 */

const regoleMock = vi.hoisted(() => ({ value: [] as DiscountRule[] }));
const permessiMock = vi.hoisted(() => ({ canApproveDiscounts: false }));

vi.mock("@/hooks/useDiscountRules", () => ({
  useDiscountRules: () => ({ data: regoleMock.value }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => permessiMock,
}));

const { ScontoGlobaleField } = await import("@/components/preventivi/ScontoGlobaleField");

function regola(patch: Partial<DiscountRule>): DiscountRule {
  return {
    id: "r1", company_id: "c1", name: "Standard", scope: "globale",
    salesperson_id: null, client_category: null, tipo_lavoro: null,
    importo_min: null, importo_max: null, margine_min_pct: 0,
    sconto_max_pct: 10, approva_oltre_pct: null, priority: 100, is_active: true,
    created_at: "2026-01-01", updated_at: "2026-01-01",
    ...patch,
  };
}

function render(onCommit: ReturnType<typeof vi.fn>, value = 0) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const disegna = (v: number) => {
    act(() => {
      root.render(
        <ScontoGlobaleField
          id="test-sconto"
          value={v}
          onCommit={onCommit}
          imponibileLordo={20_000}
          tipoLavoro="bagni"
        />,
      );
    });
  };
  disegna(value);
  return {
    container,
    // Il campo è controllato dal wizard: qui simuliamo il genitore che riscrive
    // il valore appena accettato, com'è nei verticali veri.
    rerender: disegna,
    cleanup: () => { act(() => root.unmount()); container.remove(); },
  };
}

function scrivi(container: HTMLElement, testo: string) {
  // Selettore per tag: `#id` in jsdom si appoggia alla mappa degli id del
  // documento, che con più root montate nello stesso body non è affidabile.
  const input = container.querySelector<HTMLInputElement>("input");
  if (!input) throw new Error("input dello sconto non trovato");
  // Il setter va preso dal prototipo dell'elemento stesso: prenderlo da
  // `window.HTMLInputElement` fallisce se il documento non è lo stesso realm.
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value",
  )!.set!;
  act(() => {
    setter.call(input, testo);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}

beforeEach(() => {
  regoleMock.value = [regola({ sconto_max_pct: 15, approva_oltre_pct: 8 })];
  permessiMock.canApproveDiscounts = false;
});

describe("ScontoGlobaleField", () => {
  it("mostra il massimo consentito che deriva dalle regole", () => {
    const onCommit = vi.fn();
    const { container, cleanup } = render(onCommit);
    expect(container.textContent).toContain("max 15.0%");
    cleanup();
  });

  it("uno sconto entro il limite arriva al preventivo", () => {
    const onCommit = vi.fn();
    const { container, cleanup } = render(onCommit);
    scrivi(container, "5");
    expect(onCommit).toHaveBeenCalledWith(5);
    cleanup();
  });

  it("uno sconto oltre il massimo NON arriva al preventivo e lo dichiara", () => {
    const onCommit = vi.fn();
    const { container, cleanup } = render(onCommit);
    scrivi(container, "60");
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Oltre il massimo consentito");
    // resta a schermo quello che l'utente ha scritto: non lo si corregge di nascosto
    expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("60");
    cleanup();
  });

  it("«Porta al massimo» applica esattamente il massimo", () => {
    const onCommit = vi.fn();
    const { container, cleanup } = render(onCommit);
    scrivi(container, "60");
    const bottone = Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Porta a"))!;
    act(() => { bottone.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(onCommit).toHaveBeenCalledWith(15);
    cleanup();
  });

  it("fra soglia e massimo passa, ma avvisa che serve l'approvazione", () => {
    const onCommit = vi.fn();
    const { container, rerender, cleanup } = render(onCommit);
    scrivi(container, "12");
    expect(onCommit).toHaveBeenCalledWith(12);
    rerender(12); // il wizard salva e ridisegna col nuovo valore
    expect(container.textContent).toContain("approvazione del titolare");
    cleanup();
  });

  it("chi può approvare sconti non viene bloccato", () => {
    permessiMock.canApproveDiscounts = true;
    const onCommit = vi.fn();
    const { container, cleanup } = render(onCommit);
    scrivi(container, "60");
    expect(onCommit).toHaveBeenCalledWith(60);
    expect(container.textContent).not.toContain("Oltre il massimo consentito");
    cleanup();
  });

  it("senza regole configurate vale il massimo predefinito e lo dice", () => {
    regoleMock.value = [];
    const onCommit = vi.fn();
    const { container, cleanup } = render(onCommit);
    expect(container.textContent).toContain("max 10.0%");
    expect(container.textContent).toContain("Nessuna regola di scontistica configurata");
    scrivi(container, "11");
    expect(onCommit).not.toHaveBeenCalled();
    cleanup();
  });

  it("una regola di un altro verticale non tocca questo", () => {
    regoleMock.value = [regola({ sconto_max_pct: 40, tipo_lavoro: "tetti" })];
    const onCommit = vi.fn();
    const { container, cleanup } = render(onCommit);
    // tipoLavoro="bagni" → la regola dei tetti non matcha, resta il predefinito
    expect(container.textContent).toContain("max 10.0%");
    cleanup();
  });
});
