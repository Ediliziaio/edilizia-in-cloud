import { describe, expect, it } from "vitest";
import { cifreTelefono, espressioneCifre, filtriRicercaContatti, filtriRicercaParole, paroleRicerca } from "@/lib/ricerca/ricercaContatti";
import sorgentePaginaContatti from "@/pages/azienda/marketing/MarketingContacts.tsx?raw";
import sorgenteAppuntamento from "@/components/marketing/MarketingAppointmentDialog.tsx?raw";

type Contatto = Record<string, string | null>;

/** Come li valuta PostgREST: ogni condizione è un OR fra campi, e le condizioni valgono tutte insieme. */
function trova(contatto: Contatto, filtri: string[]): boolean {
  return filtri.every((filtro) =>
    filtro.split(",").some((pezzo) => {
      const [campo, operatore, ...resto] = pezzo.split(".");
      const valore = resto.join(".");
      const testo = contatto[campo] ?? "";
      if (operatore === "imatch") return new RegExp(valore, "i").test(testo);
      // Come ILIKE: «\_» e «\%» sono il carattere vero, non il jolly.
      const cercato = valore.replace(/^%|%$/g, "").replace(/\\([\\%_])/g, "$1");
      return testo.toLowerCase().includes(cercato.toLowerCase());
    }),
  );
}

const vuoto: Contatto = { first_name: "", last_name: "", email: "", phone: "", company_name: null, city: null, fiscal_code: null, vat_number: null };

describe("Ricerca contatti: una condizione per parola", () => {
  it("nome e cognome insieme diventano due condizioni", () => {
    const filtri = filtriRicercaContatti("Lia Logar");
    expect(filtri).toHaveLength(2);
    expect(filtri[0]).toContain("first_name.ilike.%Lia%");
    expect(filtri[1]).toContain("last_name.ilike.%Logar%");
  });

  it("i caratteri che rompono la ricerca si tolgono, i jolly diventano lettere", () => {
    expect(paroleRicerca("Rossi, (Mario)")).toEqual(["Rossi", "Mario"]);
    expect(paroleRicerca("50%")).toEqual(["50\\%"]);
    expect(paroleRicerca("   ")).toEqual([]);
    expect(filtriRicercaContatti(",,,")).toEqual([]);
  });

  it("con altri campi, per altre tabelle", () => {
    expect(filtriRicercaParole("Edil Rossi", ["business_name", "email"])).toEqual([
      "business_name.ilike.%Edil%,email.ilike.%Edil%",
      "business_name.ilike.%Rossi%,email.ilike.%Rossi%",
    ]);
  });
});

describe("Ricerca contatti: nome, email, città, codici", () => {
  // Il contatto vero che Roberta non trovava (BeMade, 24/09/2026).
  const elide: Contatto = { ...vuoto, first_name: "ELIDE", last_name: "RUGGIATA/ANTONIO CANNAS", phone: "3455126755" };

  it("«Nome Cognome» trova il contatto: prima si cercava la frase intera in un campo solo", () => {
    expect(trova(elide, filtriRicercaContatti("ELIDE RUGGIATA"))).toBe(true);
    expect(trova(elide, filtriRicercaContatti("ruggiata elide"))).toBe(true);
    const fraseIntera = ["first_name.ilike.%ELIDE RUGGIATA%,last_name.ilike.%ELIDE RUGGIATA%,phone.ilike.%ELIDE RUGGIATA%,email.ilike.%ELIDE RUGGIATA%"];
    expect(trova(elide, fraseIntera)).toBe(false);
  });

  it("ogni parola deve esserci: un'altra Elide non basta", () => {
    expect(trova({ ...elide, last_name: "Bianchi" }, filtriRicercaContatti("ELIDE RUGGIATA"))).toBe(false);
  });

  it("l'email intera o un pezzo, maiuscole o no", () => {
    const mario = { ...vuoto, first_name: "Mario", email: "Mario.Rossi_80@Gmail.com" };
    expect(trova(mario, filtriRicercaContatti("mario.rossi_80@gmail.com"))).toBe(true);
    expect(trova(mario, filtriRicercaContatti("gmail"))).toBe(true);
  });

  it("nome più città, azienda, codice fiscale", () => {
    const rossi = { ...vuoto, first_name: "Mario", last_name: "Rossi", city: "Monza", company_name: "Edil Rossi Srl", fiscal_code: "RSSMRA80A01F704X" };
    expect(trova(rossi, filtriRicercaContatti("Rossi Monza"))).toBe(true);
    expect(trova(rossi, filtriRicercaContatti("Rossi Milano"))).toBe(false);
    expect(trova(rossi, filtriRicercaContatti("edil srl"))).toBe(true);
    expect(trova(rossi, filtriRicercaContatti("rssmra80a01f704x"))).toBe(true);
  });
});

describe("Ricerca contatti: i numeri", () => {
  it("le cifre, senza spazi né prefisso", () => {
    expect(cifreTelefono("+39 347 984 5700")).toBe("3479845700");
    expect(cifreTelefono("00393479845700")).toBe("3479845700");
    expect(cifreTelefono("347-9845700")).toBe("3479845700");
    expect(cifreTelefono("3479845700")).toBe("3479845700");
  });

  it("un nome non è un numero", () => {
    expect(cifreTelefono("Rocco")).toBeNull();
    expect(cifreTelefono("12345")).toBeNull();
  });

  it("il telefono si trova comunque sia salvato: prefissi, spazi, trattini", () => {
    const filtri = filtriRicercaContatti("345 512 6755");
    for (const salvato of ["3455126755", "+393455126755", "00393455126755", "+39 345 512 6755", "345-5126755"]) {
      expect(trova({ ...vuoto, phone: salvato }, filtri)).toBe(true);
    }
    // Numeri veri salvati con lo spazio: prima non si trovavano.
    expect(trova({ ...vuoto, phone: "0546 620120" }, filtriRicercaContatti("0546620120"))).toBe(true);
    expect(trova({ ...vuoto, phone: "+39 393 829 2313" }, filtriRicercaContatti("3938292313"))).toBe(true);
  });

  it("le cifre devono essere in fila: un numero diverso non combacia", () => {
    expect(trova({ ...vuoto, phone: "+393455126799" }, filtriRicercaContatti("3455126755"))).toBe(false);
  });

  it("un numero lungo si cerca anche nella partita IVA: prima finiva solo sul telefono", () => {
    expect(trova({ ...vuoto, vat_number: "IT01234567890" }, filtriRicercaContatti("01234567890"))).toBe(true);
  });

  it("l'espressione mette «qualsiasi non cifra» fra una cifra e l'altra", () => {
    expect(espressioneCifre("345")).toBe("3[^0-9]*4[^0-9]*5");
  });
});

describe("Dove si usa", () => {
  it("la pagina Contatti cerca per parola, non più la frase intera", () => {
    expect(sorgentePaginaContatti).toContain("filtriRicercaContatti(search)");
    expect(sorgentePaginaContatti).not.toContain("first_name.ilike.${s}");
  });

  it("il selettore dell'appuntamento cerca nel database, non su un elenco troncato a mille", () => {
    expect(sorgenteAppuntamento).toContain("filtriRicercaContatti(cercaContattoRitardata)");
    expect(sorgenteAppuntamento).not.toContain(".limit(10000)");
  });
});
