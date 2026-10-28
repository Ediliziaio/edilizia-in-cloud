import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentazioneMezzoPos } from "../../../supabase/functions/_shared/posDocumentiMezzi";
import { normalizzaSceltaMezzo } from "../../../supabase/functions/_shared/posMezzi";
import {
  documentoMezzoProva,
  controlliMezzoProva,
  documentazioneMezzoProva,
  idMezzoPos,
} from "../fixtures/posDocumentiMezzi";
const m = vi.hoisted(() => ({
  allowed: true,
  readonly: false,
  error: false,
  rows: [] as unknown[],
  controlli: null as unknown,
  open: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: m.allowed,
    solaLettura: m.readonly,
  }),
}));
vi.mock("@/hooks/useDocumentiMezziPos", () => ({
  useDocumentiMezzoPos: () => ({
    data: { documenti: m.rows, controlli: m.controlli },
    isLoading: false,
    isFetching: false,
    isError: m.error,
    refetch: m.read,
  }),
  apriDocumentoMezzoPos: (...args: unknown[]) => m.open(...args),
}));
import { DocumentiMezzoSchedaPos } from "@/components/sicurezza/pos/DocumentiMezzoSchedaPos";
function Harness({
  initial,
  ro = false,
}: {
  initial?: DocumentazioneMezzoPos;
  ro?: boolean;
}) {
  const [v, set] = useState(initial);
  const anagrafica = normalizzaSceltaMezzo({
    modalita: "inventario",
    fonte: { mezzo_id: idMezzoPos, contatore: "20" },
    utilizzo_dal: "2026-11-02",
    utilizzo_al: "2026-11-20",
  });
  return (
    <>
      <DocumentiMezzoSchedaPos
        companyId="azienda"
        orderId="ordine"
        id="a1"
        value={v}
        anagrafica={anagrafica}
        onChange={set}
        ro={ro}
      />
      <output data-testid="v">{JSON.stringify(v)}</output>
    </>
  );
}
const stato = () => JSON.parse(screen.getByTestId("v").textContent!);
const apri = () =>
  fireEvent.click(
    screen.getByRole("button", {
      name: "Leggi documenti e controlli della macchina",
    }),
  );
beforeEach(() => {
  m.allowed = true;
  m.readonly = false;
  m.error = false;
  m.rows = [
    { ...documentoMezzoProva(), confermata: false, revisione_dichiarata: "" },
  ];
  m.controlli = controlliMezzoProva();
  m.open.mockReset();
  m.read.mockReset();
});
afterEach(cleanup);
describe("Documenti e controlli della macchina nel POS", () => {
  it("collega originale e controlli solo dopo le scelte esplicite, senza conferme automatiche", () => {
    render(<Harness />);
    fireEvent.change(
      screen.getByLabelText("Documentazione della specifica attrezzatura"),
      { target: { value: "documenti" } },
    );
    apri();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Acquisisci quadro dei controlli da riesaminare",
      }),
    );
    expect(stato().confermata).toBe(false);
    expect(stato().controlli.impronta).toBe(controlliMezzoProva().impronta);
    fireEvent.change(
      screen.getByLabelText("Documento tecnico della macchina"),
      { target: { value: documentoMezzoProva().id } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Collega originale della macchina" }),
    );
    expect(stato().documenti[0]).toMatchObject({
      id: documentoMezzoProva().id,
      confermata: false,
      revisione_dichiarata: "",
    });
    expect(stato().riesame_controlli).toBe("");
  });
  it("la revisione è letta e dichiarata dal compilatore, ogni modifica annulla il riesame", () => {
    render(<Harness initial={documentazioneMezzoProva()} />);
    fireEvent.change(
      screen.getByLabelText("Revisione letta nell’originale 1"),
      { target: { value: "TEST-2" } },
    );
    expect(stato().confermata).toBe(false);
    expect(stato().documenti[0].confermata).toBe(false);
  });
  it("le fonti cambiate non sostituiscono i riferimenti e bloccano una nuova conferma", () => {
    m.controlli = { ...controlliMezzoProva(), impronta: "c".repeat(64) };
    render(<Harness initial={documentazioneMezzoProva()} />);
    apri();
    expect(screen.getByRole("alert").textContent).toContain("cambiati");
    expect(stato().controlli.impronta).toBe("b".repeat(64));
    const conferma = screen.getByRole("checkbox", {
      name: /Ho riesaminato i documenti/,
    }) as HTMLInputElement;
    expect(conferma.disabled).toBe(true);
  });
  it("un originale sostituito richiede la rimozione e nuova selezione", () => {
    m.rows = [{ ...documentoMezzoProva(), impronta: "c".repeat(64) }];
    render(<Harness initial={documentazioneMezzoProva()} />);
    apri();
    expect(screen.getByRole("alert").textContent).toContain("cambiati");
    expect(stato().documenti[0].impronta).toBe("a".repeat(64));
  });
  it("non seleziona file non disponibili", () => {
    m.rows = [{ ...documentoMezzoProva(), disponibile: false }];
    render(
      <Harness initial={{ ...documentazioneMezzoProva(), documenti: [] }} />,
    );
    apri();
    expect(
      (
        screen.getByRole("option", {
          name: /originale non disponibile/,
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Collega originale della macchina",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("altra gestione non nasconde i documenti precedenti e richiede una motivazione", () => {
    render(<Harness initial={documentazioneMezzoProva()} />);
    fireEvent.change(
      screen.getByLabelText("Documentazione della specifica attrezzatura"),
      { target: { value: "altra_gestione" } },
    );
    expect(stato().documenti).toHaveLength(1);
    expect(
      screen.getByLabelText(
        "Motivazione e fonti della diversa gestione documentale",
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Rimuovi originale 1" }),
    );
    expect(stato().documenti).toHaveLength(0);
  });
  it("apre l’originale tramite il servizio di sicurezza, non con un path del compilatore", () => {
    render(<Harness initial={documentazioneMezzoProva()} />);
    fireEvent.click(screen.getByRole("button", { name: "Apri originale 1" }));
    expect(m.open).toHaveBeenCalledWith(
      "azienda",
      "ordine",
      documentoMezzoProva(),
    );
  });
  it("il quadro segnala criticità senza attestare l’idoneità", () => {
    const v = documentazioneMezzoProva();
    v.controlli!.segnalazioni = [
      {
        id: "s",
        tipo: "guasto",
        stato: "aperta",
        creata_il: "2026-10-01",
        chiusa_il: null,
      },
    ];
    render(<Harness initial={v} />);
    expect(screen.getByText(/Sono presenti segnalazioni/)).toBeTruthy();
    expect(
      screen.getByText(/non costituiscono un esito di idoneità/),
    ).toBeTruthy();
  });
  it("un errore di lettura non cancella il quadro già acquisito", () => {
    m.error = true;
    render(<Harness initial={documentazioneMezzoProva()} />);
    apri();
    expect(screen.getByRole("alert").textContent).toContain(
      "restano conservati",
    );
    expect(stato().controlli.impronta).toBe("b".repeat(64));
  });
  it("sola lettura consente consultazione, senza acquisire o cambiare conferme", () => {
    m.readonly = true;
    render(<Harness initial={documentazioneMezzoProva()} />);
    apri();
    expect(
      screen.queryByRole("button", {
        name: "Acquisisci quadro dei controlli da riesaminare",
      }),
    ).toBeNull();
    expect(
      (
        screen.getByLabelText(
          "Revisione letta nell’originale 1",
        ) as HTMLInputElement
      ).readOnly,
    ).toBe(true);
  });
  it("senza permesso sicurezza nasconde anche i dati in cache", () => {
    m.allowed = false;
    render(<Harness initial={documentazioneMezzoProva()} />);
    expect(
      screen.queryByRole("region", {
        name: "Documenti e controlli dell’attrezzatura",
      }),
    ).toBeNull();
  });
});
