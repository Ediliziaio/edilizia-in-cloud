/** Technical proposals, never LLM prices, tax choices, saves or customer sends. */
export type NativeModule = "serramenti" | "fotovoltaico";
export type NativeValue = string | number | boolean | null;
export type NativeField = { key: string; value: NativeValue };
export type NativeOperation = {
  id: string;
  kind: string;
  action: "upsert" | "remove";
  fields: NativeField[];
  axes: Array<{ axis: string; value: string; choice: string | null }>;
};
export type NativeTurn = {
  module: NativeModule;
  operations: NativeOperation[];
};
export type NativeContext = {
  module: NativeModule;
  modelTitle: string;
  current: Array<{
    id: string;
    kind: string;
    fields: NativeField[];
    axes?: NativeOperation["axes"];
  }>;
  catalogue: Array<{ id: string; kind: string; label: string; specs: string }>;
};
export function nativeCatalogueCandidates(
  catalogue: NativeContext["catalogue"],
  used: Iterable<NativeValue>,
  query = "",
): NativeContext["catalogue"] {
  const keep = new Set(used),
    words: string[] = [
      ...(query
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .match(/[a-z0-9]{3,}/g) ?? []),
    ];
  const score = (row: NativeContext["catalogue"][number]) => {
    const text = `${row.label} ${row.specs}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return (
      (keep.has(row.id) ? 10000 : 0) +
      words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0)
    );
  };
  const unique = [...new Map(catalogue.map((row) => [row.id, row])).values()];
  const ranked = unique
    .map((row, index) => ({ row, index, score: score(row) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((v) => v.row);
  const result: NativeContext["catalogue"] = [];
  let chars = 0;
  for (const row of ranked) {
    const size = JSON.stringify(row).length;
    if (chars + size > 24000) {
      if (keep.has(row.id))
        throw new Error(
          "Troppi riferimenti tecnici: lavora su un gruppo di posizioni alla volta",
        );
      continue;
    }
    result.push(row);
    chars += size;
    if (result.length === 80) break;
  }
  return result;
}
export const NATIVE_FIELDS = {
  serramenti: [
    "title",
    "quantity",
    "width",
    "height",
    "depth",
    "room",
    "material",
    "series",
    "glass",
    "opening",
    "insideColor",
    "outsideColor",
    "installationExcluded",
    "parentId",
    "catalogueId",
    "supplierLineId",
    "notes",
    "unit",
  ],
  fotovoltaico: [
    "panelId",
    "inverterId",
    "batteryId",
    "kitId",
    "panelCount",
    "withBattery",
    "withWallbox",
    "withOptimizers",
    "catalogueId",
    "title",
    "quantity",
    "notes",
    "unit",
  ],
} as const;
export const NATIVE_KINDS = {
  serramenti: ["serramento", "accessorio", "servizio"],
  fotovoltaico: ["configurazione", "prodotto", "manodopera", "servizio"],
} as const;
const obj = (x: unknown): Record<string, unknown> => {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("Proposta tecnica non valida");
  return x as Record<string, unknown>;
};
const str = (x: unknown, max = 200): string => {
  if (typeof x !== "string" || x.length > max)
    throw new Error("Testo tecnico non valido");
  return x;
};
const list = (x: unknown, max: number): unknown[] => {
  if (!Array.isArray(x) || x.length > max)
    throw new Error("Troppi dati tecnici");
  return x;
};
const moduleOf = (x: unknown): NativeModule => {
  if (x !== "serramenti" && x !== "fotovoltaico")
    throw new Error("Modulo tecnico non valido");
  return x;
};
const idOf = (x: unknown) => {
  const id = str(x, 80);
  if (!/^[a-z\d_-]+$/i.test(id)) throw new Error("Identità tecnica non valida");
  return id;
};
function fieldsOf(x: unknown, module: NativeModule): NativeField[] {
  const fields = list(x, 24).map((v) => {
    const f = obj(v),
      key = str(f.key, 40),
      value = f.value;
    if (
      !(NATIVE_FIELDS[module] as readonly string[]).includes(key) ||
      (value !== null &&
        !["string", "boolean", "number"].includes(typeof value)) ||
      (typeof value === "string" && value.length > 1500) ||
      (typeof value === "number" &&
        (!Number.isFinite(value) || Math.abs(value) > 1e6))
    )
      throw new Error("Campo tecnico non consentito");
    return { key, value: value as NativeValue };
  });
  if (new Set(fields.map((f) => f.key)).size !== fields.length)
    throw new Error("Campi tecnici duplicati");
  return fields;
}
export function readNativeContext(raw: unknown): NativeContext {
  const r = obj(raw),
    module = moduleOf(r.module);
  const current = list(r.current, 100).map((v) => {
    const row = obj(v);
    return {
      id: idOf(row.id),
      kind: str(row.kind, 40),
      fields: fieldsOf(row.fields, module),
      ...(row.axes == null
        ? {}
        : {
            axes: readNativeTurn({
              module,
              operations: [
                {
                  id: "context",
                  kind: row.kind,
                  action: "upsert",
                  fields: [],
                  axes: row.axes,
                },
              ],
            }).operations[0].axes,
          }),
    };
  });
  const catalogue = list(r.catalogue, 80).map((v) => {
    const row = obj(v);
    return {
      id: idOf(row.id),
      kind: str(row.kind, 40),
      label: str(row.label),
      specs: str(row.specs, 1200),
    };
  });
  if (
    new Set(current.map((row) => row.id)).size !== current.length ||
    new Set(catalogue.map((row) => row.id)).size !== catalogue.length
  )
    throw new Error("Identità tecniche duplicate");
  const context = { module, modelTitle: str(r.modelTitle), current, catalogue };
  if (JSON.stringify(context).length > 60000)
    throw new Error("Contesto tecnico troppo ampio");
  return context;
}
export function readNativeTurn(raw: unknown): NativeTurn {
  const r = obj(raw),
    module = moduleOf(r.module);
  const operations = list(r.operations, 30).map((v) => {
    const row = obj(v),
      kind = str(row.kind, 40);
    if (
      !(NATIVE_KINDS[module] as readonly string[]).includes(kind) ||
      (row.action !== "upsert" && row.action !== "remove")
    )
      throw new Error("Operazione tecnica non consentita");
    const axes = list(row.axes, 20).map((v) => {
      const a = obj(v);
      return {
        axis: str(a.axis, 80),
        value: idOf(a.value),
        choice: a.choice == null ? null : str(a.choice, 200),
      };
    });
    if (
      (module === "fotovoltaico" && axes.length) ||
      new Set(axes.map((a) => a.axis)).size !== axes.length
    )
      throw new Error("Varianti tecniche non valide");
    const fields = fieldsOf(row.fields, module);
    const applicable =
      module === "serramenti"
        ? kind === "servizio"
          ? ["title", "quantity", "catalogueId", "notes", "unit"]
          : kind === "accessorio"
            ? [
                "title",
                "quantity",
                "width",
                "height",
                "depth",
                "installationExcluded",
                "parentId",
                "catalogueId",
                "supplierLineId",
                "notes",
                "unit",
              ]
            : NATIVE_FIELDS.serramenti.filter(
                (k) => !["depth", "parentId"].includes(k),
              )
        : kind === "configurazione"
          ? [
              "panelId",
              "inverterId",
              "batteryId",
              "kitId",
              "panelCount",
              "withBattery",
              "withWallbox",
              "withOptimizers",
            ]
          : [
              "catalogueId",
              "title",
              "quantity",
              "unit",
              ...(kind === "servizio" ? ["notes"] : []),
            ];
    if (
      fields.some((f) => !applicable.includes(f.key)) ||
      (kind === "servizio" && axes.length)
    )
      throw new Error("Campo tecnico non applicabile a questa riga");
    return {
      id: idOf(row.id),
      kind,
      action: row.action as "upsert" | "remove",
      fields,
      axes,
    };
  });
  if (new Set(operations.map((row) => row.id)).size !== operations.length)
    throw new Error("Operazioni tecniche duplicate");
  return { module, operations };
}
export function validateNativeTurn(
  turn: NativeTurn | null | undefined,
  context: NativeContext,
  readOnly: boolean,
) {
  if (!turn) return;
  if (turn.module !== context.module || (readOnly && turn.operations.length))
    throw new Error("Proposta tecnica incoerente con la richiesta");
  for (const row of turn.operations) {
    const old = context.current.find((r) => r.id === row.id);
    if ((old && old.kind !== row.kind) || (row.action === "remove" && !old))
      throw new Error("Riga tecnica inesistente o di tipo diverso");
    for (const f of row.fields.filter(
      (f) => /Id$/.test(f.key) && f.value != null,
    )) {
      if (f.key === "parentId") {
        if (
          !context.current.some(
            (r) => r.id === f.value && r.kind === "serramento",
          ) &&
          !turn.operations.some(
            (r) =>
              r.id === f.value &&
              r.kind === "serramento" &&
              r.action === "upsert",
          )
        )
          throw new Error("Serramento collegato non disponibile");
      } else {
        const kind =
          f.key === "catalogueId"
            ? context.module === "serramenti" && row.kind !== "servizio"
              ? "famiglia"
              : row.kind
            : (
                {
                  panelId: "pannello",
                  inverterId: "inverter",
                  batteryId: "accumulo",
                  kitId: "kit",
                  supplierLineId: "supplierLine",
                } as Record<string, string>
              )[f.key];
        if (
          !context.catalogue.some(
            (r) =>
              r.id === f.value &&
              (r.kind === kind ||
                (f.key === "catalogueId" && r.kind === row.kind)),
          )
        )
          throw new Error(
            "Riferimento tecnico non presente nei candidati compatibili del listino",
          );
      }
    }
  }
}
export function nativeTurnSchema(module: NativeModule) {
  const text = (maxLength: number) => ({ type: "string", maxLength });
  return {
    type: "object",
    additionalProperties: false,
    required: ["module", "operations"],
    properties: {
      module: { type: "string", enum: [module] },
      operations: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "kind", "action", "fields", "axes"],
          properties: {
            id: { ...text(80), pattern: "^[a-zA-Z0-9_-]+$" },
            kind: { type: "string", enum: NATIVE_KINDS[module] },
            action: { type: "string", enum: ["upsert", "remove"] },
            fields: {
              type: "array",
              maxItems: 24,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["key", "value"],
                properties: {
                  key: { type: "string", enum: NATIVE_FIELDS[module] },
                  value: {
                    anyOf: [
                      text(1500),
                      { type: "number", minimum: -1e6, maximum: 1e6 },
                      { type: "boolean" },
                      { type: "null" },
                    ],
                  },
                },
              },
            },
            axes: {
              type: "array",
              maxItems: module === "serramenti" ? 20 : 0,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["axis", "value", "choice"],
                properties: {
                  axis: text(80),
                  value: text(80),
                  choice: { anyOf: [text(200), { type: "null" }] },
                },
              },
            },
          },
        },
      },
    },
  };
}
/** Keep unanswered technical fields and proposals across follow-up answers. */
export function mergeNativeTurns(
  previous: NativeTurn | null,
  next: NativeTurn | null | undefined,
  appliedIds?: ReadonlySet<string>,
): NativeTurn | null {
  if (!next?.operations.length) return previous;
  if (!previous) return readNativeTurn(next);
  if (previous.module !== next.module)
    throw new Error("Modulo tecnico cambiato");
  const rows = new Map(previous.operations.map((row) => [row.id, row]));
  for (const row of next.operations) {
    const old = rows.get(row.id);
    if (old && old.kind !== row.kind)
      throw new Error("Tipologia tecnica cambiata");
    if (
      old &&
      row.action === "remove" &&
      appliedIds &&
      !appliedIds.has(row.id)
    ) {
      rows.delete(row.id);
      for (const [id, child] of rows)
        if (
          child.fields.some((f) => f.key === "parentId" && f.value === row.id)
        )
          rows.delete(id);
      continue;
    }
    rows.set(
      row.id,
      !old || row.action === "remove" || old.action === "remove"
        ? row
        : {
            ...row,
            fields: [
              ...new Map(
                [...old.fields, ...row.fields].map((f) => [f.key, f]),
              ).values(),
            ],
            axes: [
              ...new Map(
                [...old.axes, ...row.axes].map((a) => [a.axis, a]),
              ).values(),
            ],
          },
    );
  }
  return readNativeTurn({
    module: next.module,
    operations: [...rows.values()],
  });
}
export const NATIVE_PROMPT = `Il contesto nativeContext è il configuratore scelto PRIMA della chat. Non cambiare modulo, cliente, modello o IVA. Per questi moduli proposals e searches restano vuoti: proponi SOLO nativeTurn, con operazioni tecniche parziali (fields). Ometti i campi non cambiati; null è una cancellazione esplicita, non un riempitivo. Non proporre prezzi, costi, sconti o totali nei campi tecnici. Gli ID di catalogo/fornitore devono provenire dai candidati disponibili, mai inventati. Se manca il candidato, chiedi la specifica o proponi una riga manuale da prezzare, senza dichiararla completa. Mantieni ID, legami degli accessori e varianti delle righe esistenti. Una richiesta di rimozione è soltanto proposta: non dichiararla eseguita. width/height/depth sono mm, quantity è il numero di pezzi; per i servizi quantity segue la loro unità. Per FV usa UNA operazione configurazione con id configurazione: numero moduli, ID pannello/inverter/accumulo/kit e flag. Potenza e prezzi vengono calcolati dal software dal catalogo; non dimensionare un impianto con dati inventati. Distingui dati confermati dell'utente da ipotesi, fai domande mirate e presenta scelte. Una domanda, confronto o ipotesi non cambia il configuratore: nativeTurn.operations resta vuoto. Tutte le proposte richiedono revisione esplicita prima di applicarle al wizard.`;
