import { PLATFORM_ADMIN_COMPANY_ID } from "./platformAutomation.ts";

const TABLES: Record<string, string> = {
  contact: "marketing_contacts", opportunity: "marketing_opportunities", appointment: "appointments",
  order: "orders", invoice: "invoices", payment: "invoice_payments", quote: "quotes", ticket: "tickets", task: "tasks", employee: "employees",
  // Gli altri oggetti del dizionario «Campi di sistema» (cantieri, acquisti, sicurezza, assistenza…).
  supplier: "suppliers", ordine_acquisto: "purchase_orders", ddt_ricezione: "ddt_ricezione",
  ordini_variazione: "ordini_variazione", giornale_lavori: "giornale_lavori", pos_document: "pos_documents",
  duvri_document: "duvri_documents", impianto: "impianti_cliente", contratto_manutenzione: "contratti_manutenzione",
  rapportino: "rapportini_intervento", subappaltatore: "subappaltatori_sicurezza", contratto_subappalto: "contratti_subappalto",
  sal_subappaltatore: "sal_subappaltatori", costo_aziendale: "company_costs", salesperson: "salespeople",
  external_team: "external_teams", piano_manutenzione: "piani_manutenzione",
};

/** Oggetti che nascono dentro una commessa: dall'ordine si prende il più recente. */
const LEGATI_ALLA_COMMESSA = new Set([
  "ordini_variazione", "giornale_lavori", "pos_document", "duvri_document", "ordine_acquisto",
  "costo_aziendale", "sal_subappaltatore", "subappaltatore", "impianto",
]);
/** Oggetti che nascono da un ticket di assistenza. */
const LEGATI_AL_TICKET = new Set(["rapportino", "costo_aziendale", "ordine_acquisto"]);

/**
 * Nomi del dizionario che non coincidono con le colonne: il dipendente ha i dati
 * anagrafici nel profilo HR, l'azienda in due tabelle. Chiave del dizionario →
 * colonna del profilo HR / dell'anagrafica.
 */
const DIPENDENTE_DA_PROFILO_HR: Record<string, string> = {
  fiscal_code: "codice_fiscale", address: "indirizzo", date_of_birth: "data_nascita", contract_type: "tipo_contratto",
  hire_date: "data_assunzione", contract_end_date: "data_cessazione", avatar_url: "foto_url", specializzazione: "mansione",
};
const AZIENDA_DA_ANAGRAFICA: Record<string, string> = {
  address: "indirizzo_via", city: "indirizzo_comune", province: "indirizzo_provincia", postal_code: "indirizzo_cap",
  country: "indirizzo_nazione", regime_fiscale: "regime_fiscale", forma_giuridica: "forma_giuridica",
  capitale_sociale: "capitale_sociale", codice_rea: "codice_rea", rea_ufficio: "rea_ufficio",
  numero_iscr_registro_imprese: "numero_iscr_registro_imprese", bic_swift: "bic_swift",
  condizioni_pagamento_default: "condizioni_pagamento_default", note_fattura_default: "note_fattura_default",
};

/** L'azienda: la riga di companies, completata dall'anagrafica fiscale dove manca. */
export async function caricaAzienda(db: any, companyId: string): Promise<Record<string, any> | null> {
  const { data: azienda, error } = await db.from("companies").select("*").eq("id", companyId).maybeSingle();
  if (error) throw error;
  if (!azienda) return null;
  const { data: anagrafica } = await db.from("anagrafica_azienda").select("*").eq("company_id", companyId).maybeSingle();
  const record: Record<string, any> = { ...azienda };
  if (anagrafica) {
    for (const [chiave, colonna] of Object.entries(AZIENDA_DA_ANAGRAFICA)) {
      if (record[chiave] == null || record[chiave] === "") record[chiave] = anagrafica[colonna] ?? null;
    }
    // La via con il numero civico, come si scrive su un documento.
    if (anagrafica.indirizzo_via) record.address = [anagrafica.indirizzo_via, anagrafica.indirizzo_numero_civico].filter(Boolean).join(" ");
    record.business_name = anagrafica.ragione_sociale || record.business_name || record.name;
    for (const campo of ["vat_number:partita_iva", "fiscal_code:codice_fiscale", "pec:pec", "sdi_code:codice_sdi", "bank_iban:iban_principale",
      "bank_account_holder:intestatario_conto", "bank_name:nome_banca", "phone:telefono", "email:email", "website:sito_web", "logo_url:logo_url"]) {
      const [chiave, colonna] = campo.split(":");
      if (record[chiave] == null || record[chiave] === "") record[chiave] = anagrafica[colonna] ?? null;
    }
  }
  if (!record.address && record.legal_address) record.address = record.legal_address;
  if (!record.city && record.legal_city) record.city = record.legal_city;
  if (!record.province && record.legal_province) record.province = record.legal_province;
  if (!record.postal_code && record.legal_postal_code) record.postal_code = record.legal_postal_code;
  if (!record.country) record.country = "Italia";
  return record;
}

/** Il dipendente: la riga di employees più i dati anagrafici del profilo HR collegato. */
async function completaDipendente(db: any, record: Record<string, any> | null, companyId: string) {
  if (!record?.id) return record;
  const { data: profilo } = await db.from("hr_profili").select("*").eq("company_id", companyId).eq("employee_id", record.id).limit(1).maybeSingle();
  if (!profilo) return record;
  const completo = { ...record };
  for (const [chiave, colonna] of Object.entries(DIPENDENTE_DA_PROFILO_HR)) {
    if (completo[chiave] == null || completo[chiave] === "") completo[chiave] = profilo[colonna] ?? null;
  }
  if (!completo.hire_date) completo.hire_date = completo.data_assunzione ?? null;
  return completo;
}
const TYPES: Record<string, string> = {
  contatto: "contact", contacts: "contact", opportunita: "opportunity", opportunities: "opportunity",
  appuntamento: "appointment", ordine: "order", orders: "order", tickets: "ticket", tasks: "task",
  fattura: "invoice", invoices: "invoice", pagamento: "payment", preventivo: "quote",
};
export function automationEntityType(value: string): string { return TYPES[value] ?? value; }

export function automationEventEntity(event: string, entityType: string, entityId: string, payload: Record<string, any>) {
  if ((event.startsWith("opportunity_") || event === "pipeline_stage_change") && payload.opportunity_id) return { type: "opportunity", id: String(payload.opportunity_id) };
  if (event.startsWith("appointment_") && payload.appointment_id) return { type: "appointment", id: String(payload.appointment_id) };
  return { type: automationEntityType(entityType || "contact"), id: entityId };
}

/** Complete filter data using the triggering object, not a different object sharing its contact. */
export async function automationEventPayload(db: any, event: string, entityType: string, entityId: string, companyId: string, payload: Record<string, any>): Promise<Record<string, any>> {
  const source = automationEventEntity(event, entityType, entityId, payload);
  let record: Record<string, any> = {};
  if (TABLES[source.type]) {
    const { data, error } = await db.from(TABLES[source.type]).select("*").eq("id", source.id).eq("company_id", companyId).maybeSingle();
    if (error) throw error;
    record = data ?? {};
  }
  const platformContact: Record<string, unknown> = {};
  // A won platform deal is still a CRM opportunity, not a provisioned company.
  // Supply only the contact genuinely linked to that scoped opportunity.
  if (companyId === PLATFORM_ADMIN_COMPANY_ID && source.type === "opportunity" && record.contact_id) {
    const { data: contact, error } = await db.from("marketing_contacts")
      .select("id, email, first_name, last_name, company_name")
      .eq("id", record.contact_id).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    if (contact) for (const key of ["id", "email", "first_name", "last_name", "company_name"]) platformContact[`contatto.${key}`] = contact[key];
    platformContact["opportunita.id"] = source.id;
    platformContact["opportunita.value"] = payload.value ?? record.value;
  }
  // Event values take precedence over later edits. ID remains the enrollment entity.
  return { ...record, ...platformContact, ...payload, id: entityId, _automation_record_type: source.type };
}

/** Resolve the actual trigger record first. Never treat an invoice/opportunity UUID as a contact UUID. */
export async function resolveAutomationRecord(db: any, target: string, entityId: string, companyId: string, queue?: any): Promise<any> {
  target = automationEntityType(target);
  const source = automationEntityType(queue?.entity_type ?? "contact");
  // L'azienda è una sola per tutti i messaggi: non dipende dal record che ha fatto partire il flusso.
  if (target === "company") return caricaAzienda(db, companyId);
  const table = TABLES[target];
  if (!table) throw new Error(`Tipo di record non supportato: ${target}`);
  async function byId(type: string, id: string) {
    if (!TABLES[type] || !id) return null;
    let query = db.from(TABLES[type]).select("*").eq("id", id).eq("company_id", companyId);
    if (["contact", "opportunity"].includes(type)) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return type === "employee" ? completaDipendente(db, data, companyId) : data;
  }
  if (source === target) return byId(target, entityId);
  const sourceRecord = await byId(source, entityId);
  if (!sourceRecord) return null;
  if (source === "payment" && sourceRecord.invoice_id) {
    // Follow the stored FK, not an unverified invoice_id in the event payload.
    if (target === "invoice") return byId("invoice", sourceRecord.invoice_id);
    return resolveAutomationRecord(db, target, sourceRecord.invoice_id, companyId, { entity_type: "invoice" });
  }
  const eventLinkedId = queue?.context_json?.payload?.[`${target}_id`];
  if (eventLinkedId && target !== "contact") return byId(target, eventLinkedId);
  if (target === "contact") {
    if (sourceRecord.contact_id) return byId("contact", sourceRecord.contact_id);
    if (source === "invoice" && sourceRecord.client_id) return byId("contact", sourceRecord.client_id);
    if (sourceRecord.customer_id) {
      const { data, error } = await db.from("marketing_contacts").select("*")
        .eq("company_id", companyId).eq("customer_profile_id", sourceRecord.customer_id).is("deleted_at", null).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    }
    return null;
  }
  const linkedId = sourceRecord[`${target}_id`];
  if (linkedId) return byId(target, linkedId);
  // Oggetti che nascono da una commessa o da un ticket: il più recente di quell'origine.
  const origine = source === "order" && LEGATI_ALLA_COMMESSA.has(target) ? { colonna: "order_id", valore: entityId }
    : source === "ticket" && LEGATI_AL_TICKET.has(target) ? { colonna: "ticket_id", valore: entityId }
    : sourceRecord.order_id && LEGATI_ALLA_COMMESSA.has(target) ? { colonna: "order_id", valore: sourceRecord.order_id }
    : sourceRecord.ticket_id && LEGATI_AL_TICKET.has(target) ? { colonna: "ticket_id", valore: sourceRecord.ticket_id }
    : null;
  if (origine) {
    const { data, error } = await db.from(table).select("*").eq("company_id", companyId).eq(origine.colonna, origine.valore)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }
  // Preserve legacy contact flows which inspect the most recent linked record.
  if (source === "contact" && ["opportunity", "appointment", "task"].includes(target)) {
    let query = db.from(table).select("*").eq("company_id", companyId).eq("contact_id", entityId);
    if (target === "opportunity") query = query.is("deleted_at", null);
    const { data, error } = await query.order(target === "opportunity" ? "updated_at" : "created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }
  return null;
}

/** Stable field IDs for new filters, field names retained for already-published filters. */
export async function loadAutomationCustomFields(db: any, companyId: string, entityType: string, entityId: string): Promise<Record<string, unknown>> {
  const type = automationEntityType(entityType);
  const { data: definitions, error } = await db.from("marketing_custom_fields").select("id, name, field_type")
    .eq("company_id", companyId).eq("object_type", type).is("deleted_at", null);
  if (error) throw error;
  if (!definitions?.length) return {};
  const fieldIds = definitions.map((d: any) => d.id);
  let query = type === "contact" ? db.from("marketing_contact_field_values").select("field_id, value").eq("contact_id", entityId)
    : type === "opportunity" ? db.from("marketing_opportunity_field_values").select("field_id, value").eq("opportunity_id", entityId)
    : db.from("entity_custom_field_values").select("field_id, value").eq("company_id", companyId).eq("entity_type", type).eq("entity_id", entityId);
  const { data: values, error: valueError } = await query.in("field_id", fieldIds);
  if (valueError) throw valueError;
  const result: Record<string, unknown> = {};
  for (const definition of definitions) {
    let value = values?.find((v: any) => v.field_id === definition.id)?.value ?? null;
    if (["multiselect", "multi_select", "tags"].includes(definition.field_type) && typeof value === "string") {
      try { value = JSON.parse(value); } catch { /* Old scalar values remain readable. */ }
    }
    result[definition.id] = value;
    result[definition.name] = value;
  }
  return result;
}
