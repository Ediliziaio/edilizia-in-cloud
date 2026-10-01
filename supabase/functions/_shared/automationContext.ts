const TABLES: Record<string, string> = {
  contact: "marketing_contacts", opportunity: "marketing_opportunities", appointment: "appointments",
  order: "orders", invoice: "invoices", quote: "quotes", ticket: "tickets", task: "tasks", employee: "employees",
};
const TYPES: Record<string, string> = {
  contatto: "contact", contacts: "contact", opportunita: "opportunity", opportunities: "opportunity",
  appuntamento: "appointment", ordine: "order", orders: "order", tickets: "ticket", tasks: "task",
  fattura: "invoice", invoices: "invoice", preventivo: "quote",
};
export function automationEntityType(value: string): string { return TYPES[value] ?? value; }

export function automationEventEntity(event: string, entityType: string, entityId: string, payload: Record<string, any>) {
  if ((event.startsWith("opportunity_") || event === "pipeline_stage_change") && payload.opportunity_id) return { type: "opportunity", id: String(payload.opportunity_id) };
  if (event.startsWith("appointment_") && payload.appointment_id) return { type: "appointment", id: String(payload.appointment_id) };
  return { type: automationEntityType(entityType || "contact"), id: entityId };
}

/** Complete filter data using the triggering object, not a different object sharing its contact. */
export async function automationEventPayload(db: any, event: string, entityType: string, entityId: string, companyId: string, payload: Record<string, any>) {
  const source = automationEventEntity(event, entityType, entityId, payload);
  let record: Record<string, any> = {};
  if (TABLES[source.type]) {
    const { data, error } = await db.from(TABLES[source.type]).select("*").eq("id", source.id).eq("company_id", companyId).maybeSingle();
    if (error) throw error;
    record = data ?? {};
  }
  // Event values take precedence over later edits. ID remains the enrollment entity.
  return { ...record, ...payload, id: entityId, _automation_record_type: source.type };
}

/** Resolve the actual trigger record first. Never treat an invoice/opportunity UUID as a contact UUID. */
export async function resolveAutomationRecord(db: any, target: string, entityId: string, companyId: string, queue?: any): Promise<any> {
  target = automationEntityType(target);
  const source = automationEntityType(queue?.entity_type ?? "contact");
  const table = TABLES[target];
  if (!table) throw new Error(`Tipo di record non supportato: ${target}`);
  async function byId(type: string, id: string) {
    if (!TABLES[type] || !id) return null;
    let query = db.from(TABLES[type]).select("*").eq("id", id).eq("company_id", companyId);
    if (["contact", "opportunity"].includes(type)) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  }
  if (source === target) return byId(target, entityId);
  const sourceRecord = await byId(source, entityId);
  if (!sourceRecord) return null;
  const eventLinkedId = queue?.context_json?.payload?.[`${target}_id`];
  if (eventLinkedId && target !== "contact") return byId(target, eventLinkedId);
  if (target === "contact") {
    if (sourceRecord.contact_id) return byId("contact", sourceRecord.contact_id);
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
