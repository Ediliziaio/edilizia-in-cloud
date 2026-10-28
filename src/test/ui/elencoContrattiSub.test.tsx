import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  ElencoContrattiSub,
  type RigaContrattoSub,
} from "@/components/subappaltatori/ElencoContrattiSub";
import type { ContrattoCompleto } from "@/components/subappaltatori/ContrattiSubappalto";
afterEach(cleanup);
function riga(
  i: number,
  stato: ContrattoCompleto["stato"] = "attivo",
): RigaContrattoSub {
  return {
    contratto: {
      id: `c${i}`,
      numero_contratto: `SUB-${i}`,
      order_id: `o${i}`,
      stato,
      created_at: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
      data_fine_prevista: null,
      descrizione_lavori: "Posa serramenti",
      referente_subappaltatore: "Mario Rossi",
      commessa: {
        order_code: `COMM-${i}`,
        description: `Casa ${i}`,
        client_name: "Bianchi",
      },
    } as ContrattoCompleto,
    riepilogo: {
      valore: i * 100,
      eseguito: 0,
      approvato: 0,
      fatturato: 0,
      pagato: 0,
      daPagare: 0,
      ritenuteTrattenute: 0,
      ritenuteSvincolate: 0,
      residuo: i * 100,
      avanzamento: 0,
      avvisi: [],
    },
    firma: i === 1 ? "firmato" : "da_firmare",
  };
}
describe("Viste dei contratti del subappaltatore", () => {
  it("mostra una vera tabella con stati e apre il contratto corretto", () => {
    const apri = vi.fn();
    render(
      <ElencoContrattiSub righe={[riga(1), riga(2, "bozza")]} onApri={apri} />,
    );
    const tabella = within(screen.getByRole("table"));
    expect(
      tabella.getByRole("columnheader", { name: "Stato lavori" }),
    ).toBeTruthy();
    expect(tabella.getByText("Firma registrata")).toBeTruthy();
    fireEvent.click(tabella.getByRole("button", { name: "SUB-2" }));
    expect(apri).toHaveBeenCalledTimes(1);
    expect(apri).toHaveBeenCalledWith("c2");
  });
  it("ricerca per referente e combina stato lavori e firma senza cambiare i totali", () => {
    render(
      <ElencoContrattiSub
        righe={[riga(1), riga(2, "bozza")]}
        onApri={vi.fn()}
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca contratti e commesse" }),
      { target: { value: "Mario" } },
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Stato lavori" })).getByRole(
        "button",
        { name: /Bozza/ },
      ),
    );
    expect(
      within(screen.getByRole("table")).queryByRole("button", {
        name: "SUB-1",
      }),
    ).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Stato firma" }), {
      target: { value: "firmato" },
    });
    expect(screen.getByText("Nessun contratto corrispondente.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reimposta filtri" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      3,
    );
  });
  it("la vista per fasi conserva la classificazione reale senza modificare gli stati", () => {
    const apri = vi.fn();
    render(
      <ElencoContrattiSub
        righe={[riga(1), riga(2, "sospeso"), riga(3, "completato")]}
        onApri={apri}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fasi" }));
    const gruppo = screen
      .getByRole("heading", { name: "Sospeso" })
      .closest("section")!;
    expect(within(gruppo).getByText("SUB-2")).toBeTruthy();
    expect(within(gruppo).queryByText("SUB-1")).toBeNull();
    fireEvent.click(within(gruppo).getByRole("button"));
    expect(apri).toHaveBeenCalledWith("c2");
    fireEvent.click(
      screen.getByRole("button", { name: "Schede" }),
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("SUB-3")).toBeTruthy();
  });
  it("pagina i molti contratti e riparte dall’inizio quando cambiano i filtri", () => {
    render(
      <ElencoContrattiSub
        righe={Array.from({ length: 25 }, (_, i) => riga(i + 1))}
        onApri={vi.fn()}
      />,
    );
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      21,
    );
    fireEvent.click(screen.getByRole("button", { name: "Successivi" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      6,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca contratti e commesse" }),
      { target: { value: "COMM-25" } },
    );
    expect(
      within(screen.getByRole("table")).getByRole("button", { name: "SUB-25" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Successivi" })).toBeNull();
  });
  it("ordina per valore e distingue l’apertura commessa dall’apertura contratto", () => {
    const apri = vi.fn(),
      commessa = vi.fn();
    render(
      <ElencoContrattiSub
        righe={[riga(1), riga(2)]}
        onApri={apri}
        onCommessa={commessa}
        contesto="commesse"
      />,
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Ordina contratti" }),
      { target: { value: "valore" } },
    );
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1]).getByRole("button", { name: "SUB-2" })).toBeTruthy();
    fireEvent.click(
      within(rows[1]).getByRole("button", { name: "Apri commessa" }),
    );
    expect(commessa).toHaveBeenCalledWith("o2");
    expect(apri).not.toHaveBeenCalled();
  });
});
