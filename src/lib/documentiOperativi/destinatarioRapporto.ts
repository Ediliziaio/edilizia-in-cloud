import { supabase } from "@/integrations/supabase/client";
import { emailVera } from "@/lib/preventivatore/selezionaCliente";
import type { DocumentoOperativo } from "./modello";

export interface OrdineDestinatarioRapporto {
  client_name?: string | null;
  client_company?: string | null;
  client_email?: string | null;
  client_address?: string | null;
  cliente?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
}
interface QueryDestinatario {
  eq: (campo: string, valore: string) => QueryDestinatario;
  maybeSingle: () => PromiseLike<{
    data: OrdineDestinatarioRapporto | null;
    error: { message: string } | null;
  }>;
}
interface ClientDestinatario {
  from: (tabella: "orders") => { select: (campi: string) => QueryDestinatario };
}

export function destinatarioDaOrdine(
  o: OrdineDestinatarioRapporto,
): DocumentoOperativo["destinatario"] {
  const p = o.cliente;
  return {
    nome: p
      ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim()
      : o.client_company?.trim() || o.client_name?.trim() || "",
    email: emailVera(p ? p.email : o.client_email),
    indirizzo: (p ? p.address : o.client_address) ?? null,
  };
}
/** Il cliente collegato è la fonte: le vecchie copie nell'ordine possono essere vuote. */
export async function leggiDestinatarioRapporto(
  companyId: string,
  orderId: string,
  db: ClientDestinatario = supabase as unknown as ClientDestinatario,
) {
  const { data, error } = await db
    .from("orders")
    .select(
      "client_name, client_company, client_email, client_address, cliente:profiles!orders_customer_id_fkey(first_name, last_name, email, address)",
    )
    .eq("id", orderId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data)
    throw new Error(
      "La commessa non è più disponibile: aggiorna l’elenco prima di preparare il documento.",
    );
  return destinatarioDaOrdine(data);
}
