import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

/**
 * «Commessa cliente» spegnibile per azienda (12/11/2026).
 *
 * Chi fa solo operazioni immobiliari — compra un terreno, costruisce, vende —
 * non lavora su commessa per un cliente. Prima la scheda «Commessa cliente»
 * era l'unica sempre presente nella finestra «Nuova Commessa» e non si poteva
 * togliere: nessuna impostazione la riguardava.
 *
 * Qui si prova quello che vede chi usa l'app: la scheda sparisce, la pagina di
 * creazione non si apre nemmeno scrivendo l'indirizzo a mano, e la nuova unità
 * di una commessa generale (`?generale=…`) continua a funzionare.
 */
const m = vi.hoisted(() => ({
  commessaCliente: true,
  modelli: [] as string[],
  isLoading: false,
  canViewMargins: false,
  isAdmin: false,
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: m.isAdmin, canViewMargins: m.canViewMargins, isLoading: false }),
}));
vi.mock("@/hooks/useCommesseGenerali", () => ({
  useImpostazioniCommesseGenerali: () => ({
    modelli: m.modelli,
    commessaCliente: m.commessaCliente,
    disponibile: true,
    configurata: true,
    isLoading: m.isLoading,
    salva: { mutate: vi.fn(), isPending: false },
    salvaCommessaCliente: { mutate: vi.fn(), isPending: false },
  }),
}));

import { OrderTypeChoiceDialog } from "@/components/orders/OrderTypeChoiceDialog";
import { CommessaClienteGuard } from "@/routes/company/CommessaClienteGuard";

afterEach(cleanup);
beforeEach(() => {
  m.commessaCliente = true;
  m.modelli = [];
  m.isLoading = false;
  m.canViewMargins = false;
  m.isAdmin = false;
});

const bivio = (): ReactElement => (
  <MemoryRouter>
    <OrderTypeChoiceDialog
      open
      onOpenChange={vi.fn()}
      commessaCliente={m.commessaCliente}
      modelliGenerali={m.modelli as never}
      onScegliGenerale={vi.fn()}
    />
  </MemoryRouter>
);

describe("La finestra «Nuova Commessa»", () => {
  it("di norma offre la commessa cliente", () => {
    m.modelli = ["sviluppo"];
    render(bivio());
    expect(screen.getByText("Commessa cliente")).toBeInTheDocument();
    expect(screen.getByText("Commessa generale · Sviluppo immobiliare")).toBeInTheDocument();
  });

  it("con la commessa cliente spenta lascia solo l'operazione immobiliare", () => {
    m.commessaCliente = false;
    m.modelli = ["sviluppo"];
    render(bivio());
    expect(screen.queryByText("Commessa cliente")).not.toBeInTheDocument();
    expect(screen.getByText("Commessa generale · Sviluppo immobiliare")).toBeInTheDocument();
  });

  it("non spegne anche gli altri tipi accesi", () => {
    m.commessaCliente = false;
    m.modelli = ["appalto", "sviluppo"];
    render(bivio());
    expect(screen.queryByText("Commessa cliente")).not.toBeInTheDocument();
    expect(screen.getByText("Commessa generale · Appalto a contratto")).toBeInTheDocument();
    expect(screen.getByText("Commessa generale · Sviluppo immobiliare")).toBeInTheDocument();
  });
});

function Dove(): ReactElement {
  const { pathname, search } = useLocation();
  return <p>Sono su {pathname}{search}</p>;
}

function conIndirizzo(indirizzo: string): ReactElement {
  return (
    <MemoryRouter initialEntries={[indirizzo]}>
      <Routes>
        <Route
          path="/azienda/ordini/nuovo"
          element={
            <CommessaClienteGuard fallback="/azienda/ordini">
              <p>Modulo nuova commessa</p>
            </CommessaClienteGuard>
          }
        />
        <Route path="/azienda/ordini" element={<Dove />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("La pagina di creazione della commessa", () => {
  it("si apre quando la commessa cliente è accesa", () => {
    render(conIndirizzo("/azienda/ordini/nuovo"));
    expect(screen.getByText("Modulo nuova commessa")).toBeInTheDocument();
  });

  it("con la commessa cliente spenta rimanda all'elenco, anche scrivendo l'indirizzo a mano", () => {
    m.commessaCliente = false;
    render(conIndirizzo("/azienda/ordini/nuovo?customer_id=cli-1"));
    expect(screen.queryByText("Modulo nuova commessa")).not.toBeInTheDocument();
    expect(screen.getByText("Sono su /azienda/ordini")).toBeInTheDocument();
  });

  it("lascia creare la nuova unità di una commessa generale: non è una commessa cliente", () => {
    m.commessaCliente = false;
    render(conIndirizzo("/azienda/ordini/nuovo?generale=g-1"));
    expect(screen.getByText("Modulo nuova commessa")).toBeInTheDocument();
  });

  it("mentre l'impostazione si carica non sbatte fuori nessuno", () => {
    m.commessaCliente = false;
    m.isLoading = true;
    render(conIndirizzo("/azienda/ordini/nuovo"));
    expect(screen.getByText("Modulo nuova commessa")).toBeInTheDocument();
  });
});

describe("Il simulatore dell'operazione", () => {
  it("resta offerto a chi vede i margini anche senza commessa cliente", () => {
    m.commessaCliente = false;
    m.modelli = ["sviluppo"];
    m.canViewMargins = true;
    render(bivio());
    const scheda = screen.getByText("Valuta un'operazione");
    expect(scheda).toBeInTheDocument();
    fireEvent.click(scheda);
  });
});
