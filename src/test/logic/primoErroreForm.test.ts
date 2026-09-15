/**
 * Il pulsante "Crea Commessa" non deve mai restare muto: se il form ha un
 * errore, qualcosa da mostrare all'utente deve uscire sempre.
 */
import { describe, it, expect } from "vitest";
import { primoErroreForm } from "@/lib/form/primoErroreForm";
import { orderSchema, orderDefaultValues } from "@/lib/orderSchema";

describe("primoErroreForm", () => {
  it("nessun errore: niente da mostrare", () => {
    expect(primoErroreForm({})).toBeNull();
    expect(primoErroreForm(null)).toBeNull();
  });

  it("errore di primo livello: messaggio e nome del campo in italiano", () => {
    const e = primoErroreForm({ description: { type: "too_small", message: "La descrizione deve avere almeno 3 caratteri" } });
    expect(e).toEqual({ campo: "Descrizione", messaggio: "La descrizione deve avere almeno 3 caratteri", percorso: "description" });
  });

  it("errore ANNIDATO (dati del venditore): prima era muto, ora esce", () => {
    const e = primoErroreForm({
      salesperson_data: { commission_value: { type: "invalid_type", message: "Expected number, received null" } },
    });
    expect(e?.campo).toBe("Venditore");
    expect(e?.percorso).toBe("salesperson_data.commission_value");
    expect(e?.messaggio).toBe("Expected number, received null");
  });

  it("non si perde nel riferimento al campo HTML (ref circolare)", () => {
    const campo: Record<string, unknown> = {};
    campo.self = campo;
    const e = primoErroreForm({ customer_id: { type: "too_small", message: "Seleziona un cliente", ref: campo } });
    expect(e?.messaggio).toBe("Seleziona un cliente");
  });

  it("errore senza alcun messaggio: si dice comunque quale campo", () => {
    const e = primoErroreForm({ vat_rate: { type: "custom" } });
    expect(e).toEqual({ campo: "IVA", messaggio: "dato non valido", percorso: "vat_rate" });
  });

  it("campo sconosciuto: si usa il suo nome tecnico invece di tacere", () => {
    expect(primoErroreForm({ campo_nuovo: { message: "obbligatorio" } })?.campo).toBe("campo_nuovo");
  });

  it("dal vero schema della commessa: venditore con provvigione vuota non è più un blocco muto", () => {
    const r = orderSchema.safeParse({
      ...orderDefaultValues,
      customer_id: "c1",
      description: "Impianto FV",
      total_amount: "12200",
      salesperson_id: "s1",
      salesperson_data: { commission_type: "percentage", commission_value: null, compensation_mode: null },
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    // Ricostruisce l'albero come lo consegna react-hook-form al gestore onInvalid.
    const albero: Record<string, unknown> = {};
    for (const i of r.error.issues) {
      let nodo = albero;
      i.path.forEach((p, idx) => {
        const k = String(p);
        if (idx === i.path.length - 1) nodo[k] = { type: i.code, message: i.message };
        else nodo = (nodo[k] ??= {}) as Record<string, unknown>;
      });
    }
    const e = primoErroreForm(albero);
    expect(e).not.toBeNull();
    expect(e?.campo).toBe("Venditore");
  });
});
