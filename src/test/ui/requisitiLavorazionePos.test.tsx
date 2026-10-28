import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fontePropria } from "../fixtures/riesameProprioPos";
import {
  posVuoto,
  lavorazioneVuota,
  type PosContenuto,
} from "../../../supabase/functions/_shared/posModello";
const m = vi.hoisted(() => ({ cambiata: false, errore: false }));
vi.mock("@/hooks/useFascicoloCantiere", () => ({
  useFasiFascicolo: () => ({ data: [], isError: false }),
}));
vi.mock("@/hooks/useRequisitiAddetti", () => ({
  useStoricoAddetti: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        id: fontePropria().id,
        fase_id: null,
        dal: "2026-11-10",
        al: "2026-11-15",
        versione: 1,
        dati: { attivita: "TEST uso PLE" },
      },
    ],
  }),
}));
vi.mock("@/hooks/useRiesameProprioPos", () => ({
  useRiesameProprioPos: () => ({
    data: fontePropria(),
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
  useRiesamiPropriPos: (_c: string, _o: string, ids: string[]) =>
    ids.map(() => ({
      data: {
        ...fontePropria(),
        impronta: m.cambiata ? "b".repeat(64) : fontePropria().impronta,
      },
      isLoading: false,
      isFetching: false,
      isError: m.errore,
      error: m.errore ? new Error("TEST fonte cambiata") : null,
    })),
}));
vi.mock("@/components/sicurezza/RiesameProprioPos", () => ({
  RiesameProprioPos: () => <p>TEST dettaglio fonte</p>,
}));
import { RequisitiLavorazionePos } from "@/components/sicurezza/pos/RequisitiLavorazionePos";
function Wrapper({ ro = false }: { ro?: boolean }) {
  const [d, setD] = useState(() => {
    const p = posVuoto();
    p.versione_requisiti_addetti = 1;
    p.opera.data_inizio = "2026-11-01";
    p.opera.data_fine = "2026-11-30";
    p.lavorazioni = [lavorazioneVuota("test")];
    p.lavorazioni[0].titolo = "TEST posa";
    return p;
  });
  const modifica = (fn: (p: PosContenuto) => void) =>
    setD((prev) => {
      const n = structuredClone(prev);
      fn(n);
      return n;
    });
  return (
    <>
      <RequisitiLavorazionePos
        companyId={fontePropria().company_id}
        orderId={fontePropria().order_id}
        d={d}
        l={d.lavorazioni[0]}
        n={0}
        ro={ro}
        modifica={modifica}
      />
      <button
        onClick={() =>
          modifica((p) => {
            p.lavorazioni[0].titolo = "TEST modifica";
          })
        }
      >
        TEST modifica titolo
      </button>
      <button onClick={() => setD((p) => ({ ...p }))}>TEST rilegge</button>
      <output>
        {d.lavorazioni[0].requisiti_addetti?.fonti.length || 0} fonti
        memorizzate
      </output>
    </>
  );
}
afterEach(cleanup);
beforeEach(() => {
  m.cambiata = false;
  m.errore = false;
});
function collega() {
  fireEvent.change(screen.getByLabelText("Gestione requisiti addetti 1"), {
    target: { value: "riesami" },
  });
  fireEvent.change(screen.getByLabelText("Inizio requisiti addetti 1"), {
    target: { value: "2026-11-10" },
  });
  fireEvent.change(screen.getByLabelText("Fine requisiti addetti 1"), {
    target: { value: "2026-11-15" },
  });
  fireEvent.change(screen.getByLabelText("Pertinenza requisiti addetti 1"), {
    target: { value: "TEST attività applicata" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Scegli riesami della commessa" }),
  );
  fireEvent.change(screen.getByLabelText("Riesame dell’attività"), {
    target: { value: fontePropria().id },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: "Collega il riesame della propria impresa",
    }),
  );
}
it("collega soltanto su scelta esplicita e richiede una conferma separata", () => {
  render(<Wrapper />);
  expect(screen.getByText("0 fonti memorizzate")).toBeTruthy();
  expect(screen.getByRole("checkbox")).toBeDisabled();
  collega();
  expect(screen.getByText("1 fonti memorizzate")).toBeTruthy();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("checkbox")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "TEST modifica titolo" }));
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByText(/dopo le modifiche/)).toBeTruthy();
});
it("fonti cambiate o non leggibili non possono essere riconfermate dalla cache", () => {
  render(<Wrapper />);
  collega();
  m.cambiata = true;
  fireEvent.click(screen.getByRole("button", { name: "TEST rilegge" }));
  expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(screen.getByText(/Fonte cambiata: scegli/)).toBeTruthy();
  m.errore = true;
  fireEvent.click(screen.getByRole("button", { name: "TEST rilegge" }));
  expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(screen.getByRole("alert").textContent).toContain(
    "TEST fonte cambiata",
  );
});
it("la sola lettura non offre selezione né scritture di conferma", () => {
  render(<Wrapper ro />);
  expect(
    screen.queryByRole("button", { name: "Scegli riesami della commessa" }),
  ).toBeNull();
  expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(screen.getByLabelText("Gestione requisiti addetti 1")).toBeDisabled();
});
