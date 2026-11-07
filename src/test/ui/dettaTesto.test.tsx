/**
 * Il bottone «Detta» (07/11/2026): il testo pulito si aggiunge in fondo al
 * campo, la persona viene invitata a controllarlo e può tornare al grezzo.
 */
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const finto = vi.hoisted(() => ({ esito: null as null | { trascrizione: string; testo: string; pulito: boolean } }));
vi.mock("@/hooks/campo/useDettaTesto", () => ({
  useDettaTesto: () => ({ detta: async () => finto.esito, lavoro: "fermo", errore: null as null | { messaggio: string }, pulisciErrore: (): void => undefined }),
}));
// Il registratore vero lo provano i suoi test: qui basta che consegni un audio.
vi.mock("@/components/campo/CampoAudioRecorder", () => ({
  default: ({ onConfirm }: { onConfirm: (b: Blob, d: number, m: string) => Promise<void> }) => (
    <button type="button" onClick={() => onConfirm(new Blob(["a"]), 5, "audio/webm")}>Trascrivi</button>
  ),
}));
import { DettaTesto } from "@/components/campo/DettaTesto";

afterEach(cleanup);

function Campo({ iniziale }: { iniziale: string }) {
  const [v, setV] = useState(iniziale);
  return <><textarea aria-label="campo" value={v} readOnly /><DettaTesto value={v} onChange={setV} companyId="az" contesto="rapportino" campo="descrizione" etichetta="Descrizione" /></>;
}

it("aggiunge il pulito in fondo, chiede di controllarlo e permette di tornare al grezzo", async () => {
  finto.esito = { trascrizione: "ehm posato il telaio", testo: "Posato il telaio.", pulito: true };
  render(<Campo iniziale="Montato il ponteggio." />);
  fireEvent.click(screen.getByRole("button", { name: "Detta: Descrizione" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Trascrivi" })));
  expect(screen.getByLabelText("campo")).toHaveValue("Montato il ponteggio.\nPosato il telaio.");
  expect(screen.getByRole("status")).toHaveTextContent("Ecco il testo, controllalo");
  fireEvent.click(screen.getByRole("button", { name: "Usa la trascrizione originale" }));
  expect(screen.getByLabelText("campo")).toHaveValue("Montato il ponteggio.\nehm posato il telaio");
  expect(screen.queryByRole("button", { name: "Usa la trascrizione originale" })).toBeNull();
});

it("se la pulizia non è riuscita lo dice e non offre il grezzo (è già il grezzo)", async () => {
  finto.esito = { trascrizione: "ehm posato il telaio", testo: "ehm posato il telaio", pulito: false };
  render(<Campo iniziale="" />);
  fireEvent.click(screen.getByRole("button", { name: "Detta: Descrizione" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Trascrivi" })));
  expect(screen.getByLabelText("campo")).toHaveValue("ehm posato il telaio");
  expect(screen.getByRole("status")).toHaveTextContent("così com’è");
  expect(screen.queryByRole("button", { name: "Usa la trascrizione originale" })).toBeNull();
});
