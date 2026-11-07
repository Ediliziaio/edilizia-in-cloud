import {
  emailPerOrdini,
  referentiDi,
  terminiPagamentoTesto,
  type Supplier,
  type ReferenteFornitore,
} from "@/lib/suppliers/anagraficaFornitore";
import { etichettaPagamentoFornitore } from "@/lib/impostazioni/pagamentiFornitori";
export type FornitoreDocumento = Pick<Supplier, "id" | "name"> &
  Partial<Supplier>;
export function recapitiFornitore(s: FornitoreDocumento) {
  const altri = referentiDi(s.altri_referenti);
  const principale: ReferenteFornitore | null =
    s.contact_name || s.contact_email || s.contact_phone
      ? {
          nome: s.contact_name || "Referente principale",
          email: s.contact_email || "",
          telefono: s.contact_phone || "",
          ruolo: s.contact_role === "ordini" ? "ordini" : "altro",
        }
      : null;
  const referenti = [...(principale ? [principale] : []), ...altri];
  const referente = altri.find((r) => r.ruolo === "ordini") ?? principale;
  const pagamento = condizioniPagamentoFornitore(s);
  return {
    fornitoreId: s.id,
    destinatario: {
      nome: s.name,
      email: emailPerOrdini({ ...s, email: s.email ?? null }),
      indirizzo: [s.address, s.postal_code, s.city, s.province, s.country]
        .filter(Boolean)
        .join(", "),
      partitaIva: s.vat_number,
    },
    referente: referente?.nome || "",
    referenteEmail: referente?.email || "",
    referenteTelefono: referente?.telefono || "",
    referentiFornitore: referenti,
    pagamento,
    codiceCliente: s.codice_cliente ?? null,
    ritiroIndirizzo: s.ritiro_indirizzo
      ? [s.ritiro_indirizzo, s.ritiro_citta].filter(Boolean).join(", ")
      : [s.address, s.postal_code, s.city, s.province]
          .filter(Boolean)
          .join(", "),
    ritiroNote: s.ritiro_note || "",
  };
}

export function condizioniPagamentoFornitore(
  s: Pick<
    Partial<Supplier>,
    "payment_method" | "termini_giorni" | "termini_fine_mese"
  >,
): string {
  const termini = terminiPagamentoTesto(s);
  return (
    [
      s.payment_method ? etichettaPagamentoFornitore(s.payment_method) : null,
      termini,
    ]
      .filter(Boolean)
      .join(" · ") || "Da definire con il fornitore"
  );
}
