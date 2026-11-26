/**
 * Le colonne dello scadenzario scelte e riordinate dall'azienda (26/11/2026).
 *
 * La tabella disegnava le colonne nell'ordine in cui erano scritte, e due di loro
 * sparivano per larghezza dello schermo (`hidden min-[1800px]:table-cell`). Ora è l'azienda
 * a dire cosa vede e in che ordine: qui si controlla che la tabella la ascolti davvero —
 * testata e celle insieme, perché disallinearle è il modo tipico di rompere una tabella.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScadenzarioTable from "@/components/scadenzario/ScadenzarioTable";
import { DEF_SCADENZE } from "@/lib/scadenzario/colonneScadenzario";
import type { Scadenza } from "@/hooks/useScadenzario";
import { colonneVisibili, conColonnaAccesa, conColonnaSpostata } from "@/lib/tabelle/colonneTabella";

const riga = {
  id: "s1",
  description: "Saldo lavori",
  direction: "uscita",
  tipo: "costo_aziendale",
  amount: 1220,
  paid_amount: 220,
  due_date: "2026-12-10",
  status: "parziale",
  payment_method: "bonifico",
} as Scadenza;

const tabella = (colonne?: ReturnType<typeof colonneVisibili>) =>
  render(
    <ScadenzarioTable
      scadenze={[riga]}
      colonne={colonne}
      onMarkPaid={vi.fn()}
      onCancel={vi.fn()}
      onNota={vi.fn()}
      onModifica={vi.fn()}
    />,
  );

/** Le intestazioni della tabella da computer, senza la selezione e senza le azioni. */
const teste = () =>
  screen
    .getAllByRole("columnheader")
    .map((th) => th.textContent?.trim())
    .filter((t) => t && t !== "Azioni");

/** Quante celle ha la riga: deve combaciare con le intestazioni, o la tabella è storta. */
const celleDellaRiga = () => {
  const righe = screen.getAllByRole("row");
  const dati = righe[righe.length - 1];
  return dati.querySelectorAll("td").length;
};

afterEach(cleanup);

describe("le colonne dello scadenzario", () => {
  it("di serie mostra le predefinite, con «Tipo» spenta", () => {
    tabella();
    expect(teste()).toEqual([
      "Scadenza",
      "Cliente / fornitore",
      "Descrizione",
      "Documento · commessa",
      "Modalità",
      "Importo",
      "Residuo",
      "Stato",
    ]);
    expect(teste()).not.toContain("Tipo");
  });

  it("testata e celle restano allineate", () => {
    tabella();
    // +1: la colonna delle azioni, che non è scegliibile.
    expect(celleDellaRiga()).toBe(teste().length + 1);
  });

  it("spenta una colonna, sparisce da testata e righe insieme", () => {
    const pref = conColonnaAccesa(DEF_SCADENZE, undefined, "metodo", false);
    tabella(colonneVisibili(DEF_SCADENZE, pref));
    expect(teste()).not.toContain("Modalità");
    expect(celleDellaRiga()).toBe(teste().length + 1);
  });

  it("riaccesa «Tipo», compare al suo posto", () => {
    const pref = conColonnaAccesa(DEF_SCADENZE, undefined, "tipo", true);
    tabella(colonneVisibili(DEF_SCADENZE, pref));
    expect(teste()[1]).toBe("Tipo");
    expect(celleDellaRiga()).toBe(teste().length + 1);
  });

  it("l'ordine scelto è quello che si vede", () => {
    const pref = conColonnaSpostata(DEF_SCADENZE, undefined, "importo", 0);
    tabella(colonneVisibili(DEF_SCADENZE, pref));
    expect(teste()[0]).toBe("Importo");
    expect(celleDellaRiga()).toBe(teste().length + 1);
  });

  it("le colonne che non si possono spegnere restano comunque", () => {
    let pref = conColonnaAccesa(DEF_SCADENZE, undefined, "scadenza", false);
    pref = conColonnaAccesa(DEF_SCADENZE, pref, "descrizione", false);
    tabella(colonneVisibili(DEF_SCADENZE, pref));
    expect(teste()).toContain("Scadenza");
    expect(teste()).toContain("Descrizione");
  });
});
