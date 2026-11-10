import { useState, type DragEvent as ReactDragEvent } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RilascioFileGlobale } from "@/components/shared/RilascioFileGlobale";
import { descriviFormati, formatoAmmesso } from "@/lib/rilascioFile";

const toasts = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

const file = (name: string, type = "") => new File(["x"], name, { type });
const pdf = () => file("offerta.pdf", "application/pdf");
const excel = () => file("listino.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

function trasporto(files: File[], extra: Partial<DataTransfer> = {}) {
  return { types: ["Files"], files, items: [], dropEffect: "none", ...extra } as unknown as DataTransfer;
}

function evento(tipo: string, bersaglio: Element, dataTransfer: DataTransfer) {
  const e = new Event(tipo, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "dataTransfer", { value: dataTransfer });
  act(() => {
    bersaglio.dispatchEvent(e);
  });
  return e;
}

const rilascia = (bersaglio: Element, files: File[]) => evento("drop", bersaglio, trasporto(files));

const descrittoreFiles = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")!;

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom non ha DataTransfer e non impagina: ogni elemento ha misure, tranne quelli segnati.
  vi.stubGlobal(
    "DataTransfer",
    class {
      elenco: File[] = [];
      items = { add: (f: File) => this.elenco.push(f) };
      get files() {
        return this.elenco;
      }
    },
  );
  const copie = new WeakMap<object, unknown>();
  Object.defineProperty(HTMLInputElement.prototype, "files", {
    configurable: true,
    get() {
      return copie.get(this) ?? null;
    },
    set(v) {
      copie.set(this, v);
    },
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const misura = this.hidden ? 0 : 100;
    return { top: 0, left: 0, right: misura, bottom: misura, width: misura, height: misura, x: 0, y: 0, toJSON: () => "" };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(HTMLInputElement.prototype, "files", descrittoreFiles);
});

function Caricamento({ onFile, accept, multiple, disabled, filtro }: {
  onFile: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  filtro?: string;
}) {
  return (
    <div data-testid="area">
      <input
        type="file"
        hidden
        aria-label="carica"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        data-rilascio={filtro}
        onChange={(e) => onFile(Array.from(e.target.files ?? []))}
      />
      <button type="button">Scegli file</button>
    </div>
  );
}

function monta(ui: React.ReactNode) {
  return render(
    <>
      <RilascioFileGlobale />
      <p data-testid="fuori">Altro</p>
      <main>{ui}</main>
    </>,
  );
}

describe("formati", () => {
  it("segue la regola del selettore di file", () => {
    expect(formatoAmmesso(file("a.PDF", "application/pdf"), ".pdf")).toBe(true);
    expect(formatoAmmesso(file("a.png", "image/png"), "image/*")).toBe(true);
    expect(formatoAmmesso(file("a.xml.p7m"), ".xml,.p7m")).toBe(true);
    expect(formatoAmmesso(file("a.txt", "text/plain"), "image/*,.pdf")).toBe(false);
    expect(formatoAmmesso(file("a.exe"), "")).toBe(true);
  });

  it("riconosce dal nome i file arrivati senza tipo", () => {
    expect(formatoAmmesso(file("a.pdf"), "application/pdf")).toBe(true);
    expect(formatoAmmesso(file("a.heic"), "image/*")).toBe(true);
    expect(formatoAmmesso(file("a.doc"), "application/pdf")).toBe(false);
  });

  it("descrive i formati come li direbbe una persona", () => {
    expect(descriviFormati("application/pdf,image/png,image/jpeg,.jpg")).toBe("PDF, PNG, JPG");
    expect(descriviFormati(".xlsx,.xls,.p7m,image/*")).toBe("Excel, P7M, immagini");
  });
});

describe("rilascio sui caricamenti", () => {
  it("consegna il file allo stesso onChange del pulsante, rilasciandolo vicino al pulsante", () => {
    const onFile = vi.fn();
    monta(<Caricamento onFile={onFile} accept="application/pdf" />);
    const e = rilascia(screen.getByText("Scegli file"), [pdf()]);
    expect(e.defaultPrevented).toBe(true);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0][0].name).toBe("offerta.pdf");
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("spiega perché un formato non entra e non chiama il caricamento", () => {
    const onFile = vi.fn();
    monta(<Caricamento onFile={onFile} accept="application/pdf,image/png" />);
    rilascia(screen.getByText("Scegli file"), [excel()]);
    expect(onFile).not.toHaveBeenCalled();
    expect(toasts.error).toHaveBeenCalledWith("«listino.xlsx» non si può caricare qui", {
      description: "Qui si possono caricare: PDF, PNG.",
    });
  });

  it("con più file fa entrare quelli buoni e dice quali ha lasciato fuori", () => {
    const onFile = vi.fn();
    monta(<Caricamento onFile={onFile} accept="application/pdf" multiple />);
    rilascia(screen.getByText("Scegli file"), [pdf(), excel()]);
    expect(onFile.mock.calls[0][0].map((f: File) => f.name)).toEqual(["offerta.pdf"]);
    expect(toasts.error).toHaveBeenCalledTimes(1);
  });

  it("non ne fa entrare due dove il campo ne prende uno", () => {
    const onFile = vi.fn();
    monta(<Caricamento onFile={onFile} />);
    rilascia(screen.getByText("Scegli file"), [pdf(), pdf()]);
    expect(onFile).not.toHaveBeenCalled();
    expect(toasts.error).toHaveBeenCalledWith("Qui si può caricare un solo file", expect.anything());
  });

  it("lascia il controllo a chi riceve il file, se lo fa già lui", () => {
    const onFile = vi.fn();
    monta(<Caricamento onFile={onFile} accept="application/pdf" filtro="senza-filtro" />);
    rilascia(screen.getByText("Scegli file"), [excel()]);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("non carica mentre il campo è disabilitato", () => {
    const onFile = vi.fn();
    monta(<Caricamento onFile={onFile} disabled />);
    rilascia(screen.getByText("Scegli file"), [pdf()]);
    expect(onFile).not.toHaveBeenCalled();
    expect(toasts.info).toHaveBeenCalledWith("Caricamento non disponibile in questo momento", expect.anything());
  });

  it("rifiuta le cartelle", () => {
    const onFile = vi.fn();
    monta(<Caricamento onFile={onFile} />);
    const items = [{ webkitGetAsEntry: () => ({ isDirectory: true }) }] as unknown as DataTransferItemList;
    evento("drop", screen.getByText("Scegli file"), trasporto([file("Documenti")], { items }));
    expect(onFile).not.toHaveBeenCalled();
    expect(toasts.error).toHaveBeenCalledWith("Le cartelle non si possono caricare", expect.anything());
  });
});

describe("fuori dalle aree", () => {
  it("un file rilasciato fuori non apre il browser e lo dice", () => {
    const onFile = vi.fn();
    monta(<Caricamento onFile={onFile} />);
    const sopra = evento("dragover", screen.getByTestId("fuori"), trasporto([]));
    expect(sopra.defaultPrevented).toBe(true);
    const e = rilascia(screen.getByTestId("fuori"), [pdf()]);
    expect(e.defaultPrevented).toBe(true);
    expect(onFile).not.toHaveBeenCalled();
    expect(toasts.info).toHaveBeenCalledWith("Qui non si possono caricare file", expect.anything());
  });

  it("ignora i trascinamenti che non portano file", () => {
    monta(<Caricamento onFile={vi.fn()} />);
    const e = evento("dragover", screen.getByText("Scegli file"), trasporto([], { types: ["text/plain"] }));
    expect(e.defaultPrevented).toBe(false);
    expect(screen.queryByTestId("rilascio-file")).toBeNull();
  });
});

describe("evidenza visiva", () => {
  it("mostra l'area col suo messaggio e la toglie al rilascio", () => {
    monta(<Caricamento onFile={vi.fn()} accept="application/pdf" multiple />);
    const bottone = screen.getByText("Scegli file");
    expect(screen.queryByTestId("rilascio-file")).toBeNull();
    evento("dragover", bottone, trasporto([]));
    expect(screen.getByText("Rilascia qui per caricare")).toBeTruthy();
    rilascia(bottone, [pdf()]);
    expect(screen.queryByTestId("rilascio-file")).toBeNull();
  });

  it("si spegne da sola se il trascinamento esce dalla finestra", () => {
    vi.useFakeTimers();
    monta(<Caricamento onFile={vi.fn()} />);
    evento("dragover", screen.getByText("Scegli file"), trasporto([]));
    expect(screen.getByTestId("rilascio-file")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.queryByTestId("rilascio-file")).toBeNull();
    vi.useRealTimers();
  });
});

describe("finestre e aree già esistenti", () => {
  function PaginaConFinestra({ suPagina, suFinestra }: { suPagina: (f: File[]) => void; suFinestra: (f: File[]) => void }) {
    return (
      <>
        <div aria-hidden="true" data-testid="sfondo">
          <Caricamento onFile={suPagina} />
        </div>
        <div role="dialog" data-testid="finestra">
          <Caricamento onFile={suFinestra} />
          <p>Testo della finestra</p>
        </div>
      </>
    );
  }

  it("dentro una finestra vale tutta la finestra e non la pagina sotto", () => {
    const suPagina = vi.fn();
    const suFinestra = vi.fn();
    monta(<PaginaConFinestra suPagina={suPagina} suFinestra={suFinestra} />);
    rilascia(screen.getByText("Testo della finestra"), [pdf()]);
    expect(suFinestra).toHaveBeenCalledTimes(1);
    expect(suPagina).not.toHaveBeenCalled();
  });

  it("sullo sfondo oscurato il file va comunque nella finestra aperta", () => {
    const suPagina = vi.fn();
    const suFinestra = vi.fn();
    monta(<PaginaConFinestra suPagina={suPagina} suFinestra={suFinestra} />);
    rilascia(screen.getByTestId("sfondo"), [pdf()]);
    expect(suFinestra).toHaveBeenCalledTimes(1);
    expect(suPagina).not.toHaveBeenCalled();
  });

  it("due caricamenti nella stessa pagina non si confondono", () => {
    const primo = vi.fn();
    const secondo = vi.fn();
    render(
      <>
        <RilascioFileGlobale />
        <main>
          <div><Caricamento onFile={primo} /><p>Riga uno</p></div>
          <div><Caricamento onFile={secondo} /><p>Riga due</p></div>
        </main>
      </>,
    );
    rilascia(screen.getAllByText("Scegli file")[1], [pdf()]);
    expect(secondo).toHaveBeenCalledTimes(1);
    expect(primo).not.toHaveBeenCalled();
  });

  it("tra fotocamera e galleria affiancate sceglie la galleria", () => {
    const fotocamera = vi.fn();
    const galleria = vi.fn();
    render(
      <>
        <RilascioFileGlobale />
        <main>
          <div>
            <input type="file" hidden capture="environment" onChange={(e) => fotocamera(e.target.files)} />
            <input type="file" hidden multiple onChange={(e) => galleria(e.target.files)} />
            <button type="button">Foto</button>
          </div>
        </main>
      </>,
    );
    rilascia(screen.getByText("Foto"), [file("a.jpg", "image/jpeg")]);
    expect(galleria).toHaveBeenCalledTimes(1);
    expect(fotocamera).not.toHaveBeenCalled();
  });

  it("non si sovrappone a chi gestisce già il rilascio per conto suo", () => {
    const suo = vi.fn();
    const onFile = vi.fn();
    function ZonaPropria() {
      const [, segna] = useState(0);
      const ferma = (e: ReactDragEvent) => {
        e.preventDefault();
        segna((n) => n + 1);
      };
      return (
        <div onDragOver={ferma} onDrop={(e) => { e.preventDefault(); suo(); }}>
          <Caricamento onFile={onFile} />
        </div>
      );
    }
    monta(<ZonaPropria />);
    rilascia(screen.getByText("Scegli file"), [pdf()]);
    expect(suo).toHaveBeenCalledTimes(1);
    expect(onFile).not.toHaveBeenCalled();
    expect(toasts.info).not.toHaveBeenCalled();
  });

  it("non consegna a un campo escluso", () => {
    const onFile = vi.fn();
    monta(<Caricamento onFile={onFile} filtro="no" />);
    rilascia(screen.getByText("Scegli file"), [pdf()]);
    expect(onFile).not.toHaveBeenCalled();
    expect(toasts.info).toHaveBeenCalledWith("Qui non si possono caricare file", { description: undefined });
  });
});
