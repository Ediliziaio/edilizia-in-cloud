/**
 * `useSalvaUscendo`: allo smontaggio della pagina, se c'è una modifica non ancora salvata
 * (e il preventivo esiste già) la invia, con i valori più recenti; altrimenti non fa niente.
 * E tutti gli otto wizard dei preventivi edili lo usano.
 */
import { renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { useSalvaUscendo } from "@/hooks/useSalvaUscendo";

type Modulo = { cliente_nome?: string; sconto_pct?: number };
type Props = { id: string | undefined; dirty: boolean; form: Modulo };

const monta = (iniziale: Props, salva = vi.fn((_: Modulo & { id: string }) => Promise.resolve({ ok: true }))) => {
  const vista = renderHook((p: Props) => useSalvaUscendo<Modulo>({ ...p, salva }), { initialProps: iniziale });
  return { ...vista, salva };
};

describe("useSalvaUscendo", () => {
  it("con modifiche in sospeso e il preventivo creato, uscendo invia i valori più recenti, una volta sola", () => {
    const { rerender, unmount, salva } = monta({ id: "p1", dirty: true, form: { cliente_nome: "Mario" } });
    rerender({ id: "p1", dirty: true, form: { cliente_nome: "Luigi", sconto_pct: 7.5 } });
    expect(salva).not.toHaveBeenCalled(); // finché la pagina c'è decide l'autosave
    unmount();
    expect(salva).toHaveBeenCalledTimes(1);
    expect(salva).toHaveBeenCalledWith({ cliente_nome: "Luigi", sconto_pct: 7.5, id: "p1" });
  });

  it("senza modifiche in sospeso non invia niente", () => {
    const { unmount, salva } = monta({ id: "p1", dirty: false, form: { cliente_nome: "Mario" } });
    unmount();
    expect(salva).not.toHaveBeenCalled();
  });

  it("se l'autosave nel frattempo ha salvato (dirty torna falso) non invia niente", () => {
    const { rerender, unmount, salva } = monta({ id: "p1", dirty: true, form: { cliente_nome: "Mario" } });
    rerender({ id: "p1", dirty: false, form: { cliente_nome: "Mario" } });
    unmount();
    expect(salva).not.toHaveBeenCalled();
  });

  it("un preventivo non ancora creato non si salva da qui", () => {
    const { unmount, salva } = monta({ id: undefined, dirty: true, form: { cliente_nome: "Mario" } });
    unmount();
    expect(salva).not.toHaveBeenCalled();
  });

  it("se l'invio fallisce non lancia niente (la pagina non c'è più)", async () => {
    const salva = vi.fn((_: Modulo & { id: string }) => Promise.reject(new Error("rete assente")));
    const { unmount } = monta({ id: "p1", dirty: true, form: { cliente_nome: "Mario" } }, salva);
    expect(() => unmount()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(salva).toHaveBeenCalledTimes(1); // l'errore è stato assorbito: nessun rifiuto non gestito
  });
});

describe("gli otto wizard dei preventivi edili salvano uscendo", () => {
  const WIZARD = [
    "bagni/BagniWizard", "tetti/TettiWizard", "climatizzazione/ClimatizzazioneWizard", "elettrico/ElettricoWizard",
    "termoidraulico/TermoidraulicoWizard", "pavimenti/PavimentiWizard", "piscine/PiscineWizard", "ristrutturazione/RistrutturazioneWizard",
  ];
  it.each(WIZARD)("%s usa useSalvaUscendo con il suo salvataggio", (percorso) => {
    const sorgente = readFileSync(join(__dirname, `../../../pages/azienda/${percorso}.tsx`), "utf8");
    expect(sorgente).toContain('import { useSalvaUscendo } from "@/hooks/useSalvaUscendo";');
    expect(sorgente).toContain("useSalvaUscendo({ id, dirty, form, salva: upsertMut.mutateAsync });");
  });
});
