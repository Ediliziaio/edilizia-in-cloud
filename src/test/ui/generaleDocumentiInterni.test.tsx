import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { DocumentiInPopup } from "@/components/orders/DocumentiInPopup";
import {
  AspettoOperativoProvider,
  PaginaDocumentoGenerale,
} from "@/components/orders/generali/design/ContestoOperativo";

vi.mock("@/pages/azienda/PurchaseOrderDetail", async () => {
  const { useIdDocumento, useNavigaDocumento, useParametriDocumento } =
    await import("@/lib/orders/documentoPopup");
  return {
    default: () => {
      const id = useIdDocumento("id-della-route");
      const vai = useNavigaDocumento();
      const parametri = useParametriDocumento();
      return (
        <>
          <p>Ordine aperto: {id}</p>
          {parametri.get("arrivo") === "1" && <p>Arrivo pronto</p>}
          <button onClick={() => vai("/azienda/ddt/ddt-collegato")}>
            Apri DDT collegato
          </button>
        </>
      );
    },
  };
});
vi.mock("@/pages/azienda/DDTRicezioneDetail", async () => {
  const { useIdDocumento, useNavigaDocumento } = await import(
    "@/lib/orders/documentoPopup"
  );
  return {
    default: () => {
      const id = useIdDocumento("id-della-route");
      const vai = useNavigaDocumento();
      return (
        <>
          <p>DDT aperto: {id}</p>
          <button onClick={() => vai("/azienda/ordini/g")}>
            Torna al cantiere
          </button>
        </>
      );
    },
  };
});
afterEach(cleanup);

function Posizione() {
  return <output aria-label="Pagina corrente">{useLocation().pathname}</output>;
}
function apri() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/azienda/ordini/g?scheda=cantiere"]}>
        <AspettoOperativoProvider
          value={{ generaleId: "a9d5ac5a-57b7-4bb4-8539-4d9c683e0d5a" }}
        >
          <Posizione />
          <DocumentiInPopup orderId="g">
            <Link to="/azienda/ordini-acquisto/ordine-collegato?arrivo=1">
              Merce arrivata
            </Link>
          </DocumentiInPopup>
        </AspettoOperativoProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("apre ordine e DDT collegato dentro la stessa commessa e torna al cantiere", async () => {
  apri();
  fireEvent.click(screen.getByRole("link", { name: "Merce arrivata" }));
  expect(
    await screen.findByText("Ordine aperto: ordine-collegato"),
  ).toBeInTheDocument();
  expect(screen.getByText("Arrivo pronto")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Apri in una scheda" }),
  ).toHaveAttribute(
    "href",
    "/azienda/ordini-acquisto/ordine-collegato?arrivo=1&commessa-generale=a9d5ac5a-57b7-4bb4-8539-4d9c683e0d5a",
  );
  fireEvent.click(screen.getByRole("button", { name: "Apri DDT collegato" }));
  expect(
    await screen.findByText("DDT aperto: ddt-collegato"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Torna al cantiere" }));
  expect(
    screen.queryByText("DDT aperto: ddt-collegato"),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Pagina corrente")).toHaveTextContent(
    "/azienda/ordini/g",
  );
});

it("la scheda intera torna alla commessa di origine e non usa indirizzi esterni", () => {
  render(
    <MemoryRouter
      initialEntries={[
        "/azienda/ddt/d?commessa-generale=a9d5ac5a-57b7-4bb4-8539-4d9c683e0d5a",
      ]}
    >
      <PaginaDocumentoGenerale>
        <p>Documento nativo</p>
      </PaginaDocumentoGenerale>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: "Torna alla commessa generale" }),
  ).toHaveAttribute(
    "href",
    "/azienda/ordini/a9d5ac5a-57b7-4bb4-8539-4d9c683e0d5a?scheda=cantiere&vista-cantiere=forniture",
  );
  expect(screen.getByText("Documento nativo")).toBeInTheDocument();
});
