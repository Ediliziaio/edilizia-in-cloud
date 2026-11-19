import { supabase } from "@/integrations/supabase/client";
import { daCliente, daContatto, fontiVisibili, tipoDaScelta, type ClienteScelto, type PermessiScelta, type RigaClienteAnagrafica } from "@/lib/preventivatore/selezionaCliente";
import type { BozzaComputo } from "./editorNativo";

export function datiComputoDaCliente(c: ClienteScelto): Partial<BozzaComputo> {
  const azienda = tipoDaScelta(c) === "azienda";
  return {
    clienteId: c.origine === "contatto" ? c.id : "", clienteAnagraficaId: c.origine === "cliente" ? c.id : "",
    committente: (azienda && c.ragioneSociale ? c.ragioneSociale : [c.nome, c.cognome].filter(Boolean).join(" ") || c.email || "Senza nome").slice(0, 160),
    clienteEmail: c.email ?? "", clienteTelefono: c.telefono ?? "", clienteTipo: azienda ? "azienda" : "privato",
    clienteCodiceFiscale: (c.codiceFiscale ?? "").slice(0, 20), clientePartitaIva: (c.partitaIva ?? "").slice(0, 20),
    cantiere_indirizzo: c.indirizzo ?? "", cantiere_citta: c.citta ?? "", cantiere_cap: c.cap ?? "", cantiere_provincia: c.provincia ?? "",
    indirizzo: [c.indirizzo, c.cap, c.citta, c.provincia].filter(Boolean).join(", "),
  };
}

/** Il nuovo ingresso conserva il contesto CRM. Le bozze già salvate hanno sempre la precedenza. */
export async function leggiContestoNuovoComputo(companyId: string, params: URLSearchParams,
  permessi: PermessiScelta & { canViewMarketingOpportunities?: boolean }): Promise<Partial<BozzaComputo>> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let contatto = params.get("contact_id");
  const cliente = params.get("customer_id"), opportunita = params.get("opportunity_id");
  if (![companyId, ...[contatto, cliente, opportunita].filter((v): v is string => !!v)].every(v => uuid.test(v))) throw new Error("Il collegamento al cliente o all’opportunità non è valido.");
  const fonti = fontiVisibili(permessi);
  const dati: Partial<BozzaComputo> = {};
  if (opportunita) {
    if (!permessi.isAdmin && !permessi.canViewMarketingOpportunities) throw new Error("Non hai accesso all’opportunità indicata.");
    const { data, error } = await supabase.from("marketing_opportunities").select("id, contact_id").eq("company_id", companyId).eq("id", opportunita).maybeSingle();
    if (error || !data || (contatto && data.contact_id && data.contact_id !== contatto)) throw new Error("L’opportunità non è disponibile o non corrisponde al contatto.");
    dati.opportunitaId = data.id;
    contatto ||= data.contact_id;
  }
  if (cliente) {
    if (!fonti.clienti) throw new Error("Non hai accesso al cliente indicato.");
    const { data, error } = await supabase.from("profiles").select("id, first_name, last_name, email, phone, business_name, is_business, address, city, province, postal_code, fiscal_code, vat_number").eq("company_id", companyId).eq("id", cliente).maybeSingle();
    if (error || !data) throw new Error("Il cliente non è disponibile in questa azienda.");
    if (fonti.soloMieiClienti) {
      // La stessa RPC del selettore applica in database sia il permesso sia «solo assegnati».
      const ricerca = data.fiscal_code || data.email || data.business_name || data.last_name || data.first_name;
      if (!ricerca) throw new Error("Seleziona il cliente dal pulsante «Cerca contatto o cliente».");
      const { data: elenco, error: erroreElenco } = await supabase.rpc("get_customers_paginated", { p_company_id: companyId, p_search: ricerca, p_limit: 100, p_offset: 0 });
      const righe = (elenco as { rows?: RigaClienteAnagrafica[] } | null)?.rows ?? [];
      if (erroreElenco || !righe.some(r => r.id === cliente)) throw new Error("Il cliente non è tra quelli assegnati a te.");
    }
    Object.assign(dati, datiComputoDaCliente(daCliente(data)));
  } else if (contatto) {
    if (!fonti.contatti) throw new Error("Non hai accesso al contatto indicato.");
    const { data, error } = await supabase.from("marketing_contacts").select("id, first_name, last_name, email, phone, address, city, province, postal_code, company_name, fiscal_code, vat_number").eq("company_id", companyId).eq("id", contatto).is("deleted_at", null).maybeSingle();
    if (error || !data) throw new Error("Il contatto non è disponibile in questa azienda.");
    Object.assign(dati, datiComputoDaCliente(daContatto(data)));
  }
  return dati;
}
