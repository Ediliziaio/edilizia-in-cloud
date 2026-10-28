import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QuadroDocumentaleCommessa } from "@/components/sicurezza/QuadroDocumentaleCommessa";
import type { RigaQuadroDocumentale } from "@/lib/sicurezza/quadroDocumentale";
const r = (
  id: string,
  other: Partial<RigaQuadroDocumentale> = {},
): RigaQuadroDocumentale => ({
  chiave: id,
  id,
  titolo: `Documento ${id}`,
  tipo: "visura",
  stato: "da_verificare",
  origine: "fascicolo",
  subId: "s",
  personaId: null,
  faseId: null,
  dal: null,
  al: null,
  scadenza: null,
  termine: null,
  referente: null,
  origineDaChiarire: false,
  haFile: true,
  ordineFonte: "o",
  ...other,
});
const draw = (righe: RigaQuadroDocumentale[] = [], parziale = false) =>
  render(
    <QuadroDocumentaleCommessa
      righe={righe}
      parziale={parziale}
      caricamento={false}
      imprese={{ s: "Ditta A" }}
      persone={{ w: "Operatore demo" }}
      fasi={{ f: "Posa" }}
      azione={(x) => <button>{`Apri ${x.id}`}</button>}
      onFascicolo={vi.fn()}
    />,
  );
describe("Quadro documentale visibile", () => {
  it("un quadro vuoto non dichiara il cantiere completo", () => {
    draw();
    expect(screen.getByText(/Un quadro vuoto non indica/)).toBeInTheDocument();
    expect(screen.queryByText("Completo")).not.toBeInTheDocument();
  });
  it("mostra l’origine e cerca per titolare o referente", () => {
    draw([
      r("a", { referente: "Referente Alfa" }),
      r("b", { subId: null, origine: "archivio", stato: "archivio" }),
    ]);
    fireEvent.change(screen.getByLabelText("Cerca nel quadro documentale"), {
      target: { value: "Referente Alfa" },
    });
    expect(screen.getByText("Documento a")).toBeInTheDocument();
    expect(screen.queryByText("Documento b")).not.toBeInTheDocument();
  });
  it("filtra stati e titolari senza trasformare i file in requisiti verificati", () => {
    draw([
      r("a"),
      r("b", { subId: null, origine: "archivio", stato: "archivio" }),
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: /Archivio da riconciliare/ }),
    );
    expect(screen.queryByText("Documento a")).not.toBeInTheDocument();
    expect(screen.getByText("Documento b")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Titolare nel quadro documentale"), {
      target: { value: "s" },
    });
    expect(
      screen.getByText("Nessun record con questi filtri."),
    ).toBeInTheDocument();
  });
  it("non presenta conteggi come completi quando una fonte non risponde", () => {
    draw([r("a")], true);
    expect(screen.getByRole("alert")).toHaveTextContent("Fonti parziali");
    expect(screen.getAllByText("—")).toHaveLength(5);
  });
  it("pagina la tabella senza perdere righe o azioni", () => {
    draw(Array.from({ length: 21 }, (_, i) => r(`${i}`)));
    expect(screen.queryByText("Documento 20")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Successivi" }));
    expect(screen.getByRole("button", { name: "Apri 20" })).toBeInTheDocument();
    expect(screen.queryByText("Documento 0")).not.toBeInTheDocument();
  });
});

it("può dare priorità ai requisiti registrati mantenendo raggiungibile l’archivio", () => {
  render(
    <QuadroDocumentaleCommessa
      righe={[
        r("registrato"),
        r("precedente", { origine: "archivio", stato: "archivio" }),
      ]}
      filtroIniziale="registrati"
      caricamento={false}
      parziale={false}
      imprese={{}}
      persone={{}}
      fasi={{}}
      azione={() => null}
      onFascicolo={vi.fn()}
    />,
  );
  expect(screen.getByText("Documento registrato")).toBeInTheDocument();
  expect(screen.queryByText("Documento precedente")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tutti i record" }));
  expect(screen.getByText("Documento precedente")).toBeInTheDocument();
});
