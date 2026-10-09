/**
 * Il cliente che un preventivo prende dal contatto del CRM (`?contact_id=…`): `riempiClienteVuoto` e `leggiClienteDelContatto`
 * (07/10/2026). Il contatto arriva dopo il caricamento della pagina e dopo che chi lavora può aver già scritto: riempie solo
 * ciò che è ancora vuoto, mai ciò che è stato scritto. Prove dirette, senza passare dai wizard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const finto = vi.hoisted(() => ({
  riga: null as null | Record<string, unknown>,
  errore: null as null | { message: string },
  interrogato: [] as Array<{ tabella: string; colonne: string; filtro: [string, unknown] | null }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const q: { tabella: string; colonne: string; filtro: [string, unknown] | null } = { tabella, colonne: "", filtro: null };
      finto.interrogato.push(q);
      const b: Record<string, unknown> = {};
      b.select = (colonne: string) => { q.colonne = colonne; return b; };
      b.eq = (colonna: string, valore: unknown) => { q.filtro = [colonna, valore]; return b; };
      b.maybeSingle = () => Promise.resolve({ data: finto.riga, error: finto.errore });
      return b;
    },
  },
}));

import { leggiClienteDelContatto, riempiClienteVuoto, type ClienteDelContatto } from "@/lib/preventivatore/clienteDalContatto";

const contatto: ClienteDelContatto = {
  cliente_nome: "Giulia", cliente_cognome: "Neri", cliente_email: "giulia.neri@example.it", cliente_telefono: "347 000 1111",
};

describe("riempiClienteVuoto", () => {
  it("riempie i campi vuoti (assenti, nulli, stringhe vuote o di soli spazi)", () => {
    const form = { cliente_nome: "", cliente_cognome: "   ", cliente_email: null as string | null };
    expect(riempiClienteVuoto(form, contatto)).toEqual({
      cliente_nome: "Giulia", cliente_cognome: "Neri", cliente_email: "giulia.neri@example.it", cliente_telefono: "347 000 1111",
    });
  });

  it("non tocca ciò che è già scritto, anche se il contatto dice altro, e riempie solo il resto", () => {
    const form: Partial<Record<keyof ClienteDelContatto, string | null>> = { cliente_nome: "", cliente_cognome: "Bianchi", cliente_telefono: "  333 111 2222 " };
    const risultato = riempiClienteVuoto(form, contatto);
    expect(risultato.cliente_cognome).toBe("Bianchi");
    expect(risultato.cliente_telefono).toBe("  333 111 2222 "); // com'è stato scritto, spazi compresi
    expect(risultato.cliente_nome).toBe("Giulia");
    expect(risultato.cliente_email).toBe("giulia.neri@example.it");
  });

  it("un contatto senza quel dato (nullo) non scrive niente al suo posto", () => {
    const senzaEmail: ClienteDelContatto = { ...contatto, cliente_email: null, cliente_telefono: null };
    const risultato = riempiClienteVuoto({ cliente_nome: "" }, senzaEmail);
    expect(risultato).toEqual({ cliente_nome: "Giulia", cliente_cognome: "Neri" });
    expect("cliente_email" in risultato).toBe(false);
    expect("cliente_telefono" in risultato).toBe(false);
  });

  it("se non c'è niente da riempire restituisce lo STESSO oggetto (nessun rinnovo inutile della pagina)", () => {
    const scritto = { cliente_nome: "Anna", cliente_cognome: "Bianchi", cliente_email: "a@b.it", cliente_telefono: "1" };
    expect(riempiClienteVuoto(scritto, contatto)).toBe(scritto);
    const vuoto = { cliente_nome: "" };
    expect(riempiClienteVuoto(vuoto, { cliente_nome: null, cliente_cognome: null, cliente_email: null, cliente_telefono: null })).toBe(vuoto);
  });

  it("non cambia l'oggetto di partenza e lascia stare gli altri campi del preventivo", () => {
    const form = { cliente_nome: "", sconto_pct: 5, iva_pct: 10, note: "ok" };
    const copia = { ...form };
    const risultato = riempiClienteVuoto(form, contatto);
    expect(form).toEqual(copia);
    expect(risultato).toMatchObject({ sconto_pct: 5, iva_pct: 10, note: "ok", cliente_nome: "Giulia" });
  });
});

describe("leggiClienteDelContatto", () => {
  beforeEach(() => { finto.riga = null; finto.errore = null; finto.interrogato.length = 0; });

  it("legge nome, cognome, email e telefono di QUEL contatto, senza spazi attorno", async () => {
    finto.riga = { first_name: " Giulia ", last_name: "Neri", email: " giulia.neri@example.it", phone: "347 000 1111 " };
    await expect(leggiClienteDelContatto("cnt-1")).resolves.toEqual(contatto);
    expect(finto.interrogato).toEqual([{ tabella: "marketing_contacts", colonne: "first_name, last_name, email, phone", filtro: ["id", "cnt-1"] }]);
  });

  it("i dati vuoti del contatto diventano nulli (non stringhe vuote che sembrano scritte)", async () => {
    finto.riga = { first_name: "Giulia", last_name: "", email: "   ", phone: null };
    await expect(leggiClienteDelContatto("cnt-1")).resolves.toEqual({
      cliente_nome: "Giulia", cliente_cognome: null, cliente_email: null, cliente_telefono: null,
    });
  });

  it("un contatto che non si legge (errore, non visibile o cancellato) è nullo, senza lanciare", async () => {
    finto.errore = { message: "boom" };
    await expect(leggiClienteDelContatto("cnt-1")).resolves.toBeNull();
    finto.errore = null;
    finto.riga = null;
    await expect(leggiClienteDelContatto("cnt-2")).resolves.toBeNull();
  });
});
