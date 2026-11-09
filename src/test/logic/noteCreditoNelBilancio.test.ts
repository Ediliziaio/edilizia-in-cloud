/**
 * Le note di credito nel bilancio (09/11/2026).
 *
 * In `invoices` una nota di credito è salvata con `total` positivo: si
 * riconosce solo dal `document_type`. Chi somma senza guardarlo gonfia i
 * ricavi e si tiene in casa crediti che non incasserà mai.
 *
 * Questo test sorveglia le due query dove il segno conta, perché l'errore è
 * invisibile: i numeri tornano, sono solo più grandi.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("La vista dei ricavi", () => {
  const sql = leggi(
    "supabase/migrations/20290116100000_bilancio_note_credito_col_segno_giusto.sql",
  );

  it("dà il segno meno alle note di credito, sull'imponibile e sull'IVA", () => {
    const segni = sql.match(/case when i\.document_type = 'credit_note' then -1 else 1 end/g);
    expect(segni).toHaveLength(2);
  });

  it("lascia fuori le fatture cancellate", () => {
    expect(sql).toContain("i.deleted_at is null");
  });

  it("non tocca il resto: il ripiego sugli ordini resta quello di prima", () => {
    expect(sql).toContain("ricavi_orders");
    expect(sql).toContain("not exists");
    // Le date restano le stesse: qui si corregge il segno, non la competenza.
    expect(sql).toContain("i.issue_date as data");
    expect(sql).toContain("o.created_at::date as data");
  });

  it("elenca le colonne una per una: un UNION con select * si rompe in silenzio", () => {
    expect(sql).not.toMatch(/select \*\s+from ricavi_invoices/);
    expect(sql).toContain("select company_id, data, importo_imponibile");
  });
});

describe("I crediti verso clienti", () => {
  const sql = leggi(
    "supabase/migrations/20290116110000_crediti_clienti_meno_le_note_di_credito.sql",
  );

  it("sottrae le note di credito dal credito", () => {
    expect(sql).toContain("CASE WHEN i.document_type = ''credit_note'' THEN -1 ELSE 1 END");
  });

  it("riscrive solo quel blocco, e si ferma se non lo trova", () => {
    expect(sql).toContain("v_vecchio");
    expect(sql).toMatch(/raise exception 'Il blocco dei crediti verso clienti è cambiato/);
  });

  it("girare due volte non fa danni", () => {
    expect(sql).toMatch(/if position\(v_nuovo in v_def\) > 0 then\s+return;/);
  });

  it("dice che un netto negativo non è un errore del calcolo", () => {
    // Il commento va a capo: si confronta il testo senza i trattini e le righe.
    const prosa = sql.replace(/^--\s?/gm, "").replace(/\s+/g, " ");
    expect(prosa).toContain("il netto diventa negativo");
    expect(prosa).toContain("non sono agganciate alle fatture che rettificano");
  });
});

describe("La data dei costi", () => {
  const sql = leggi(
    "supabase/migrations/20290116120000_costi_datati_per_competenza.sql",
  );

  it("non data più il costo al pagamento: prima viene la competenza", () => {
    const prosa = sql.replace(/\s+/g, " ");
    expect(prosa).toContain(
      "coalesce( cc.mese_competenza, cc.documento_data, fr.data_fattura, cc.due_date, cc.paid_date )",
    );
    // Il pagamento resta l'ultima spiaggia, non il primo criterio.
    expect(prosa).not.toContain("coalesce(cc.paid_date, cc.due_date)");
  });

  it("la data del documento arriva dalla fattura ricevuta collegata", () => {
    expect(sql).toContain("left join fatture_ricevute fr on fr.company_cost_id = cc.id");
  });

  it("le uscite di banca restano datate al movimento", () => {
    expect(sql).toContain("coalesce(bt.value_date, bt.booking_date) as data");
  });

  it("i giroconti restano fuori: non sono costi", () => {
    expect(sql).toContain("girocont%");
  });

  it("la classificazione resta un join che non scarta righe", () => {
    expect(sql).toContain("left join cg_classificazione_voci");
  });
});
