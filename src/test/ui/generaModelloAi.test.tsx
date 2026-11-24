import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { GeneraModelloAi } from "@/components/sopralluoghi/GeneraModelloAi";
import type { TemplateSchema } from "@/types/surveys";

/** «Descrivilo all'AI» (piano sopralluoghi, lotto 6). Funzione finta: nessuna chiamata a pagamento. */
const s = vi.hoisted(() => ({ invoke: vi.fn(), risposta: null as unknown }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: async (...a: unknown[]) => { s.invoke(...a); return s.risposta; } } } }));
beforeEach(() => s.invoke.mockClear());
afterEach(cleanup);

function Prova() {
  const [esito, setEsito] = useState<{ schema: TemplateSchema; avvisi: string[] } | null>(null);
  return <GeneraModelloAi categoria="bagno" esito={esito} onEsito={setEsito} />;
}
const descrivi = () => fireEvent.change(screen.getByLabelText("Cosa deve rilevare il sopralluogo"), { target: { value: "Rifacimento bagno: misure, sanitari, doccia, rivestimenti a mq." } });

it("manda descrizione, azienda e categoria; mostra l'anteprima e le correzioni", async () => {
  s.risposta = { data: { ok: true, avvisi: ["«Apertura» era una scelta senza almeno due opzioni, diventa testo"], schema: {
    area_definition: { label: "Stanza", label_plural: "Stanze" },
    element_types: [{ key: "doccia", label: "Doccia", sections: [{ key: "m", label: "Misure", fields: [{ key: "l", label: "L", type: "dimension" }, { key: "sifone", label: "Sifone", type: "text", solo_tecnico: true }] }] }],
    output_mapping: { estimate_lines: { doccia: { description_template: "Doccia {l}", unit: "pz" } } },
  } }, error: null };
  render(<Prova />);
  expect(screen.getByRole("button", { name: /Genera l'anteprima/ })).toBeDisabled();
  descrivi();
  fireEvent.click(screen.getByRole("button", { name: /Genera l'anteprima/ }));
  await screen.findByText("Doccia");
  expect(s.invoke).toHaveBeenCalledWith("ai-genera-modello-sopralluogo", { body: { company_id: "az", descrizione: "Rifacimento bagno: misure, sanitari, doccia, rivestimenti a mq.", categoria: "bagno" } });
  expect(screen.getByText(/2 campi, 1 solo per il tecnico, riga di preventivo/)).toBeTruthy();
  expect(screen.getByText("1 correzioni fatte alla risposta dell'AI")).toBeTruthy();
});

it("l'errore della funzione arriva a chi la usa", async () => {
  s.risposta = { data: { ok: false, error: "Credito AI esaurito: ricarica per generare il modello." }, error: null };
  render(<Prova />);
  descrivi();
  fireEvent.click(screen.getByRole("button", { name: /Genera l'anteprima/ }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Credito AI esaurito: ricarica per generare il modello."));
});
