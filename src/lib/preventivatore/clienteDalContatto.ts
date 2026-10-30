/**
 * Il cliente di un preventivo che nasce da un contatto del CRM (`?contact_id=…`, da «Nuovo preventivo» nella scheda
 * del contatto o nell'opportunità). I preventivi edili ricevevano solo il legame (`cliente_id`): il passo Cliente
 * diceva «Dati sincronizzati nel progetto» con nome, email e telefono vuoti, e il PDF usciva «Cliente da definire».
 * Serramenti e Fotovoltaico leggevano il contatto da sempre: qui lo stesso per gli otto preventivi a computo.
 */
import { supabase } from "@/integrations/supabase/client";

/** I campi del cliente nel preventivo (stessi nomi in tutti gli otto moduli edili). */
export interface ClienteDelContatto {
  cliente_nome: string | null;
  cliente_cognome: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  /** Privato o azienda, coi dati fiscali del contatto (30/10/2026). */
  cliente_tipo: "privato" | "azienda" | "pa";
  cliente_ragione_sociale: string | null;
  cliente_codice_fiscale: string | null;
  cliente_partita_iva: string | null;
}

const pulito = (v: string | null | undefined): string | null => ((v ?? "").trim() === "" ? null : (v as string).trim());

/** Nome, cognome, email e telefono del contatto; `null` se non si legge (un contatto non visibile o cancellato). */
export async function leggiClienteDelContatto(contattoId: string): Promise<ClienteDelContatto | null> {
  const { data, error } = await supabase
    .from("marketing_contacts")
    .select("first_name, last_name, email, phone, company_name, fiscal_code, vat_number")
    .eq("id", contattoId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    cliente_nome: pulito(data.first_name),
    cliente_cognome: pulito(data.last_name),
    cliente_email: pulito(data.email),
    cliente_telefono: pulito(data.phone),
    cliente_tipo: pulito(data.company_name) || pulito(data.vat_number) ? "azienda" : "privato",
    cliente_ragione_sociale: pulito(data.company_name),
    cliente_codice_fiscale: pulito(data.fiscal_code),
    cliente_partita_iva: pulito(data.vat_number),
  };
}

/**
 * I campi del cliente ancora vuoti si riempiono col contatto; quello che c'è già (scritto da chi ha cominciato prima
 * che la lettura finisse) non si tocca.
 */
export function riempiClienteVuoto<F extends Partial<Record<keyof ClienteDelContatto, string | null | undefined>>>(
  form: F,
  cliente: ClienteDelContatto,
): F {
  const riempito: Partial<ClienteDelContatto> = {};
  for (const campo of Object.keys(cliente) as Array<keyof ClienteDelContatto>) {
    if (campo === "cliente_tipo") continue;
    if (pulito(form[campo]) === null && cliente[campo] !== null) (riempito as Record<string, unknown>)[campo] = cliente[campo];
  }
  // «Azienda» se lo è il contatto e nel preventivo non c'è ancora né ragione sociale né partita IVA scritte a mano.
  if (cliente.cliente_tipo === "azienda" && form.cliente_tipo !== "azienda" && pulito(form.cliente_ragione_sociale) === null && pulito(form.cliente_partita_iva) === null) {
    riempito.cliente_tipo = "azienda";
  }
  return Object.keys(riempito).length === 0 ? form : { ...form, ...riempito };
}
