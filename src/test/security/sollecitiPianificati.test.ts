import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ondata 5.6 — i solleciti al cliente in ritardo.
 *
 * Provato su produzione e poi ripulito (188 azioni create e cancellate):
 *   giro completo ................ 188 azioni su 188 fatture scadute
 *   secondo giro completo ........ 0 nuove azioni (188 → 188)
 *   doppione inserito a mano ..... respinto dal vincolo unico
 *   fattura stornata da una NC ... non viene sollecitata
 *   fatture già pagate ........... nessuna azione
 *   executed_at .................. NULL su tutte: nessun messaggio inviato
 *   canali voice e letter_legal .. mai usati, sono disattivati in politica
 *
 * Una prova era scritta male: con p_max=5 il secondo giro crea i cinque
 * successivi, non ripete i primi. L'idempotenza va misurata sul giro completo.
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("solleciti_al_cliente_pianificati"));
if (!nome) throw new Error("migrazione solleciti_al_cliente_pianificati non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("pianifica, non invia", () => {
  it("non scrive mai executed_at", () => {
    const insert = sql.slice(sql.indexOf("INSERT INTO public.dunning_actions"));
    expect(insert.slice(0, 400)).not.toMatch(/executed_at/);
  });

  it("il motivo per cui non invia è scritto, non sottinteso", () => {
    const testo = sql.replace(/\s*\n\s*--\s*/g, " ");
    expect(testo).toMatch(/spedire centottanta solleciti su fatture ferme dal 2024/);
    expect(testo).toMatch(/L'invio è un passo separato, e deliberato/);
  });

  it("non è eseguibile da un utente qualunque", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.dunning_pianifica\(uuid, integer\) FROM authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.dunning_pianifica\(uuid, integer\) TO service_role/);
  });
});

describe("chi viene sollecitato", () => {
  it("solo fatture, non note di credito", () => {
    expect(sql).toMatch(/coalesce\(i\.document_type, 'invoice'\) = 'invoice'/);
  });

  it("il residuo è al netto delle note di credito collegate", () => {
    expect(sql).toMatch(/nc\.credited_invoice_id = i\.id/);
    expect(sql).toMatch(/nc\.document_type = 'credit_note'/);
  });

  it("le pagate e le cancellate restano fuori", () => {
    expect(sql).toMatch(/coalesce\(i\.status, ''\) <> 'paid'/);
    expect(sql).toMatch(/i\.deleted_at IS NULL/);
  });

  it("solo chi ha un residuo aperto", () => {
    expect(sql).toMatch(/SELECT \* FROM scadute WHERE residuo > 0/);
  });
});

describe("il passo e il canale", () => {
  it("il passo è l'ultimo intervallo trascorso", () => {
    expect(sql).toMatch(/SELECT max\(n\) FROM generate_series\(1, v_passi\) n\s*\n\s*WHERE a\.giorni >= pol\.step_days\[n\]/);
  });

  it("i passi sono il minimo fra intervalli e canali dichiarati", () => {
    expect(sql).toMatch(/v_passi := least\(/);
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /un passo senza canale non è un passo/);
  });

  it("una politica senza passi lo dichiara invece di non fare niente in silenzio", () => {
    expect(sql).toMatch(/politica senza passi utilizzabili/);
  });

  it("un canale disattivato in politica non viene usato", () => {
    expect(sql).toMatch(/pol\.enable_auto_voice_call IS NOT TRUE THEN 'email'/);
    expect(sql).toMatch(/pol\.enable_legal_letter\s+IS NOT TRUE THEN 'email'/);
  });

  it("senza indirizzo diventa un promemoria per una persona, non un invio", () => {
    expect(sql).toMatch(/coalesce\(d\.client_email, ''\) = ''\s+THEN 'manual'/);
  });
});

describe("non si sollecita due volte", () => {
  it("c'è un vincolo unico, non solo un controllo", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_dunning_actions_fattura_passo/);
    expect(sql).toMatch(/ON public\.dunning_actions \(invoice_id, step_n\)/);
    expect(sql).toMatch(/l'idempotenza dev'essere un vincolo, non una buona intenzione/);
  });
});

describe("customer_id resta vuoto, e si sa perché", () => {
  it("la ragione è nel codice", () => {
    const testo = sql.replace(/\s*\n\s*--\s*/g, " ");
    expect(testo).toMatch(/invoices\.client_id\s+-> marketing_contacts\(id\)/);
    expect(testo).toMatch(/dunning_actions\.customer_id -> profiles\(id\)/);
    expect(testo).toMatch(/su 201 fatture con client_id, zero corrispondono a un profilo/);
  });
});
