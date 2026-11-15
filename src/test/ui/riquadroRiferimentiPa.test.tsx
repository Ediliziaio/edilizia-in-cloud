/**
 * Riquadro «Dati appalto e fatturazione PA» in Panoramica (lotto 3, 15/11/2026): codici con il
 * pulsante copia, valori lunghi interi, cosa manca come avviso, «Modifica» solo con il permesso,
 * righe in ordine, fonti da importare. E l'editor: la spunta «non dovuto» svuota il codice.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { RiferimentoPa } from "@/lib/orders/riferimentiPa";
import { bozzaVuota, type BozzaRiferimentoPa } from "@/lib/orders/riferimentiPa";

const stato = vi.hoisted(() => ({
  data: null as unknown,
  mutate: vi.fn(),
}));
vi.mock("@/hooks/useRiferimentiPaCommessa", () => ({
  useRiferimentiPaCommessa: () => ({ data: stato.data, isLoading: false, isError: false, salva: { mutate: stato.mutate, isPending: false } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RiquadroRiferimentiPa } from "@/components/orders/riferimentiPa/RiquadroRiferimentiPa";
import { RiferimentiPaEditor } from "@/components/orders/riferimentiPa/RiferimentiPaEditor";

afterEach(() => { cleanup(); stato.mutate.mockReset(); });

const NOTE_LUNGHE = "Fatturare all'ufficio tecnico, settore lavori pubblici, indicando sempre il numero di impegno e la determina di affidamento nella causale";
const riga = (p: Partial<RiferimentoPa>): RiferimentoPa => ({
  id: "r", company_id: "c", order_id: "o", tipo: "contratto", numero: null, data: null, cig: null, cig_non_dovuto: false,
  cig_motivo_esclusione: null, cup: null, cup_non_dovuto: false, lotto: null, determina: null, impegno_spesa: null,
  ufficio_id: null, codice_univoco_ufficio: null, note_fatturazione: null, fonte: "manuale", fonte_id: null, ordinamento: 0,
  created_at: "2026-11-15", updated_at: "2026-11-15", created_by: null, ...p,
});

describe("RiquadroRiferimentiPa", () => {
  it("mostra le righe in ordine, i codici copiabili e cosa manca", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    stato.data = {
      attivi: true, clientePa: true, customerId: "p", fonti: [],
      righe: [
        riga({ id: "a", numero: "Rep. 1234/2026", data: "2026-03-02", cig: "1234567ABC", cup: "J51B21000140006", codice_univoco_ufficio: "UFXYZ1", impegno_spesa: "Imp. 2026/889", note_fatturazione: NOTE_LUNGHE }),
        riga({ id: "b", tipo: "ordine_acquisto", ordinamento: 1, cig: "Z1A2B3C4D5" }),
      ],
    };
    render(<RiquadroRiferimentiPa orderId="o" puoModificare />);
    const voci = screen.getAllByRole("listitem");
    expect(voci).toHaveLength(2);
    expect(within(voci[0]).getByText(/Contratto n\. Rep\. 1234\/2026 del 02\/03\/2026/)).toBeTruthy();
    expect(within(voci[1]).getByText(/Ordine d'acquisto/)).toBeTruthy();
    // valore lungo intero, senza troncare
    const note = screen.getByText(NOTE_LUNGHE);
    expect(note.className).not.toMatch(/truncate|line-clamp/);
    fireEvent.click(screen.getAllByRole("button", { name: "Copia CIG" })[0]);
    expect(writeText).toHaveBeenCalledWith("1234567ABC");
    fireEvent.click(screen.getByRole("button", { name: "Copia Codice Univoco Ufficio" }));
    expect(writeText).toHaveBeenCalledWith("UFXYZ1");
    // la seconda riga avvisa: manca numero, data e CUP
    expect(within(voci[1]).getByText(/Manca ancora: .*Numero del ordine d'acquisto.*CUP/)).toBeTruthy();
    expect(within(voci[0]).queryByText(/Manca ancora/)).toBeNull();
    expect(screen.getByRole("button", { name: /Modifica/ })).toBeTruthy();
  });

  it("CIG non dovuto si legge col motivo; senza permesso niente Modifica", () => {
    stato.data = { attivi: true, clientePa: false, customerId: "p", fonti: [], righe: [riga({ id: "a", cig_non_dovuto: true, cig_motivo_esclusione: "affidamento in house", cup: "J51B21000140006" })] };
    render(<RiquadroRiferimentiPa orderId="o" puoModificare={false} />);
    expect(screen.getByText("Non dovuto: affidamento in house")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Modifica/ })).toBeNull();
  });

  it("niente riquadro per un privato senza riferimenti né fonti", () => {
    stato.data = { attivi: false, clientePa: false, customerId: "p", fonti: [], righe: [] };
    const { container } = render(<RiquadroRiferimentiPa orderId="o" puoModificare />);
    expect(container.innerHTML).toBe("");
  });

  it("propone i codici del computo e li importa con un clic", () => {
    stato.data = {
      attivi: false, clientePa: false, customerId: "p", righe: [],
      fonti: [{ fonte: "computo", fonte_id: "k1", etichetta: "Computo «Scuola»", cig: "1234567ABC", cup: null, numero: null, data: null, giaPresente: false, problemi: [] }],
    };
    render(<RiquadroRiferimentiPa orderId="o" puoModificare />);
    expect(screen.getByText(/Computo «Scuola»/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Importa/ }));
    expect(stato.mutate).toHaveBeenCalledTimes(1);
    const arg = stato.mutate.mock.calls[0][0] as { bozze: BozzaRiferimentoPa[]; attivi: boolean };
    expect(arg.attivi).toBe(true);
    expect(arg.bozze).toHaveLength(1);
    expect(arg.bozze[0]).toMatchObject({ fonte: "computo", fonte_id: "k1", cig: "1234567ABC" });
  });

  it("una fonte già importata non si ripropone", () => {
    stato.data = {
      attivi: true, clientePa: false, customerId: "p", righe: [riga({ id: "a", cig: "1234567ABC", fonte: "computo", fonte_id: "k1" })],
      fonti: [{ fonte: "computo", fonte_id: "k1", etichetta: "Computo", cig: "1234567ABC", cup: null, numero: null, data: null, giaPresente: true, problemi: [] }],
    };
    render(<RiquadroRiferimentiPa orderId="o" puoModificare />);
    expect(screen.queryByRole("button", { name: /Importa/ })).toBeNull();
  });
});

function EditorDiProva({ iniziali }: { iniziali: BozzaRiferimentoPa[] }) {
  const [b, setB] = useState(iniziali);
  return <><RiferimentiPaEditor bozze={b} onChange={setB} /><output data-testid="stato">{JSON.stringify(b)}</output></>;
}

describe("RiferimentiPaEditor", () => {
  it("la spunta «CIG non dovuto» svuota e blocca il codice, chiede il motivo", () => {
    render(<EditorDiProva iniziali={[{ ...bozzaVuota(), cig: "1234567ABC" }]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "CIG non dovuto" }));
    const st = JSON.parse(screen.getByTestId("stato").textContent!)[0];
    expect(st).toMatchObject({ cig: "", cig_non_dovuto: true });
    expect((screen.getByLabelText("CIG") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByLabelText("Motivo per cui il CIG non è dovuto")).toBeTruthy();
  });

  it("un CIG di lunghezza sbagliata è un errore, i campi vuoti solo avvisi", () => {
    render(<EditorDiProva iniziali={[{ ...bozzaVuota(), cig: "12345" }]} />);
    expect(screen.getByRole("alert").textContent).toMatch(/10 caratteri/);
    expect(screen.getByText(/Manca ancora: .*Si salva lo stesso/)).toBeTruthy();
  });

  it("aggiunge e toglie riferimenti", () => {
    render(<EditorDiProva iniziali={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi riferimento/ }));
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi riferimento/ }));
    let st = JSON.parse(screen.getByTestId("stato").textContent!);
    expect(st.map((x: BozzaRiferimentoPa) => x.tipo)).toEqual(["contratto", "ordine_acquisto"]);
    fireEvent.click(screen.getAllByRole("button", { name: "Togli riferimento" })[0]);
    st = JSON.parse(screen.getByTestId("stato").textContent!);
    expect(st).toHaveLength(1);
  });
});
