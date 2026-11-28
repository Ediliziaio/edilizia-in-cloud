import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ScadenzarioTable from "@/components/scadenzario/ScadenzarioTable";
import { RiepilogoPeriodo } from "@/components/scadenzario/RiepilogoPeriodo";
import { effettiPerRiga, type Effetto } from "@/lib/finance/effettiScadenzario";
import type { Scadenza } from "@/hooks/useScadenzario";

const scaduta = { id: "r1", description: "Fattura 77 · ROSSI SRL", direction: "uscita", tipo: "pagamento_fornitore",
  amount: 1000, paid_amount: 0, due_date: "2020-01-10", status: "da_pagare" } as Scadenza;
const eff = (o: Partial<Effetto> = {}): Effetto => ({ id: "e1", tipo: "assegno", direzione: "emesso", importo: 1000, data_scadenza: "2999-12-15",
  stato: "in_attesa", riga_scadenzario_id: "r1", ...o });
afterEach(cleanup);
const mostra = (effetti?: Effetto[]) => render(<ScadenzarioTable scadenze={[scaduta]} onMarkPaid={vi.fn()} onCancel={vi.fn()} effetti={effettiPerRiga(effetti)} />);

it("senza effetti la riga scaduta dice «Scaduta»", () => {
  mostra();
  expect(screen.getAllByText("Scaduta").length).toBeGreaterThan(0);
  expect(screen.queryByTestId("badge-effetti")).toBeNull();
});

it("con un assegno che copre tutto: badge «Assegno al 15/12» e «Coperta da assegno», non «Scaduta»", () => {
  mostra([eff()]);
  expect(screen.getAllByTestId("badge-effetti")[0].textContent).toBe("Assegno al 15/12");
  expect(screen.getAllByText("Coperta da assegno").length).toBeGreaterThan(0);
  expect(screen.queryByText("Scaduta")).toBeNull();
});

it("con un assegno solo per una parte resta «Scaduta»", () => {
  mostra([eff({ importo: 300 })]);
  expect(screen.getAllByText("Scaduta").length).toBeGreaterThan(0);
});

it("il riquadro «Da incassare / pagare» dice quanto è in assegni", () => {
  const somma = (importo: number, n = 1) => ({ n, importo });
  const vuota = () => ({ totale: somma(0, 0), saldato: somma(0, 0), aperto: somma(0, 0), scaduto: somma(0, 0) });
  render(<RiepilogoPeriodo attivo={null} conArretrato={false} onScegli={vi.fn()}
    riepilogo={{ entrate: vuota(), uscite: { ...vuota(), aperto: somma(1500, 2), coperto: somma(1000) }, arretrato: null, troncato: false,
      linguette: { aperte: 0, tutte: 0, da_incassare: 0, da_pagare: 0, scadute: 0, pagate: 0 } }} />);
  expect(screen.getByTestId("di-cui-effetti").textContent).toMatch(/di cui .*1\.000.* in assegni/);
});
