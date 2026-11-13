import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AnnullaIncassoDialog } from "@/components/scadenzario/AnnullaIncassoDialog";
import ScadenzarioTable from "@/components/scadenzario/ScadenzarioTable";
import type { Scadenza } from "@/hooks/useScadenzario";
import { siAnnullaIncasso } from "@/lib/finance/annulloIncassoScadenza";
import {
  abbinamentoAnnullato,
  chiaviAbbinamentiAnnullati,
} from "../../../supabase/functions/bank-auto-reconcile/abbinamentiAnnullati";
import autoRiconciliazione from "../../../supabase/functions/bank-auto-reconcile/index.ts?raw";
import registro from "../../../supabase/migrations/20290316140000_bank_movimenti_workspace_ripartizioni.sql?raw";
import dialogRiporta from "@/components/fatturazione/RiportaDaIncassare.tsx?raw";
import migrazione from "../../../supabase/migrations/20281211140000_annulla_incasso_scadenza.sql?raw";

const scadenza = (altro: Partial<Scadenza> = {}): Scadenza => ({
  id: "s-1", company_id: "az-1", tipo: "incasso_cliente", direction: "entrata", description: "Fattura FPR 10/26",
  amount: 1000, due_date: "2026-10-01", status: "pagata", paid_amount: 1000, paid_date: "2026-10-02", payment_method: "bonifico",
  invoice_id: "inv-1", order_id: null, supplier_id: null, cost_id: null, contact_id: null, order_item_id: null,
  prima_nota_entry_id: "pn-1", alert_days_before: 7, alert_sent_at: null, is_auto_generated: true, auto_source: "invoice",
  notes: null, is_recurring: false, created_at: "2026-10-01", updated_at: "2026-10-02",
  ...altro,
});

afterEach(cleanup);

describe("quali scadenze si annullano dallo scadenzario", () => {
  it("l'incasso pagato o parziale con il suo movimento di prima nota", () => {
    expect(siAnnullaIncasso(scadenza())).toBe(true);
    expect(siAnnullaIncasso(scadenza({ status: "parziale", paid_amount: 300 }))).toBe(true);
  });

  it("non una scadenza pagata senza movimento: viene dall'import o da un'altra strada", () => {
    expect(siAnnullaIncasso(scadenza({ prima_nota_entry_id: null }))).toBe(false);
  });

  it("non un pagamento a fornitore, non un costo, non una scadenza aperta", () => {
    expect(siAnnullaIncasso(scadenza({ direction: "uscita", tipo: "pagamento_fornitore" }))).toBe(false);
    expect(siAnnullaIncasso(scadenza({ cost_id: "c-1" }))).toBe(false);
    expect(siAnnullaIncasso(scadenza({ status: "da_pagare" }))).toBe(false);
    expect(siAnnullaIncasso(scadenza({ status: "annullata" }))).toBe(false);
  });

  it("non la scadenza di una fattura interna: si annulla dalla fattura", () => {
    expect(siAnnullaIncasso(scadenza({ notes: "[DOC:abc]" }))).toBe(false);
  });
});

describe("azione nella tabella e conferma", () => {
  it("il clic chiede l'annullo della scadenza senza aprire la riga", () => {
    const annulla = vi.fn();
    const apriRiga = vi.fn();
    render(<ScadenzarioTable scadenze={[scadenza()]} onMarkPaid={vi.fn()} onCancel={vi.fn()} onAnnullaIncasso={annulla} onRowClick={apriRiga} />);
    // Una per il telefono, una per il desktop: nel DOM ci sono entrambe.
    const pulsanti = screen.getAllByRole("button", { name: "Annulla l'incasso di Fattura FPR 10/26" });
    expect(pulsanti).toHaveLength(2);
    fireEvent.click(pulsanti[1]);
    expect(annulla).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "s-1" }));
    expect(apriRiga).not.toHaveBeenCalled();
  });

  it("niente pulsante su una scadenza che non si annulla da qui", () => {
    render(<ScadenzarioTable scadenze={[scadenza({ prima_nota_entry_id: null })]} onMarkPaid={vi.fn()} onCancel={vi.fn()} onAnnullaIncasso={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Annulla l'incasso/ })).toBeNull();
  });

  it("la conferma dice l'importo e passa l'id", () => {
    const conferma = vi.fn();
    render(<AnnullaIncassoDialog scadenza={scadenza({ status: "parziale", paid_amount: 300 })} onClose={vi.fn()} onConfirm={conferma} isPending={false} />);
    const dialogo = screen.getByRole("alertdialog");
    expect(within(dialogo).getByRole("heading").textContent).toMatch(/300/);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Annulla incasso" }));
    expect(conferma).toHaveBeenCalledExactlyOnceWith("s-1");
  });
});

describe("bank-auto-reconcile ricorda gli abbinamenti annullati", () => {
  const chiavi = chiaviAbbinamentiAnnullati([
    { transaction_id: "tx-1", invoice_id: "inv-1", documento_id: null, scadenza_id: null },
    // Interna: movimento_id si è azzerato con lo storno, documento_id è rimasto.
    { transaction_id: "tx-2", invoice_id: null, documento_id: "doc-1", scadenza_id: "sc-doc" },
    // Sganciato dalla scadenza di una fattura importata: vale anche per la fattura.
    { transaction_id: "tx-3", invoice_id: null, documento_id: null, scadenza_id: "sc-1", scadenze: { invoice_id: "inv-3" } },
  ]);

  it("scarta la stessa coppia, per fattura importata, interna e scadenza", () => {
    expect(abbinamentoAnnullato(chiavi, "tx-1", "fattura", "inv-1")).toBe(true);
    expect(abbinamentoAnnullato(chiavi, "tx-2", "documento", "doc-1")).toBe(true);
    expect(abbinamentoAnnullato(chiavi, "tx-3", "scadenza", "sc-1")).toBe(true);
    expect(abbinamentoAnnullato(chiavi, "tx-3", "fattura", "inv-3")).toBe(true);
  });

  it("lo stesso bonifico può ancora andare su un'altra fattura, e un altro bonifico sulla stessa", () => {
    expect(abbinamentoAnnullato(chiavi, "tx-1", "fattura", "inv-2")).toBe(false);
    expect(abbinamentoAnnullato(chiavi, "tx-9", "fattura", "inv-1")).toBe(false);
  });

  it("le nuove proposte consultano lo storico annullato nel database, senza registrare pagamenti", () => {
    expect(autoRiconciliazione).toContain('client.rpc("bank_suggerisci_riconciliazioni"');
    expect(registro).toContain('old.unmatched_at IS NOT NULL');
    for(const target of ['old.invoice_id=c.id','old.documento_id=c.id','old.scadenza_id=c.id','op.documento_fiscale_id=c.id']) expect(registro).toContain(target);
  });
  it("il dialogo di «Riporta da incassare» non avvisa più del riabbinamento", () => {
    expect(dialogRiporta).not.toContain("riabbinarlo");
  });
});

describe("migrazione", () => {
  it("la funzione nasce chiusa ad anon e il documento resta dopo lo storno", () => {
    expect(migrazione).toMatch(/revoke all on function public\.annulla_incasso_scadenza\(uuid\) from public, anon/);
    // Una chiave esterna con SET NULL violerebbe target_check e fermerebbe il cestino dei documenti.
    expect(migrazione).toMatch(/add column if not exists documento_id uuid;/);
    expect(migrazione).toContain("or documento_id is not null");
    expect(migrazione).toMatch(/set local lock_timeout/);
  });

  it("rifiuta se c'è un bonifico o se i movimenti non spiegano il pagato", () => {
    expect(migrazione).toContain("sgancialo prima dalla Tesoreria");
    expect(migrazione).toMatch(/abs\(coalesce\(s\.paid_amount, 0\) - v_importo\) > 0\.01/);
    expect(migrazione).toMatch(/i\.deleted_at is not null or i\.status in \('cancelled', 'credited', 'draft'\)/);
  });
});
