import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { SubappaltoLavorazioni } from "@/components/orders/SubappaltoLavorazioni";
import type { AffidaContrattoDaCommessa } from "@/components/orders/AffidaContrattoDialog";
import type { AffidamentoChiFaCosa } from "@/lib/subappaltatori/affidamentiCommessa";
import type { ContrattoFlusso } from "@/lib/subappaltatori/flussoCommessa";
import type { OperazioneSubappalto, RichiestaDaLavorazioni } from "@/lib/subappaltatori/richiesteDaLavorazioni";

const stubs = vi.hoisted(() => ({
  richieste: [] as RichiestaDaLavorazioni[],
  aggiorna: vi.fn(),
  editor: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "utente" }, effectiveCompany: { id: "azienda" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useVociPrevisteFasi", () => ({ useVociPrevisteFasi: () => ({ data: [{ id: "scavo", quantita: 10, unita: "m³" }] }) }));
vi.mock("@/hooks/useDatiAffidaContratto", () => ({ useDatiAffidaContratto: () => ({ data: { contratti: [] as ContrattoFlusso[] } }) }));
vi.mock("@/components/orders/AffidaVociDialog", () => ({ useAffidamentiCommessa: () => ({ data: [] as AffidamentoChiFaCosa[] }) }));
vi.mock("@/hooks/useRegistroSubappaltoLocale", async () => {
  const { useState } = await import("react");
  return { useRegistroSubappaltoLocale: () => {
    const [richieste, setRichieste] = useState(stubs.richieste);
    return {
      disponibile: true, registro: { richieste, interne: [] as string[] },
      aggiorna: async (op: OperazioneSubappalto) => {
        stubs.aggiorna(op);
        if (op.tipo === "crea") setRichieste((precedenti) => [op.richiesta, ...precedenti]);
        if (op.tipo === "offerta") setRichieste((precedenti) => precedenti.map((r) => r.id === op.id ? { ...r, offerta: op.offerta } : r));
      },
    };
  } };
});
vi.mock("@/components/orders/AffidaContrattoDialog", () => ({
  AffidaContrattoDaCommessa: ({ partenza, suRichiesta }: ComponentProps<typeof AffidaContrattoDaCommessa>) => {
    stubs.editor(partenza);
    return <button onClick={() => void suRichiesta?.(richiesta)}>Salva bozza</button>;
  },
}));
vi.mock("@/components/orders/ComputoSubappaltoAnteprima", () => ({
  ComputoSubappaltoAnteprima: () => <p>Anteprima della richiesta</p>,
}));
vi.mock("@/components/orders/ContrattiSubappaltoCommessa", () => ({
  ContrattiSubappaltoCommessa: ({ contrattoAperto }: { contrattoAperto?: string }) => <p>Contratto aperto {contrattoAperto}</p>,
}));

const fase = { id: "demolizioni", nome: "Demolizioni", faseId: "demolizioni" };
const voce = { id: "v:scavo", nome: "Scavo", faseId: fase.id, voceId: "scavo" };
const richiesta: RichiestaDaLavorazioni = {
  id: "preventivo-1", dittaId: "alfa", ditta: "Impresa Alfa", creataIl: "2026-01-02T09:00:00Z",
  periodo: { dal: null, al: null },
  righe: [
    { id: "scavo", ambito: voce.id, faseId: fase.id, fase: fase.nome, descrizione: voce.nome, quantita: 10, unita: "m³", comprende: "posa" },
    { id: "trasporto", ambito: "v:trasporto", faseId: fase.id, fase: fase.nome, descrizione: "Trasporto", quantita: 2, unita: "viaggi", comprende: "posa" },
  ],
};
const disegna = (apertura?: ComponentProps<typeof SubappaltoLavorazioni>["apertura"]) =>
  render(<SubappaltoLavorazioni companyId="azienda" orderId="commessa" ambiti={[fase]} albero={[fase, voce]} apertura={apertura} />);

beforeEach(() => { stubs.richieste = []; stubs.aggiorna.mockClear(); stubs.editor.mockClear(); });
afterEach(cleanup);

it("avvia la richiesta dalle lavorazioni selezionate e dopo il salvataggio mostra la bozza pronta per l’email", async () => {
  disegna("nuova-richiesta");
  expect(screen.getByRole("heading", { name: "Nuova richiesta di preventivo" })).toBeVisible();
  expect(stubs.editor).toHaveBeenLastCalledWith(expect.objectContaining({ soloRichiesta: true, voci: ["scavo"] }));
  fireEvent.click(screen.getByRole("button", { name: "Salva bozza" }));
  const scheda = await screen.findByRole("article", { name: "Richiesta per Impresa Alfa" });
  expect(screen.getByRole("tab", { name: /Richieste d’offerta/, selected: true })).toBeVisible();
  expect(within(scheda).getByRole("heading", { name: "Impresa Alfa" })).toHaveFocus();
  expect(within(scheda).getByRole("button", { name: "Prepara email" })).toBeEnabled();
  expect(stubs.aggiorna).toHaveBeenCalledExactlyOnceWith({ tipo: "crea", richiesta });
});

it("mostra lo storico della commessa anche cambiando la fase selezionata", () => {
  stubs.richieste = [{ ...richiesta, righe: [{ ...richiesta.righe[0], ambito: "v:muro", faseId: "murature" }] }];
  disegna();
  expect(screen.getByRole("article", { name: "Richiesta per Impresa Alfa" })).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: "Solo le lavorazioni selezionate" }));
  expect(screen.getByText("Nessuna richiesta per le lavorazioni selezionate.")).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: "Solo le lavorazioni selezionate" }));
  expect(screen.getByRole("article", { name: "Richiesta per Impresa Alfa" })).toBeVisible();
});

it("registra anche un’offerta parziale e prepara il contratto con le sole voci quotate", async () => {
  stubs.richieste = [{ ...richiesta, inviataIl: "2026-01-03T10:00:00Z" }];
  disegna();
  const scheda = screen.getByRole("article", { name: "Richiesta per Impresa Alfa" });
  fireEvent.click(within(scheda).getByRole("button", { name: "Registra offerta" }));
  fireEvent.change(within(scheda).getByRole("textbox", { name: "Prezzo offerto per Scavo" }), { target: { value: "18,75" } });
  fireEvent.click(within(scheda).getByRole("button", { name: "Salva offerta" }));
  fireEvent.click(await within(scheda).findByRole("button", { name: "Prepara contratto" }));
  expect(stubs.editor).toHaveBeenLastCalledWith(expect.objectContaining({
    voci: ["scavo"],
    offerta: expect.objectContaining({ offerta: expect.objectContaining({ prezzi: { scavo: 18.75 } }) }),
  }));
});

it("apre il contratto collegato dalla richiesta", () => {
  stubs.richieste = [{ ...richiesta, contrattoId: "c1" }];
  disegna();
  fireEvent.click(screen.getByRole("button", { name: "Apri contratto" }));
  expect(screen.getByRole("tab", { name: "Contratti", selected: true })).toBeVisible();
  expect(screen.getByText("Contratto aperto c1")).toBeVisible();
});
