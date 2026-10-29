import {cleanup, render, screen} from "@testing-library/react";
import {afterEach, expect, it} from "vitest";
import {OrdineAppaltatoreLavoroCard} from "@/components/orders/OrdineAppaltatoreLavoroCard";

afterEach(cleanup);
const base = {
  workAddress: "Via Dante 5, Milano",
  workDescription: "Posa serramenti",
  materialsLocation: "Deposito committente",
  workStartDate: "2026-11-02",
  workEndDate: "2026-11-12",
};

it("a misura dice che l'importo della commessa è una stima", () => {
  render(<OrdineAppaltatoreLavoroCard {...base} valorizzazione="a_misura" tettoImporto={9000} nomeContratto="Accordo 2026" riferimentoCommittente="ORD/4471" />);
  expect(screen.getByText("A misura")).toBeVisible();
  expect(screen.getByText(/è una stima/)).toBeVisible();
  expect(screen.getByText(/Tetto concordato: 9\.000,00/)).toBeVisible();
  expect(screen.getByText("Accordo 2026")).toBeVisible();
  expect(screen.getByText("ORD/4471")).toBeVisible();
});

it("il tetto è un importo: senza il permesso non si vede, il resto sì", () => {
  render(<OrdineAppaltatoreLavoroCard {...base} valorizzazione="a_misura" tettoImporto={9000} mostraImporti={false} />);
  expect(screen.queryByText(/Tetto concordato/)).not.toBeInTheDocument();
  expect(screen.getByText("A misura")).toBeVisible();
  expect(screen.getByText("Via Dante 5, Milano")).toBeVisible();
});

it("a corpo non parla di stime né di tetti", () => {
  render(<OrdineAppaltatoreLavoroCard {...base} valorizzazione="a_corpo" />);
  expect(screen.getByText("A corpo")).toBeVisible();
  expect(screen.getByText("Importo concordato prima.")).toBeVisible();
  expect(screen.queryByText(/Tetto concordato/)).not.toBeInTheDocument();
});

it("una commessa d'appalto vecchia, senza modo di valorizzazione, non mostra righe vuote", () => {
  render(<OrdineAppaltatoreLavoroCard {...base} />);
  expect(screen.queryByText("Come viene pagato")).not.toBeInTheDocument();
  expect(screen.queryByText("Contratto")).not.toBeInTheDocument();
  expect(screen.getByText("Deposito committente")).toBeVisible();
});
