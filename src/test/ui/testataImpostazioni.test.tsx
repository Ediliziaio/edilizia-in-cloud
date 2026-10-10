/**
 * La testata di ogni pagina delle impostazioni: il titolo è il nome che la pagina ha nel menu e la frase dice a cosa
 * serve.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SettingsLayout } from "@/components/layouts/SettingsLayout";

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true, isLoading: false }) }));
vi.mock("@/hooks/useStatoPiano", () => ({ useStatoPiano: () => ({ stato: { tuttoVisibile: true } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function apri(percorso: string) {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Routes>
        <Route path="/azienda/impostazioni" element={<SettingsLayout />}>
          <Route index element={<p>L'elenco</p>} />
          <Route path=":pagina" element={<p>La pagina</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByRole("heading", { level: 1 }).textContent;
}
const frase = () => document.querySelector("p.text-muted-foreground")?.textContent;

describe("testata delle impostazioni", () => {
  it.each([
    ["preferenze-email", "Email dell'azienda", "Nome del mittente, risposte, logo e colori delle email aziendali"],
    ["ai-automazioni", "Cosa fa Silvio da solo", "Per ogni azione scegli se Silvio la propone, chiede conferma o la esegue"],
    ["ai-test-lab", "AI Test Lab", "Confronto di costo, velocità e qualità dei modelli AI. Solo azienda dimostrativa"],
    ["listini-serramenti", "Listini serramenti", "Fornitori di infissi, sconti di default e matrice dei prezzi"],
    ["crediti", "Crediti e ricariche", "Il saldo per AI, email, WhatsApp e SMS; la ricarica anche automatica"],
    ["fatturazione", "Fatturazione", "Come fatturi: con un altro programma o con Edilizia in Cloud, e i dati che escono sulle fatture"],
    ["notifiche", "Notifiche", "Quali avvisi ricevi, su quale dispositivo e in quali orari"],
  ])("%s", (pagina, titolo, descrizione) => {
    expect(apri(`/azienda/impostazioni/${pagina}`)).toBe(titolo);
    expect(frase()).toBe(descrizione);
  });

  it("le pagine con le schede hanno il titolo del gruppo, con la sua frase", () => {
    expect(apri("/azienda/impostazioni/margini")).toBe("Modelli di preventivo");
    expect(frase()).toMatch(/^Come è fatto il preventivo/);
  });

  it("l'elenco delle impostazioni ha il titolo di sempre", () => {
    expect(apri("/azienda/impostazioni")).toBe("Impostazioni");
  });

  it("la pagina senza titolo loro (il Bot WhatsApp «classico») mostra «Impostazioni»", () => {
    expect(apri("/azienda/impostazioni/whatsapp-bot")).toBe("Impostazioni");
  });
});
