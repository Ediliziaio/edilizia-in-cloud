/**
 * «Come paga il cliente» nel preventivo (26/10/2026): due modi (modalità di pagamento o SAL), le rate modificabili con
 * gli importi sul prezzo, e il piano che finisce nel PDF solo se copre il prezzo intero.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const modelli = vi.hoisted(() => ({ lista: [] as Array<{ id: string; nome: string; righe: unknown[] }> }));
vi.mock("@/hooks/useModelliPagamento", () => ({ useModelliPagamento: () => ({ modelli: modelli.lista, predefinito: null as string | null, isLoading: false }) }));

import { PianoPagamentoCard } from "@/components/moduli/PianoPagamentoCard";
import { pianoRateDiPartenza, pianoSalDiPartenza, type PianoPagamento } from "@/lib/preventivi/pianoPagamento";

afterEach(() => { cleanup(); modelli.lista = []; });

const TOTALE = 59805.06;
const monta = (piano: unknown, extra: Partial<Parameters<typeof PianoPagamentoCard>[0]> = {}) => {
  const onChange = vi.fn();
  render(<MemoryRouter><PianoPagamentoCard piano={piano} onChange={onChange} totale={TOTALE} {...extra} /></MemoryRouter>);
  return onChange;
};
const testo = () => (document.body.textContent ?? "").replace(/\s/g, " ");

describe("senza piano", () => {
  it("col modello vuoto avvisa che nel PDF non compare nessun pagamento", () => {
    monta(null, { testoDelModello: "<p>  </p>" });
    expect(testo()).toContain("Nel PDF non compare nessun pagamento");
  });

  it("col testo nel modello dice che è quello a uscire, e offre comunque le rate", () => {
    monta(null, { testoDelModello: "<p>30% alla firma</p>" });
    expect(testo()).toContain("esce la frase scritta nel modello");
    expect(screen.getByRole("button", { name: "Modalità di pagamento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "A SAL" })).toBeTruthy();
  });

  it("«Modalità di pagamento» parte da acconto e saldo; «A SAL» dai SAL numerati", () => {
    const onChange = monta(null);
    fireEvent.click(screen.getByRole("button", { name: "Modalità di pagamento" }));
    expect(onChange).toHaveBeenLastCalledWith(pianoRateDiPartenza());
    fireEvent.click(screen.getByRole("button", { name: "A SAL" }));
    const p = onChange.mock.calls.at(-1)![0] as PianoPagamento;
    expect(p.modo).toBe("sal");
    expect(p.righe.filter((r) => r.evento === "sal_numero")).toHaveLength(3);
  });

  it("con i modelli dell'azienda si può partire da uno di quelli", () => {
    modelli.lista = [{ id: "m1", nome: "Acconto e saldo", righe: [
      { nome: "Acconto", percent: 30, tipo: "deposit", evento: "firma_contratto", numero: null, preavviso: 7 },
      { nome: "Saldo", percent: 70, tipo: "balance", evento: "fine_lavori", numero: null, preavviso: 7 },
    ] }];
    const onChange = monta(null);
    expect(screen.getByLabelText("Parti da un modello di pagamento")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("col piano", () => {
  it("ogni rata mostra il suo importo sul prezzo, e il totale quando fa 100", () => {
    monta(pianoRateDiPartenza());
    const t = testo();
    expect(t).toContain("17.941,52"); // 30% di 59.805,06
    expect(t).toContain("41.863,54"); // 70%
    expect(t).toContain("Totale");
  });

  it("cambiare la percentuale riscrive la riga; sotto il 100 avvisa che il piano non esce nel PDF", () => {
    const onChange = monta({ modo: "rate", righe: [
      { nome: "Acconto", percent: 30, evento: "firma_contratto", numero: null },
      { nome: "Saldo", percent: 50, evento: "fine_lavori", numero: null },
    ], note: null });
    expect(screen.getByRole("alert").textContent).toContain("non esce nel PDF");
    expect(testo()).toContain("mancano 20");
    fireEvent.change(screen.getByLabelText("Percentuale della rata 2"), { target: { value: "70" } });
    expect((onChange.mock.calls.at(-1)![0] as PianoPagamento).righe[1].percent).toBe(70);
  });

  it("nel modo «rate» il SAL non si può scegliere; nel modo «SAL» sì", () => {
    cleanup();
    monta(pianoRateDiPartenza());
    fireEvent.click(screen.getByLabelText("Quando si paga la rata 1"));
    expect(screen.queryByRole("option", { name: /Al SAL numero/ })).toBeNull();
    cleanup();
    monta(pianoSalDiPartenza(2));
    fireEvent.click(screen.getByLabelText("Quando si paga la rata 2"));
    expect(screen.getByRole("option", { name: /Al SAL numero/ })).toBeTruthy();
  });

  it("si aggiunge un SAL col numero successivo, e si toglie una rata", () => {
    const onChange = monta(pianoSalDiPartenza(2));
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi un SAL/ }));
    const aggiunto = (onChange.mock.calls.at(-1)![0] as PianoPagamento).righe.at(-1)!;
    expect(aggiunto).toMatchObject({ nome: "SAL 3", evento: "sal_numero", numero: 3 });
    fireEvent.click(screen.getByLabelText("Togli la rata 1"));
    expect((onChange.mock.calls.at(-1)![0] as PianoPagamento).righe).toHaveLength(3);
  });

  it("«Togli il piano» riporta al testo del modello", () => {
    const onChange = monta(pianoRateDiPartenza());
    fireEvent.click(screen.getByRole("button", { name: "Togli il piano" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("l'ultima rata non si può togliere", () => {
    monta({ modo: "rate", righe: [{ nome: "Saldo", percent: 100, evento: "fine_lavori", numero: null }], note: null });
    expect((screen.getByLabelText("Togli la rata 1") as HTMLButtonElement).disabled).toBe(true);
  });

  it("il modo scelto si vede, e passando a SAL il piano cambia", () => {
    const onChange = monta(pianoRateDiPartenza());
    const gruppo = screen.getByRole("group", { name: "Modo di pagamento" });
    expect(within(gruppo).getByRole("button", { name: "Modalità di pagamento" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(gruppo).getByRole("button", { name: "A SAL" }));
    expect((onChange.mock.calls.at(-1)![0] as PianoPagamento).modo).toBe("sal");
  });
});
