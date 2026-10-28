import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizzaMezzoFonte,
  normalizzaSceltaMezzo,
  chiaveFonteMezzo,
  type SceltaMezzoPos,
} from "../../../supabase/functions/_shared/posMezzi";
const s = vi.hoisted(() => ({
  allowed: true,
  readonly: false,
  error: false,
  rows: [] as unknown[],
  read: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: s.allowed,
    solaLettura: s.readonly,
  }),
}));
vi.mock("@/hooks/useMezziPos", () => ({
  useMezziPos: () => ({
    data: { fonti: s.rows },
    isLoading: false,
    isFetching: false,
    isError: s.error,
    refetch: s.read,
  }),
}));
import { MezzoSchedaTecnicaPos } from "@/components/sicurezza/pos/MezzoSchedaTecnicaPos";
const id = "11111111-1111-4111-8111-111111111111";
const fonte = () =>
  normalizzaMezzoFonte({
    mezzo_id: id,
    fonte_tipo: "assegnazione",
    fonte_id: id,
    order_id: id,
    nome: "TEST Trapano",
    codice: "TR-1",
    stato: "in_servizio",
    quantita: "1",
    dal: "2026-11-01",
    al: "2026-11-30",
    impronta: "a".repeat(64),
  });
const iniziale = () =>
  normalizzaSceltaMezzo({
    modalita: "inventario",
    fonte: fonte(),
    utilizzo_dal: "2026-11-02",
    utilizzo_al: "2026-11-20",
    quantita_usata: 1,
    confermata: true,
  });
function Harness({
  initial,
  ro = false,
}: {
  initial?: SceltaMezzoPos;
  ro?: boolean;
}) {
  const [v, set] = useState(initial);
  return (
    <>
      <MezzoSchedaTecnicaPos
        companyId="azienda"
        orderId={id}
        id="a1"
        dal="2026-11-01"
        al="2026-11-30"
        value={v}
        onChange={set}
        ro={ro}
      />
      <output data-testid="scelta">{JSON.stringify(v)}</output>
    </>
  );
}
const stato = () => JSON.parse(screen.getByTestId("scelta").textContent!);
beforeEach(() => {
  s.allowed = true;
  s.readonly = false;
  s.error = false;
  s.rows = [fonte()];
  s.read.mockReset();
});
afterEach(cleanup);
describe("Attrezzatura effettiva nella scheda POS", () => {
  it("seleziona una fonte senza confermarla né inventare date e quantità", () => {
    render(<Harness />);
    fireEvent.change(
      screen.getByLabelText("Anagrafica dell’attrezzatura effettiva"),
      { target: { value: "inventario" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Scegli dall’inventario della commessa",
      }),
    );
    fireEvent.change(screen.getByLabelText("Attrezzatura e assegnazione"), {
      target: { value: chiaveFonteMezzo(fonte()) },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Collega assegnazione selezionata" }),
    );
    expect(stato()).toMatchObject({
      confermata: false,
      utilizzo_dal: "",
      utilizzo_al: "",
      quantita_usata: null,
      fonte: { mezzo_id: id },
    });
  });
  it("distingue omonimi tramite identità e fonte", () => {
    s.rows.push({
      ...fonte(),
      mezzo_id: "22222222-2222-4222-8222-222222222222",
      codice: "TR-2",
    });
    render(<Harness initial={iniziale()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Scegli dall’inventario della commessa",
      }),
    );
    const options = screen
      .getAllByRole("option")
      .filter((o) => o.textContent?.includes("TEST Trapano"));
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute("value")).not.toBe(
      options[1].getAttribute("value"),
    );
  });
  it("annulla la conferma se cambiano periodo o quantità", () => {
    render(<Harness initial={iniziale()} />);
    fireEvent.change(screen.getByLabelText("Fine uso attrezzatura"), {
      target: { value: "2026-11-21" },
    });
    expect(stato().confermata).toBe(false);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(stato().confermata).toBe(true);
    fireEvent.change(screen.getByLabelText("Quantità impiegata"), {
      target: { value: "2" },
    });
    expect(stato().confermata).toBe(false);
  });
  it("una rilettura segnala il cambiamento senza sostituire la fotografia", () => {
    s.rows = [{ ...fonte(), impronta: "b".repeat(64) }];
    render(<Harness initial={iniziale()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Scegli dall’inventario della commessa",
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "non sono sostituiti automaticamente",
    );
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(stato().fonte.impronta).toBe("a".repeat(64));
    fireEvent.click(screen.getByRole("button", { name: "Rileggi inventario" }));
    expect(s.read).toHaveBeenCalledOnce();
  });
  it("non sceglie un’attrezzatura fuori servizio", () => {
    s.rows = [{ ...fonte(), stato: "fuori_servizio" }];
    render(<Harness initial={iniziale()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Scegli dall’inventario della commessa",
      }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Collega assegnazione selezionata",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("option", {
          name: /TEST Trapano/,
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(true);
  });
  it("mostra il limite della sola collocazione corrente", () => {
    const v = iniziale();
    v.fonte = { ...fonte(), fonte_tipo: "corrente", dal: null, al: null };
    render(<Harness initial={v} />);
    expect(screen.getByText(/non è provato da uno storico/)).toBeTruthy();
  });
  it("non nasconde la fonte passando alla dichiarazione manuale", () => {
    render(<Harness initial={iniziale()} />);
    fireEvent.change(
      screen.getByLabelText("Anagrafica dell’attrezzatura effettiva"),
      { target: { value: "non_censita" } },
    );
    expect(stato().fonte.mezzo_id).toBe(id);
    expect(stato().confermata).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Rimuovi collegamento inventario" }),
    );
    expect(stato().fonte).toBeNull();
  });
  it("l’errore di lettura conserva l’identità e impedisce la selezione", () => {
    s.error = true;
    render(<Harness initial={iniziale()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Scegli dall’inventario della commessa",
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain("resta conservato");
    expect(stato().fonte.mezzo_id).toBe(id);
    expect(
      (
        screen.getByLabelText(
          "Attrezzatura e assegnazione",
        ) as HTMLSelectElement
      ).disabled,
    ).toBe(true);
  });
  it.each(["ro", "permesso"])(
    "blocca le modifiche in sola lettura: %s",
    (tipo) => {
      s.readonly = tipo === "permesso";
      render(<Harness initial={iniziale()} ro={tipo === "ro"} />);
      expect(
        (
          screen.getByLabelText(
            "Anagrafica dell’attrezzatura effettiva",
          ) as HTMLSelectElement
        ).disabled,
      ).toBe(true);
      expect(
        screen.queryByRole("button", {
          name: "Rimuovi collegamento inventario",
        }),
      ).toBeNull();
    },
  );
  it("nasconde dati già in cache senza accesso alla sicurezza", () => {
    s.allowed = false;
    render(<Harness initial={iniziale()} />);
    expect(
      screen.queryByRole("region", {
        name: "Identità e impiego dell’attrezzatura",
      }),
    ).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
