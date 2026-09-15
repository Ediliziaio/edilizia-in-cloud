/**
 * Modificare un componente FV non deve cancellare i dati che la schermata non
 * mostra. Caso reale: salvare il prezzo di vendita di un inverter azzerava il
 * suo prezzo di acquisto.
 */
import { describe, it, expect } from "vitest";
import { campiDaAggiornare } from "@/lib/fotovoltaico/campiAggiornamento";

// Tipo esplicito: il progetto ha noImplicitAny, e un `null` dentro un oggetto
// senza tipo verrebbe letto come `any`.
type PayloadFv = Record<string, string | number | boolean | null>;

const payloadCompleto: PayloadFv = {
  company_id: "renova",
  descrizione: "Inverter ibrido monofase 5 kW",
  categoria_fv: "inverter",
  prezzo_vendita: 900,
  prezzo_acquisto: null,
  garanzia_anni: null,
  efficienza_pct: null,
  unita_misura: "pz",
  potenza_kw: 5,
  attivo: true,
};

describe("campiDaAggiornare", () => {
  it("il prezzo di acquisto NON passato dalla schermata non viene scritto (prima diventava null)", () => {
    const input = { descrizione: "Inverter ibrido monofase 5 kW", categoria_fv: "inverter", prezzo_vendita: 900, potenza_kw: 5 };
    const campi = campiDaAggiornare(payloadCompleto, input);
    expect(campi).not.toHaveProperty("prezzo_acquisto");
    expect(campi).not.toHaveProperty("garanzia_anni");
    expect(campi).not.toHaveProperty("efficienza_pct");
    expect(campi).not.toHaveProperty("unita_misura");
  });

  it("i campi passati si scrivono, compreso un null voluto", () => {
    const input: PayloadFv = { descrizione: "x", categoria_fv: "inverter", prezzo_vendita: 900, potenza_kw: null };
    const conPotenzaVuota: PayloadFv = { ...payloadCompleto, potenza_kw: null };
    const campi = campiDaAggiornare(conPotenzaVuota, input);
    expect(campi.prezzo_vendita).toBe(900);
    expect(campi).toHaveProperty("potenza_kw", null);
  });

  it("company_id e attivo restano sempre", () => {
    const campi = campiDaAggiornare(payloadCompleto, { prezzo_vendita: 900 });
    expect(campi.company_id).toBe("renova");
    expect(campi.attivo).toBe(true);
  });

  it("chi passa esplicitamente il prezzo di acquisto lo può ancora cambiare", () => {
    const campi = campiDaAggiornare({ ...payloadCompleto, prezzo_acquisto: 744 }, { prezzo_acquisto: 744 });
    expect(campi.prezzo_acquisto).toBe(744);
  });
});
