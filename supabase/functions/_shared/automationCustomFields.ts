import {
  automationEntityType,
  loadAutomationCustomFields,
  resolveAutomationRecord,
} from "./automationContext.ts";
import {
  AUTOMATION_CUSTOM_OBJECTS,
  AUTOMATION_ENTITY_TYPES,
  customObjectType,
} from "./automationFieldContract.ts";
import { normalizeMappedCustomValue } from "./formCustomFields.ts";
import { EMAIL_RECORD_FIELDS } from "./automationEmail.ts";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function targetField(
  db: any,
  companyId: string,
  entityId: string,
  queue: any,
  id: string,
) {
  if (!UUID.test(id)) throw new Error("Identificatore del campo non valido");
  const { data: def, error } = await db.from("marketing_custom_fields").select(
    "id,company_id,object_type,name,field_type,options,is_required,key_aliases",
  ).eq("company_id", companyId).eq("id", id).is("deleted_at", null)
    .maybeSingle();
  if (
    error || !def || def.id !== id || def.company_id !== companyId ||
    !AUTOMATION_CUSTOM_OBJECTS.has(def.object_type)
  ) {
    throw new Error(
      "Campo personalizzato non disponibile per questa azienda o oggetto",
    );
  }
  const source = automationEntityType(queue?.entity_type ?? "contact");
  const type = def.object_type === "quote" && source.startsWith("quote_")
    ? source
    : def.object_type;
  const record = await resolveAutomationRecord(
    db,
    type,
    entityId,
    companyId,
    queue,
  );
  if (!record?.id) {
    throw new Error(
      `Record ${def.object_type} non disponibile per il campo ${def.name}`,
    );
  }
  return { def, record, type };
}
export async function readAutomationCustomField(
  db: any,
  companyId: string,
  entityId: string,
  queue: any,
  id: string,
  expectedType?: string,
) {
  const { def, record, type } = await targetField(
    db,
    companyId,
    entityId,
    queue,
    id,
  );
  if (expectedType && customObjectType(type) !== expectedType) {
    throw new Error("La variabile appartiene a un altro oggetto");
  }
  const query = type === "contact"
    ? db.from("marketing_contact_field_values").select("value").eq(
      "contact_id",
      record.id,
    )
    : type === "opportunity"
    ? db.from("marketing_opportunity_field_values").select("value").eq(
      "opportunity_id",
      record.id,
    )
    : db.from("entity_custom_field_values").select("value").eq(
      "company_id",
      companyId,
    ).eq("entity_type", type).eq("entity_id", record.id);
  const { data, error } = await query.eq("field_id", def.id).maybeSingle();
  if (error) throw new Error(`Impossibile leggere il campo ${def.name}`);
  const value = data?.value ?? null;
  if (value == null || value === "") return value;
  if (
    ["multiselect", "multi_select", "tags"].includes(def.field_type) &&
    typeof value === "string"
  ) return JSON.parse(value);
  if (["checkbox", "boolean"].includes(def.field_type)) {
    return value === true || value === "true";
  }
  return value;
}
export async function writeAutomationCustomField(
  db: any,
  companyId: string,
  entityId: string,
  queue: any,
  requested: string,
  id: string,
  value: unknown,
) {
  const { def, record, type } = await targetField(
    db,
    companyId,
    entityId,
    queue,
    id,
  );
  if (AUTOMATION_ENTITY_TYPES[requested] !== customObjectType(type)) {
    throw new Error("Il campo non appartiene all’entità selezionata");
  }
  if (def.field_type === "file") {
    throw new Error("Gli allegati si gestiscono in Documenti");
  }
  let normalized: string | null;
  if (def.field_type === "multiselect") {
    const items = typeof value === "string" ? JSON.parse(value) : value;
    if (
      !Array.isArray(items) || items.length > 100 ||
      items.some((x) =>
        typeof x !== "string" || !(def.options ?? []).includes(x)
      )
    ) throw new Error("Scelta multipla non valida");
    normalized = JSON.stringify([...new Set(items)]);
  } else {
    normalized = normalizeMappedCustomValue(def, value);
    if (
      normalized && def.field_type === "url" &&
      !/^https?:\/\/\S+$/i.test(normalized)
    ) throw new Error("Indirizzo web non valido");
    if (
      normalized && def.field_type === "time" &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)
    ) throw new Error("Ora non valida");
  }
  if (normalized == null && def.is_required) {
    throw new Error("Il campo è obbligatorio");
  }
  const { data, error } = await db.rpc("automation_write_custom_field", {
    p_company: companyId,
    p_entity_type: type,
    p_entity_id: record.id,
    p_field_id: id,
    p_value: normalized,
    p_enrollment_id: queue?.enrollment_id ?? null,
    p_flow_path: queue?.context_json?.payload?.custom_field_flow_path ?? [],
  });
  if (error || data !== id) {
    throw new Error(
      error?.message || "Il server non ha confermato il campo salvato",
    );
  }
  return {
    success: true,
    output: {
      action: "update_field",
      field_id: id,
      entity_type: type,
      entity_id: record.id,
    },
  };
}
/** Resolve once per action, from current records; never discard an unresolved custom token. */
export async function resolveAutomationCustomConfig(
  db: any,
  config: Record<string, any>,
  companyId: string,
  entityId: string,
  queue: any,
) {
  const cache = new Map<string, Promise<unknown>>();
  const read = (id: string, expected?: string) => {
    const key = id + ":" + (expected ?? "");
    if (!cache.has(key)) {
      cache.set(
        key,
        readAutomationCustomField(db, companyId, entityId, queue, id, expected),
      );
    }
    return cache.get(key)!;
  };
  let legacy: Promise<Record<string, unknown>> | undefined;
  const native = new Set([
    ...EMAIL_RECORD_FIELDS.contact,
    "full_name",
    "name",
    "regione",
    "indirizzo",
    "cap",
    "nome",
    "cognome",
    "provincia",
    "citta",
    "telefono",
    "telefono_whatsapp",
    "azienda",
    "nome_saluto",
    "azienda_breve",
  ]);
  async function text(input: string) {
    let out = input;
    for (const match of input.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
      const token = match[1];
      const stable = token.match(
        /^(?:contact|contatto|opportunity|opportunita|appointment|appuntamento|order|ordine|quote|preventivo|task|employee|dipendente|warehouse)\.custom_([a-f0-9]{32})$/i,
      );
      const direct = token.match(/^custom_field\.([a-f0-9-]{36})$/i);
      let value: unknown;
      if (stable || direct) {
        const raw = stable?.[1];
        const id = raw
          ? `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${
            raw.slice(16, 20)
          }-${raw.slice(20)}`
          : direct![1];
        const prefix = token.split(".")[0];
        value = await read(
          id.toLowerCase(),
          stable ? automationEntityType(prefix) : undefined,
        );
      } else {
        const old = token.match(/^(?:contact|contatto)\.([a-z0-9_]+)$/i);
        if (!old || native.has(old[1])) continue;
        legacy ??= (async () => {
          const contact = await resolveAutomationRecord(
            db,
            "contact",
            entityId,
            companyId,
            queue,
          );
          if (!contact?.id) {
            throw new Error(
              "Contatto non disponibile per le variabili personalizzate",
            );
          }
          return loadAutomationCustomFields(
            db,
            companyId,
            "contact",
            contact.id,
          );
        })();
        const fields = await legacy;
        if (!Object.hasOwn(fields, old[1])) {
          throw new Error(`Variabile non disponibile: ${token}`);
        }
        value = fields[old[1]];
      }
      if (value == null || value === "") {
        throw new Error(`Manca il valore della variabile ${token}`);
      }
      out = out.replace(
        match[0],
        () => Array.isArray(value) ? value.join(", ") : String(value),
      );
    }
    return out;
  }
  async function visit(value: any, depth = 0): Promise<any> {
    if (depth > 12) throw new Error("Configurazione troppo annidata");
    if (typeof value === "string") return text(value);
    if (Array.isArray(value)) {
      return Promise.all(value.map((x) => visit(x, depth + 1)));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value).map(async (
            [k, v],
          ) => [k, await visit(v, depth + 1)]),
        ),
      );
    }
    return value;
  }
  return visit(config);
}
