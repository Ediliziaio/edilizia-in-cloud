import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-a" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = { select: () => catena, eq: () => catena, order: async () => ({ data: [{ id: "f1", name: "Benvenuto", status: "published", version: 1 }], error: null as null }) };
  return { supabase: { from: () => catena } };
});

import { StepReview } from "@/components/shared/import-wizard/StepReview";

const base = {
  objectType: "contacts" as const, fields: [] as never[], fileHeaders: [] as string[], fileRows: [] as string[][], mapping: {}, fileName: "lista.csv", fileSize: 10,
  importMode: "create" as const, consent: false, onConsentChange: vi.fn(), isImporting: false,
};
const avvolgi = (el: ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);
afterEach(cleanup);

describe("fine importazione", () => {
  it("il riepilogo non è un errore e le righe doppie sono avvisi a parte", () => {
    avvolgi(<StepReview {...base} result={{ success: 20, errors: [], creati: 20, avvisi: ["Riga 17: è lo stesso contatto della riga 9 (stessa email e stesso telefono), importato una volta sola"], fatto: ["20 contatti entrati nell'automazione «Benvenuto»"] }} />);
    expect(screen.getByText(/Importazione completata: 20 contatti/)).toBeTruthy();
    expect(screen.getByText("20 nuovi")).toBeTruthy();
    expect(screen.getByText("1 riga non importata perché doppia")).toBeTruthy();
    expect(screen.queryByText(/errore/)).toBeNull();
    expect(screen.getByText(/entrati nell'automazione «Benvenuto»/)).toBeTruthy();
  });
});

describe("passo 4: etichette e automazioni", () => {
  it("si scelgono etichette e automazioni per i contatti importati", async () => {
    const onEtichette = vi.fn();
    const onAutomazioni = vi.fn();
    avvolgi(<StepReview {...base} result={null} opzioni={{ etichette: [], onEtichetteChange: onEtichette, automazioni: [], onAutomazioniChange: onAutomazioni }} />);
    const campo = screen.getByLabelText("Nuova etichetta");
    fireEvent.change(campo, { target: { value: "Fiera 2026" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onEtichette).toHaveBeenCalledWith(["Fiera 2026"]);
    const voce = await screen.findByText("Benvenuto");
    fireEvent.click(voce.closest("label")!.querySelector('[role="checkbox"]')!);
    expect(onAutomazioni).toHaveBeenCalledWith([{ id: "f1", nome: "Benvenuto" }]);
  });

  it("senza opzioni (opportunità) il riquadro non c'è", () => {
    avvolgi(<StepReview {...base} objectType="opportunities" result={null} />);
    expect(screen.queryByText("Dopo l'importazione")).toBeNull();
  });
});
