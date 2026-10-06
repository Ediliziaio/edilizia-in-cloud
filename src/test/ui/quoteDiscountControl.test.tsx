import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Lo sconto del preventivo in modifica (QuoteDiscountControl), provato come lo
 * usa chi lo scrive: un numero nel campo, o il cursore. Lo sconto non può
 * essere negativo (sarebbe un sovrapprezzo scritto come «Sconto») né superare
 * il limite di chi lo imposta; un campo svuotato vale zero.
 */

const permessi = { canApproveDiscounts: false };
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi }));
vi.mock("@/hooks/useDiscountRules", () => ({
  useComputeMaxDiscount: () => ({
    isLoading: false,
    data: { max_sconto_pct: 10, approva_oltre_pct: null as number | null, margine_pct_pre: 30, applied_rules: [] as string[], total: 1000 },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
// Il cursore vero (Radix) vuole ResizeObserver: qui basta un campo che dice lo stesso valore.
vi.mock("@/components/ui/slider", () => ({
  Slider: ({ value, onValueChange }: { value: number[]; onValueChange: (v: number[]) => void }) => (
    <input aria-label="cursore" type="range" min={-50} max={500} value={value[0]} onChange={(e) => onValueChange([Number(e.target.value)])} />
  ),
}));

import { QuoteDiscountControl } from "@/components/preventivi/QuoteDiscountControl";

function Editor({ iniziale = 5 }: { iniziale?: number }) {
  const [sconto, setSconto] = useState(iniziale);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <QuoteDiscountControl quoteId="q1" currentDiscount={sconto} onDiscountChange={setSconto} />
      <output data-testid="sconto">{String(sconto)}</output>
    </QueryClientProvider>
  );
}

const scontoSalvato = () => Number(screen.getByTestId("sconto").textContent);
const campo = () => screen.getAllByRole("spinbutton")[0] as HTMLInputElement;

beforeEach(() => { permessi.canApproveDiscounts = false; });
afterEach(cleanup);

describe("sconto del preventivo: valori ammessi", () => {
  it.each(["-5", "-20", "-0.5"])("scrivere %s non fa un sovrapprezzo: vale 0", (testo) => {
    render(<Editor />);
    fireEvent.change(campo(), { target: { value: testo } });
    expect(scontoSalvato()).toBe(0);
    expect(Object.is(scontoSalvato(), -0)).toBe(false);
  });

  it("il cursore non scende sotto zero", () => {
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("cursore"), { target: { value: "-30" } });
    expect(scontoSalvato()).toBe(0);
  });

  it("campo svuotato: zero, mai NaN", () => {
    render(<Editor />);
    fireEvent.change(campo(), { target: { value: "" } });
    expect(scontoSalvato()).toBe(0);
  });

  it("chi non può approvare resta nel limite consentito (10%)", () => {
    render(<Editor />);
    fireEvent.change(campo(), { target: { value: "50" } });
    expect(scontoSalvato()).toBe(10);
    fireEvent.change(campo(), { target: { value: "7.5" } });
    expect(scontoSalvato()).toBe(7.5);
  });

  it("chi può approvare arriva al 100%, non oltre, e nemmeno sotto zero", () => {
    permessi.canApproveDiscounts = true;
    render(<Editor />);
    fireEvent.change(campo(), { target: { value: "150" } });
    expect(scontoSalvato()).toBe(100);
    fireEvent.change(campo(), { target: { value: "-1" } });
    expect(scontoSalvato()).toBe(0);
    fireEvent.change(campo(), { target: { value: "12.5" } });
    expect(scontoSalvato()).toBe(12.5);
  });
});
