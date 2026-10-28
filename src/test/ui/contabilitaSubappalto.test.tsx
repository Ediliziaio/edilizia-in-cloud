import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  SALContabilita,
  RitenuteContabilita,
} from "@/components/subappaltatori/ContabilitaSubappalto";
import type {
  SALSubappaltatore,
  RitenutaGaranzia,
} from "@/types/subappaltatori";

afterEach(cleanup);
const base: SALSubappaltatore = {
  id: "s1",
  company_id: "c",
  contratto_id: "contratto",
  subappaltatore_id: "sub",
  order_id: "o",
  numero_sal: 1,
  data_emissione: "2026-10-01",
  importo_lordo: 1000,
  ritenuta_pct: 5,
  ritenuta_importo: 50,
  importo_netto: 950,
  stato: "verificato",
  data_pagamento: null,
  payment_method: null,
  payment_reference: null,
  note: "Misurazioni confermate",
  attachment_url: null,
  created_at: "2026-10-01",
};
const props = () => ({
  sal: [base],
  contratto: "SUB-001",
  canWrite: true,
  approvazioneInCorso: false,
  onVerbale: vi.fn(),
  onApprova: vi.fn(),
  onContesta: vi.fn(),
  onPagamento: vi.fn(),
});
const ritenuta: RitenutaGaranzia = {
  id: "r1",
  company_id: "c",
  contratto_id: "contratto",
  sal_id: "s1",
  importo: 50,
  stato: "trattenuta",
  data_svincolo_prevista: null,
  data_svincolo_effettiva: null,
  note: "Garanzia della posa",
  created_at: "2026-10-01",
};

describe("Contabilità del subappalto", () => {
  it("apre i dettagli nel popup e passa il SAL corretto al verbale e al pagamento", () => {
    const p = props();
    render(<SALContabilita {...p} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apri SAL 1" }));
    const popup = within(screen.getByRole("dialog"));
    expect(popup.getByText("SUB-001 · 01 ott 2026")).toBeTruthy();
    expect(popup.getByText("Misurazioni confermate")).toBeTruthy();
    fireEvent.click(popup.getByRole("button", { name: "Verbale e allegati" }));
    expect(p.onVerbale).toHaveBeenCalledWith(base);
    fireEvent.click(popup.getByRole("button", { name: "Registra pagamento" }));
    expect(p.onPagamento).toHaveBeenCalledWith(base);
    fireEvent.click(
      popup.getByRole("button", { name: "Torna ai SAL" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Apri SAL 1" })).toBeTruthy();
  });
  it("esclude i contestati dal riepilogo e mantiene i totali durante il filtro", () => {
    const p = props();
    render(
      <SALContabilita
        {...p}
        sal={[
          base,
          {
            ...base,
            id: "s2",
            numero_sal: 2,
            stato: "contestato",
            importo_lordo: 8000,
            importo_netto: 7600,
          },
          { ...base, id: "s3", numero_sal: 3, stato: "pagato" },
        ]}
      />,
    );
    const riepilogo = screen.getByText("Lordo SAL").parentElement!;
    expect(riepilogo.textContent).toContain("2000,00");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filtra per stato" }),
      { target: { value: "contestato" } },
    );
    expect(screen.queryByRole("button", { name: "Apri SAL 1" })).toBeNull();
    expect(screen.getByRole("button", { name: "Apri SAL 2" })).toBeTruthy();
    expect(riepilogo.textContent).toContain("2000,00");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca nella contabilità" }),
      { target: { value: "inesistente" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Reimposta filtri" }));
    expect(screen.getByText("3 di 3 SAL")).toBeTruthy();
  });
  it("un SAL ricevuto deve essere verificato prima di mostrare il pagamento; il popup riflette gli aggiornamenti", () => {
    const p = props();
    const ricevuto = { ...base, stato: "ricevuto" as const };
    const view = render(<SALContabilita {...p} sal={[ricevuto]} />);
    fireEvent.click(screen.getByRole("button", { name: "Apri SAL 1" }));
    expect(
      screen.queryByRole("button", { name: "Registra pagamento" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approva SAL" }));
    expect(p.onApprova).toHaveBeenCalledWith("s1");
    view.rerender(<SALContabilita {...p} />);
    expect(
      screen.getByRole("button", { name: "Registra pagamento" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approva SAL" })).toBeNull();
  });
  it("in sola lettura consente la consultazione senza operazioni economiche", () => {
    render(
      <SALContabilita
        {...props()}
        canWrite={false}
        sal={[{ ...base, stato: "ricevuto" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Apri SAL 1" }));
    expect(
      screen.getByRole("button", { name: "Verbale e allegati" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approva SAL" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Contesta" })).toBeNull();
  });
  it("mostra la ritenuta con SAL di origine e apre lo svincolo corretto senza navigazione", () => {
    const svincola = vi.fn();
    const verbale = vi.fn();
    render(
      <RitenuteContabilita
        ritenute={[ritenuta]}
        sal={[base]}
        contratto="SUB-001"
        canRelease
        onSvincola={svincola}
        onVerbale={verbale}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apri ritenuta SAL 1" }),
    );
    const popup = within(screen.getByRole("dialog"));
    expect(popup.getByText("SUB-001 · SAL #1")).toBeTruthy();
    expect(popup.getByText("Garanzia della posa")).toBeTruthy();
    fireEvent.click(popup.getByRole("button", { name: "Gestisci svincolo" }));
    expect(svincola).toHaveBeenCalledWith("r1");
    fireEvent.click(popup.getByRole("button", { name: "Verbale SAL" }));
    expect(verbale).toHaveBeenCalledWith(base);
  });
  it("le ritenute svincolate e i lettori non possono avviare uno svincolo", () => {
    const p = {
      ritenute: [ritenuta],
      sal: [base],
      contratto: "SUB-001",
      onSvincola: vi.fn(),
      onVerbale: vi.fn(),
    };
    const view = render(<RitenuteContabilita {...p} canRelease={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Apri ritenuta SAL 1" }),
    );
    expect(
      screen.queryByRole("button", { name: "Gestisci svincolo" }),
    ).toBeNull();
    view.rerender(
      <RitenuteContabilita
        {...p}
        canRelease
        ritenute={[
          {
            ...ritenuta,
            stato: "svincolata",
            data_svincolo_effettiva: "2026-10-20",
          },
        ]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Gestisci svincolo" }),
    ).toBeNull();
    expect(
      within(screen.getByRole("dialog")).getByText("20 ott 2026"),
    ).toBeTruthy();
  });
});
