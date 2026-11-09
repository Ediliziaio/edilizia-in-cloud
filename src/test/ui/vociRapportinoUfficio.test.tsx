// Voci libere nel modulo dell'ufficio: dal catalogo dell'azienda, o a mano se l'azienda lo permette.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { VoceUfficio } from "@/lib/campo/rapportiniUfficio";

const m = vi.hoisted(() => ({ catalogo: { voci: [] as unknown[], aMano: true } }));
vi.mock("@/hooks/useCatalogoVociRapportino", () => ({ useCatalogoVociRapportino: () => ({ data: m.catalogo }) }));

import { VociRapportinoUfficio } from "@/components/orders/VociRapportinoUfficio";

afterEach(cleanup);

it("scegliendo dal catalogo arrivano nome, unità e prezzi", () => {
  m.catalogo = { voci: [{ id: "1", nome: "Trasporto", unita: "viaggi", costo_unitario: 50.5, vendita_unitaria: 80 }], aMano: false };
  const onCambia = vi.fn();
  render(<VociRapportinoUfficio companyId="c" voci={[]} onCambia={onCambia} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Aggiungi una voce" }), { target: { value: "1" } });
  expect(onCambia.mock.calls[0][0][0]).toMatchObject({ descrizione: "Trasporto", quantita: "1", unita: "viaggi", costo: "50,5", vendita: "80" });
  expect(screen.queryByRole("button", { name: /Scrivi una voce/ })).toBeNull();
});

it("si scrive a mano e si toglie", () => {
  m.catalogo = { voci: [], aMano: true };
  const onCambia = vi.fn();
  const voci: VoceUfficio[] = [{ chiave: "a", descrizione: "Nolo", quantita: "1", unita: "cad", costo: "", vendita: "" }];
  render(<VociRapportinoUfficio companyId="c" voci={voci} onCambia={onCambia} />);
  fireEvent.click(screen.getByRole("button", { name: /Scrivi una voce/ }));
  expect(onCambia.mock.calls[0][0]).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Togli la voce 1" }));
  expect(onCambia.mock.calls[1][0]).toEqual([]);
});

it("azienda senza catalogo e senza voci a mano: non si mostra", () => {
  m.catalogo = { voci: [], aMano: false };
  const { container } = render(<VociRapportinoUfficio companyId="c" voci={[]} onCambia={vi.fn()} />);
  expect(container.firstChild).toBeNull();
});
