// deno-lint-ignore-file no-explicit-any
//
// Risoluzione delle variabili dei CAMPI PERSONALIZZATI contatto negli invii email.
//
// La pagina /azienda/impostazioni/campi-personalizzati mostra, per ogni campo
// custom di tipo "contact", una variabile copiabile nel formato
//   {{ contact.<snake_case_del_nome> }}
// (vedi CustomFieldsConfig.tsx → uniqueKey). Finora i sender di campagna
// risolvevano solo un set hardcoded di campi di sistema, quindi quelle variabili
// restavano NON sostituite nelle email inviate. Questo helper le risolve.
//
// Due modalità:
//  • loadContactCustomFieldResolver            → mono-azienda (send-email-campaign)
//  • loadContactCustomFieldResolverCrossCompany → cross-azienda (send-crm-campaign,
//    SuperAdmin CRM: i contatti appartengono ad aziende diverse, ognuna con il
//    proprio set di campi). La stessa chiave snake_case può mappare field_id
//    diversi per azienda: ogni riga di valore referenzia però il field_id della
//    propria azienda, quindi una mappa globale field_id→key risolve correttamente
//    per ciascun contatto.
//
// Design: additivo, fail-safe (non lancia mai), e a costo ~zero quando i
// contenuti non referenziano alcun campo custom (fast-path su "{{").

/** Replica esatta di toSnakeCase del frontend (CustomFieldsConfig.tsx). */
export function toSnakeCase(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ContactCustomFieldResolver {
  /** Chiavi snake_case effettivamente referenziate nei contenuti. */
  referencedKeys: string[];
  /** contactId → { snakeKey → value } */
  valuesByContact: Map<string, Record<string, string>>;
  /** true se non c'è nulla da risolvere (fast-path: l'applier diventa no-op). */
  isEmpty: boolean;
}

const EMPTY_RESOLVER: ContactCustomFieldResolver = {
  referencedKeys: [],
  valuesByContact: new Map(),
  isEmpty: true,
};

type FieldDef = { id: string; name: string; deleted_at: string | null };

/**
 * Core condiviso: dato l'elenco di definizioni custom field 'contact' già
 * caricate, individua quelle effettivamente referenziate nei contenuti e
 * pre-carica i valori per i contatti destinatari. Non lancia mai.
 */
async function buildResolverFromDefs(
  adminClient: any,
  defs: FieldDef[],
  contactIds: string[],
  haystack: string,
): Promise<ContactCustomFieldResolver> {
  const fieldKeyById = new Map<string, string>();
  const referencedKeys: string[] = [];
  const referencedFieldIds: string[] = [];
  for (const d of defs) {
    if (d.deleted_at || !d.name) continue;
    const key = toSnakeCase(d.name);
    if (!key) continue;
    const re = new RegExp(`\\{\\{\\s*contact\\.${escapeRegExp(key)}\\s*\\}\\}`);
    if (re.test(haystack)) {
      fieldKeyById.set(d.id, key);
      referencedFieldIds.push(d.id);
      if (!referencedKeys.includes(key)) referencedKeys.push(key);
    }
  }
  if (referencedFieldIds.length === 0) return EMPTY_RESOLVER;

  const valuesByContact = new Map<string, Record<string, string>>();
  const CHUNK = 500;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const chunk = contactIds.slice(i, i + CHUNK);
    const { data: vals, error: valsErr } = await adminClient
      .from("marketing_contact_field_values")
      .select("contact_id, field_id, value")
      .in("contact_id", chunk)
      .in("field_id", referencedFieldIds);
    if (valsErr || !vals) continue;
    for (const v of vals as Array<{ contact_id: string; field_id: string; value: string | null }>) {
      const key = fieldKeyById.get(v.field_id);
      if (!key) continue;
      const rec = valuesByContact.get(v.contact_id) ?? {};
      rec[key] = v.value ?? "";
      valuesByContact.set(v.contact_id, rec);
    }
  }

  return { referencedKeys, valuesByContact, isEmpty: false };
}

/**
 * Carica i campi personalizzati "contact" dell'azienda e, SOLO per quelli
 * effettivamente referenziati nei contenuti passati ({{ contact.<key> }}),
 * pre-carica i valori per i contatti destinatari.
 *
 * Non lancia mai: in caso di errore (o schema incompleto) ritorna un resolver
 * vuoto, così l'invio email non viene mai bloccato da problemi sui custom field.
 */
export async function loadContactCustomFieldResolver(
  adminClient: any,
  companyId: string,
  contactIds: string[],
  contents: Array<string | null | undefined>,
): Promise<ContactCustomFieldResolver> {
  try {
    if (!companyId || contactIds.length === 0) return EMPTY_RESOLVER;

    const haystack = contents.filter(Boolean).join("\n");
    if (!haystack.includes("{{")) return EMPTY_RESOLVER; // nessuna variabile → fast-path

    const { data: defs, error: defsErr } = await adminClient
      .from("marketing_custom_fields")
      .select("id, name, deleted_at")
      .eq("company_id", companyId)
      .eq("object_type", "contact");
    if (defsErr || !defs) return EMPTY_RESOLVER;

    return await buildResolverFromDefs(adminClient, defs as FieldDef[], contactIds, haystack);
  } catch {
    return EMPTY_RESOLVER;
  }
}

/**
 * Variante CROSS-AZIENDA per i sender SuperAdmin (es. send-crm-campaign), dove i
 * contatti appartengono ad aziende diverse. Carica le definizioni 'contact' di
 * tutte le aziende coinvolte in un'unica query; la mappa field_id→key è globale
 * ma risolve correttamente per contatto, perché ogni riga di valore referenzia
 * il field_id della propria azienda.
 *
 * Non lancia mai: ritorna un resolver vuoto in caso di errore.
 */
export async function loadContactCustomFieldResolverCrossCompany(
  adminClient: any,
  contacts: Array<{ id: string; company_id: string | null }>,
  contents: Array<string | null | undefined>,
): Promise<ContactCustomFieldResolver> {
  try {
    const contactIds = contacts.map((c) => c.id).filter(Boolean);
    const companyIds = Array.from(
      new Set(contacts.map((c) => c.company_id).filter((id): id is string => !!id)),
    );
    if (contactIds.length === 0 || companyIds.length === 0) return EMPTY_RESOLVER;

    const haystack = contents.filter(Boolean).join("\n");
    if (!haystack.includes("{{")) return EMPTY_RESOLVER; // nessuna variabile → fast-path

    const { data: defs, error: defsErr } = await adminClient
      .from("marketing_custom_fields")
      .select("id, name, deleted_at, company_id")
      .in("company_id", companyIds)
      .eq("object_type", "contact");
    if (defsErr || !defs) return EMPTY_RESOLVER;

    return await buildResolverFromDefs(adminClient, defs as FieldDef[], contactIds, haystack);
  } catch {
    return EMPTY_RESOLVER;
  }
}

/**
 * Sostituisce nel testo le variabili {{ contact.<key> }} dei custom field per un
 * dato contatto. Gestisce spazi opzionali. I field non valorizzati per quel
 * contatto diventano stringa vuota (coerente con i campi di sistema).
 */
export function applyContactCustomFields(
  text: string,
  contactId: string,
  resolver: ContactCustomFieldResolver,
): string {
  if (resolver.isEmpty || !text) return text;
  const values = resolver.valuesByContact.get(contactId) ?? {};
  let out = text;
  for (const key of resolver.referencedKeys) {
    const val = values[key] ?? "";
    out = out.replace(
      new RegExp(`\\{\\{\\s*contact\\.${escapeRegExp(key)}\\s*\\}\\}`, "g"),
      val,
    );
  }
  return out;
}
