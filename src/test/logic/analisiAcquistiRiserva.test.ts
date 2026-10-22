import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({}) }));

import { funzioneMancante } from "@/hooks/useProcurementAnalysis";

describe("analisi acquisti: riserva finché la funzione SQL non c'è", () => {
  it("riconosce la funzione mancante e lascia passare gli altri errori", () => {
    expect(funzioneMancante({ code: "PGRST202", message: "Could not find the function public.analisi_acquisti" })).toBe(true);
    expect(funzioneMancante({ code: "42883", message: "function does not exist" })).toBe(true);
    expect(funzioneMancante({ code: "42501", message: "Non puoi vedere i costi" })).toBe(false);
    expect(funzioneMancante(null)).toBe(false);
  });
});
