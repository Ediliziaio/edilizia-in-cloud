/**
 * Il box dei complementi di una finestra: il cassonetto con la profondità, la
 * tapparella senza; il listino che ha i complementi ma non li propone lo dice,
 * coi link; una posizione che non prende complementi non ha bottoni; un
 * complemento senza finestra si aggancia.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SrAccessorioRow } from "@/types/serramenti";

// Righe scritte a mano: niente griglia né varianti da caricare.
vi.mock("@/lib/serramenti/queries", () => ({
  useListinoGriglia: () => ({ data: [] as unknown[], isLoading: false }),
}));
vi.mock("@/hooks/useFamilies", () => ({
  useFamily: () => ({ family: null as unknown, isLoading: false }),
}));

import { ComplementiFinestra, ComplementoRiga } from "@/components/serramenti/ComplementiFinestra";

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

afterEach(() => cleanup());

const complemento = (extra: Partial<SrAccessorioRow>) =>
  ({
    id: "c1",
    progetto_id: "p1",
    company_id: "az",
    position: 0,
    tipo: "cassonetto",
    descrizione: null,
    quantita: 1,
    larghezza_mm: 1200,
    altezza_mm: 280,
    profondita_mm: null,
    prezzo_unitario: 260,
    prezzo_totale: 260,
    listino_voce_id: null,
    serramento_id: "w1",
    note: null,
    posa_esclusa: false,
    family_id: null,
    valori_assi: null,
    scelte_assi: {},
    modalita_prezzo: null,
    supplier_catalog_id: null,
    supplier_product_line_id: null,
    created_at: "",
    updated_at: "",
    ...extra,
  }) as SrAccessorioRow;

const riga = (a: SrAccessorioRow, extra: Partial<Parameters<typeof ComplementoRiga>[0]> = {}) => (
  <ComplementoRiga
    a={a}
    tariffePrezzi={new Map()}
    supplierLineMap={new Map()}
    onPatch={vi.fn()}
    onElimina={vi.fn()}
    {...extra}
  />
);

const box = (extra: Partial<Parameters<typeof ComplementiFinestra>[0]> = {}) => (
  <ComplementiFinestra
    finestra={{ larghezza_mm: 1200, altezza_mm: 1400, quantita: 2 }}
    complementi={[]}
    tipologie={[]}
    tariffePrezzi={new Map()}
    supplierLineMap={new Map()}
    onAggiungi={vi.fn()}
    onCambiaModello={vi.fn()}
    onPatch={vi.fn()}
    onElimina={vi.fn()}
    inCorso={null}
    occupata={false}
    destinazione="Alla finestra 1"
    {...extra}
  />
);

describe("ComplementiFinestra", () => {
  it("il cassonetto ha la profondità, e scriverla la salva; la tapparella non ce l'ha", () => {
    const onPatch = vi.fn();
    const { rerender } = render(riga(complemento({}), { onPatch }));
    const profondita = screen.getByLabelText("Prof.");
    fireEvent.change(profondita, { target: { value: "250" } });
    fireEvent.blur(profondita);
    expect(onPatch).toHaveBeenCalledWith({ profondita_mm: 250 });

    rerender(riga(complemento({ id: "t1", tipo: "tapparella", descrizione: "Tapparella PVC" })));
    expect(screen.queryByLabelText("Prof.")).toBeNull();
    expect(screen.getByLabelText("Largh.")).toBeTruthy();
  });

  it("senza complementi proposti dal listino il box lo dice, coi link, e resta il complemento a mano", () => {
    render(box({
      onAMano: vi.fn(),
      daCompletare: [{ chiave: "tapparelle", nome: "Tapparelle", indirizzo: "/azienda/impostazioni/listino?area=serramenti&tipologia=tapparelle" }],
    }));
    expect(screen.getByText("Misure della finestra: 1200 × 1400 mm · 2 pz")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tapparelle" }).getAttribute("href"))
      .toBe("/azienda/impostazioni/listino?area=serramenti&tipologia=tapparelle");
    expect(screen.getByRole("button", { name: "Complemento a mano" })).toBeTruthy();
  });

  it("una posizione che non prende complementi mostra quelli che ha, senza bottoni per aggiungerne", () => {
    render(box({ complementi: [complemento({ tipo: "tapparella", descrizione: "Tapparella PVC" })] }));
    // Scritta a mano: il nome sta nel suo campo, modificabile.
    expect(screen.getByDisplayValue("Tapparella PVC")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /a mano/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Elimina Tapparella PVC" })).toBeTruthy();
  });

  it("un complemento senza finestra si aggancia a una delle finestre", () => {
    render(riga(complemento({ serramento_id: null, descrizione: "Cassonetto coibentato" }), {
      finestre: [{ id: "w1", etichetta: "1 · Finestra 2 Ante · 1200×1400 mm" }],
    }));
    expect(screen.getByRole("combobox", { name: "Aggancia Cassonetto coibentato a una finestra" })).toBeTruthy();
  });
});
