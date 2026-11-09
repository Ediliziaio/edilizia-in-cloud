/**
 * Il campo Quantità della riga aperta in «Composizione offerta» (09/11/2026).
 *
 * Florin: «cambio il numero della quantità e non va avanti e non mi cambia la quantità». Il campo scriveva solo uscendone:
 * con le frecce o scrivendo un numero il riepilogo della riga, il totale in alto e il PDF restavano fermi sul valore di
 * prima. Ora il numero nuovo parte da solo poco dopo l'ultimo tasto, una volta sola, e uscire dal campo lo manda subito.
 */
import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FamilyWithAxes } from "@/types/articleFamily";
import type { SrSerramentoRow } from "@/types/serramenti";
import { comeListinoFamily } from "@/lib/serramenti/pickerListino";
import { finestraSalamander, idColore } from "../fixtures/finestraSalamander";

const { dati } = vi.hoisted(() => ({ dati: { famiglie: [] as unknown[], nessuno: [] as unknown[] } }));

vi.mock("@/lib/serramenti/queries", () => ({ useListinoGriglia: () => ({ data: dati.nessuno, isLoading: false }), useMacroFields: () => ({ data: dati.nessuno, isLoading: false }) }));
vi.mock("@/hooks/useFamilies", () => ({
  useFamily: (id: string | null | undefined) => ({ family: (dati.famiglie as FamilyWithAxes[]).find((f) => f.id === id) ?? null, isLoading: false }),
}));
vi.mock("@/hooks/useSchedeLinea", () => ({ useSchedeLinea: () => ({ indice: new Map() }) }));
vi.mock("@/hooks/useListinoCategorie", () => ({ useListinoCategorie: () => ({ categorie: dati.nessuno, isLoading: false }) }));
vi.mock("@/hooks/useListinoMacrocategorie", () => ({ useListinoMacrocategorie: () => ({ macrocategorie: dati.nessuno, isLoading: false }) }));

import { SerramentoRow } from "@/components/serramenti/StepBom";

vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});
beforeEach(() => {
  dati.famiglie = [finestraSalamander("f2a")];
  localStorage.clear();
});
afterEach(() => cleanup());

type Patch = Partial<SrSerramentoRow>;

/** 1200 × 1400, a mq 600 €/m² = 1.008 € al pezzo, due pezzi. */
function posizione(extra: Partial<SrSerramentoRow> = {}): SrSerramentoRow {
  const c = idColore("f2a");
  return {
    id: "r1", progetto_id: "p", company_id: "c", position: 0, tipologia: "finestra_2ante", tipologia_label: "Finestra 2 Ante",
    ambiente: "Soggiorno", materiale: null, serie: null, vetro: null, vetro_specs: null, apertura: null,
    colore_interno: null, colore_esterno: null, larghezza_mm: 1200, altezza_mm: 1400, quantita: 2, metri_quadri: 3.36,
    family_id: "f2a", macrocategoria_override_id: null, listino_voce_id: null, supplier_catalog_id: null, supplier_product_line_id: null,
    prezzo_unitario: 1008, prezzo_totale: 2016,
    valori_assi: { colore: c.bianco, telaio: "f2a-telaio-l" }, scelte_assi: {},
    foto_storage_path: null, foto_render_path: null, note: "tenere", posa_esclusa: false, created_at: "", updated_at: "",
    ...extra,
  } as SrSerramentoRow;
}

let impostaDaFuori: (p: Patch) => void = () => {};

/** La riga con lo stato in mano, come il wizard: ogni modifica arriva a `onPatch` e la riga si aggiorna. */
function Riga({ iniziale, onPatch, listino, aperta }: { iniziale: SrSerramentoRow; onPatch: (p: Patch) => void; listino: boolean; aperta: boolean }) {
  const [riga, setRiga] = useState(iniziale);
  useEffect(() => { impostaDaFuori = (p) => setRiga((r) => ({ ...r, ...p })); }, []);
  const f = (dati.famiglie as FamilyWithAxes[]).find((x) => x.id === riga.family_id);
  return (
    <SerramentoRow
      serramento={riga}
      index={0}
      expanded={aperta}
      onToggle={() => {}}
      onPatch={(p) => { onPatch(p); setRiga((r) => ({ ...r, ...p })); }}
      onDuplicate={() => {}}
      onDelete={() => {}}
      family={listino && f ? comeListinoFamily(f) : undefined}
      macroId={listino ? f?.macrocategoria_id ?? undefined : undefined}
      macroNome="Serramenti"
      tariffePrezzi={new Map()}
      supplierLineMap={new Map()}
      richiestaBulk={null}
      richiestaBulkColore={null}
      richiestaBulkPosa={null}
    />
  );
}

function monta(riga = posizione(), listino = true) {
  const onPatch = vi.fn<(p: Patch) => void>();
  const vista = render(<Riga iniziale={riga} onPatch={onPatch} listino={listino} aperta />);
  return {
    onPatch,
    chiudi: () => vista.rerender(<Riga iniziale={riga} onPatch={onPatch} listino={listino} aperta={false} />),
  };
}

const campo = () => screen.getByText("Quantità").parentElement!.querySelector("input") as HTMLInputElement;
/** Scrivere o premere una freccia: per il browser sono entrambi un cambio del valore, senza uscire dal campo. */
const scrivi = (valore: string) => fireEvent.change(campo(), { target: { value: valore } });
const attendiLaScrittura = () => act(() => new Promise<void>((fatto) => { setTimeout(fatto, 600); }));

describe("Quantità della riga aperta", () => {
  it("riga da listino: il numero nuovo parte senza uscire dal campo, col prezzo della quantità nuova, e il riepilogo lo segue", async () => {
    const { onPatch } = monta();
    expect(screen.getByText("×2")).toBeTruthy();
    campo().focus();
    scrivi("3");
    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1));
    const patch = onPatch.mock.calls[0][0];
    expect(patch.quantita).toBe(3);
    expect(patch.prezzo_unitario).toBe(1008);
    expect(screen.getByText("×3")).toBeTruthy();
    expect(campo().value).toBe("3");
  });

  it("la freccia: su e giù, ogni passo si legge e l'ultimo si salva", async () => {
    const { onPatch } = monta();
    campo().focus();
    scrivi("3");
    await waitFor(() => expect(onPatch).toHaveBeenLastCalledWith(expect.objectContaining({ quantita: 3 })));
    scrivi("2");
    await waitFor(() => expect(onPatch).toHaveBeenLastCalledWith(expect.objectContaining({ quantita: 2 })));
    expect(campo().value).toBe("2");
    expect(screen.getByText("×2")).toBeTruthy();
  });

  it("prezzo scritto a mano: cambia la quantità e il prezzo resta quello del commerciale", async () => {
    const { onPatch } = monta(posizione({ family_id: null, valori_assi: {}, prezzo_unitario: 750, prezzo_totale: 1500 }), false);
    campo().focus();
    scrivi("4");
    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1));
    expect(onPatch.mock.calls[0][0]).toEqual({ quantita: 4 });
    expect(screen.getByText("×4")).toBeTruthy();
  });

  it("cancellare e riscrivere: il campo resta vuoto mentre si scrive, e parte solo il numero finale", async () => {
    const { onPatch } = monta();
    campo().focus();
    scrivi("");
    expect(campo().value).toBe("");
    await attendiLaScrittura();
    expect(onPatch).not.toHaveBeenCalled();
    scrivi("1");
    scrivi("12");
    expect(campo().value).toBe("12");
    await attendiLaScrittura();
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch.mock.calls[0][0].quantita).toBe(12);
  });

  it("uscendo dal campo si manda subito, una volta sola", () => {
    const { onPatch } = monta();
    campo().focus();
    scrivi("5");
    fireEvent.blur(campo());
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch.mock.calls[0][0].quantita).toBe(5);
  });

  it("vuoto, zero o decimali uscendo: torna il numero salvato e non si scrive niente", async () => {
    const { onPatch } = monta();
    for (const sbagliato of ["", "0", "-1", "2.5"]) {
      campo().focus();
      scrivi(sbagliato);
      fireEvent.blur(campo());
      expect(campo().value).toBe("2");
    }
    await attendiLaScrittura();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("chiudendo la riga subito dopo aver scritto il numero non si perde", () => {
    const { onPatch, chiudi } = monta();
    scrivi("6");
    chiudi();
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch.mock.calls[0][0].quantita).toBe(6);
  });

  it("le altre variabili della riga non entrano nella scrittura", async () => {
    const { onPatch } = monta();
    scrivi("3");
    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1));
    expect(Object.keys(onPatch.mock.calls[0][0]).sort()).toEqual(["prezzo_unitario", "quantita"]);
  });

  it("una rilettura mentre si scrive non riporta indietro il numero; a campo fermo lo segue", async () => {
    const { onPatch } = monta();
    campo().focus();
    scrivi("7");
    act(() => impostaDaFuori({ note: "riletta" }));
    expect(campo().value).toBe("7");
    fireEvent.blur(campo());
    expect(onPatch).toHaveBeenCalledTimes(1);
    act(() => impostaDaFuori({ quantita: 9 }));
    expect(campo().value).toBe("9");
  });
});
