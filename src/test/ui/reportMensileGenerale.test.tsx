import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReportMensile } from "@/components/orders/generali/investitori/ReportMensile";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
const m = vi.hoisted(() => ({
  approvata: true,
  corrente: false,
  aggiornataIl: "2026-10-05T15:00:00Z",
  oneri: false,
  invalida: false,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { name: "Società dell'operazione" } }),
}));
vi.mock("@/hooks/useUnitaDalPiano", () => ({ useUnitaDalPiano: (): null => null }));
vi.mock("@/hooks/useGeneralePiano", () => ({
  useGeneralePianoNumeri: () =>
    m.corrente
      ? {
          inVista: { stato: "approvata", numero: 3 },
          piano: {
            budgetCompleto: true,
            calendarioCompleto: true,
            confronto: {
              totali: {
                costi: { previsto: 1000, stima: 1300 },
                ricavi: { previsto: 2000, stima: 2000 },
              },
            },
            capitale: { massimoPrevisto: 1000, investitoOggi: 200 },
          },
        }
      : { piano: null, inVista: null },
  useFotografieGenerale: () => ({
    data: [
      {
        mese: "2026-10",
        aggiornataIl: m.aggiornataIl,
        versioneStato: m.approvata ? "approvata" : "bozza",
        costiPrevisti: 1000,
        costiStima: 1200,
        ricaviPrevisti: 2000,
        ricaviStima: m.invalida ? NaN : 2000,
        capitaleMassimoPrevisto: 1000,
        capitaleInvestito: 200,
      },
    ],
    isError: false,
  }),
}));
vi.mock("@/hooks/useGeneraleInvestitori", () => ({
  useFontiGenerale: () => ({
    data: [{ id: "socio", nome: "Investitore" }],
    isError: false,
  }),
  useMovimentiFonti: () => ({
    data: [
      {
        fonteId: "socio",
        tipo: "versamento",
        data: "2026-10-01",
        importo: 100,
      },
      {
        fonteId: "socio",
        tipo: "versamento",
        data: "2026-10-06",
        importo: 9999,
      },
      {
        fonteId: "socio",
        tipo: "versamento",
        data: "2026-10-01",
        importo: 777,
        nota: "[EIC:MOVIMENTO_PREVISTO]",
      },
      ...(m.oneri
        ? [
            {
              fonteId: "socio",
              tipo: "interessi",
              data: "2027-12-31",
              importo: 31875,
              nota: null,
            },
            {
              fonteId: "socio",
              tipo: "spese",
              data: "2027-03-01",
              importo: 12000,
              nota: "[EIC:MOVIMENTO_PREVISTO]",
            },
          ]
        : []),
    ],
    isError: false,
  }),
}));
beforeEach(() => {
  m.approvata = true;
  m.corrente = false;
  m.aggiornataIl = "2026-10-05T15:00:00Z";
  m.oneri = false;
  m.invalida = false;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T10:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const r = {
  generale: { id: "g", nome: "Residenza", codice: "O-1" },
} as RiepilogoGenerale;
it("apre il periodo passato richiesto dall’Andamento senza sostituirlo con quello corrente", () => {
  render(
    <ReportMensile riepilogo={r} meseIniziale="2026-10" apertoInizialmente />,
  );
  expect(screen.getByLabelText("Periodo rendiconto investitori")).toHaveValue(
    "2026-10",
  );
  expect(
    screen.getByText(/Capitale riferito al 2026-10-05/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Scarica rendiconto del periodo" }),
  ).toBeEnabled();
});
it("non usa un mese futuro o malformato ricevuto dal collegamento", () => {
  render(
    <ReportMensile riepilogo={r} meseIniziale="2027-13" apertoInizialmente />,
  );
  expect(screen.getByLabelText("Periodo rendiconto investitori")).toHaveValue(
    "2026-11",
  );
});
it("usa la data della fotografia anche per il capitale: esclude versamenti successivi", () => {
  render(<ReportMensile riepilogo={r} />);
  fireEvent.change(screen.getByLabelText("Periodo rendiconto investitori"), {
    target: { value: "2026-10" },
  });
  expect(
    screen.getByText(/Capitale riferito al 2026-10-05/),
  ).toBeInTheDocument();
  expect(screen.getByText(/Versato 100/)).toBeInTheDocument();
  expect(screen.queryByText(/9\.999/)).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Scarica rendiconto del periodo",
      hidden: true,
    }),
  ).toBeEnabled();
});
it("blocca l'esportazione se la fotografia non ha un budget approvato", () => {
  m.approvata = false;
  render(<ReportMensile riepilogo={r} />);
  fireEvent.change(screen.getByLabelText("Periodo rendiconto investitori"), {
    target: { value: "2026-10" },
  });
  expect(
    screen.getByRole("button", {
      name: "Scarica rendiconto del periodo",
      hidden: true,
    }),
  ).toBeDisabled();
});
it("il report corrente usa il piano approvato aggiornato a oggi e non una vecchia fotografia", () => {
  m.corrente = true;
  render(<ReportMensile riepilogo={r} />);
  expect(
    screen.getByText(/Capitale riferito al 2026-11-11/),
  ).toBeInTheDocument();
  expect(screen.getByText(/stima finale 1\.300/)).toBeInTheDocument();
  expect(screen.getByText(/Versato 10.099/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Scarica rendiconto del periodo",
      hidden: true,
    }),
  ).toBeEnabled();
});

it("gli oneri futuri restano previsti e non bloccano una fotografia approvata valida", () => {
  m.oneri = true;
  render(
    <ReportMensile riepilogo={r} meseIniziale="2026-10" apertoInizialmente />,
  );
  expect(
    screen.getByText(/Oneri finanziari ancora previsti: 43.875/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Scarica rendiconto del periodo" }),
  ).toBeEnabled();
  expect(screen.getByText(/Versato 100/)).toBeInTheDocument();
});

it("una rettifica successiva non include i movimenti dei mesi dopo la fotografia", () => {
  m.aggiornataIl = "2026-11-11T12:00:00Z";
  render(
    <ReportMensile riepilogo={r} meseIniziale="2026-10" apertoInizialmente />,
  );
  expect(
    screen.getByText(/Capitale riferito al 2026-10-31/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Scarica rendiconto del periodo" }),
  ).toBeEnabled();
});

it("blocca una fotografia con valori non validi anche se approvata", () => {
  m.invalida = true;
  render(
    <ReportMensile riepilogo={r} meseIniziale="2026-10" apertoInizialmente />,
  );
  expect(
    screen.getByRole("button", { name: "Scarica rendiconto del periodo" }),
  ).toBeDisabled();
});
