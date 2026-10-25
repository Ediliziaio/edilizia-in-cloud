import type {
  NativeContext,
  NativeOperation,
  NativeTurn,
  NativeValue,
} from "../../../supabase/functions/_shared/quoteNative";
import { readNativeTurn } from "../../../supabase/functions/_shared/quoteNative";
import type {
  SrProgettoDetail,
  SrSerramentoRow,
  SrAccessorioRow,
  SrServizioRow,
  SrMaterialePrincipale,
} from "@/types/serramenti";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import { problemiConfigurazioneFv } from "@/lib/fotovoltaico/configurazioneValidation";
import {
  righeComponentiFv,
  type ListinoComponentiFv,
} from "@/lib/fotovoltaico/componentiConfigurazione";
import { servizioDaCatalogo } from "@/lib/fotovoltaico/servizioDaCatalogo";
import {
  costoTariffa,
  unitaTariffa,
  type CostiTariffa,
} from "@/lib/listino/costoTariffa";

export type NativeCatalogue = NativeContext["catalogue"];
export type NativePrice = {
  price: number;
  cost?: number | null;
  unit?: string | null;
  sourceId?: string | null;
  supplierId?: string | null;
  supplierLineId?: string | null;
  image?: string | null;
  drawing?: SrSerramentoRow["disegno_config"];
  mode?: SrAccessorioRow["modalita_prezzo"];
};
export type NativePriceResolver = (
  op: NativeOperation,
  fields: Record<string, NativeValue>,
  previous?: SrSerramentoRow | SrAccessorioRow | SrServizioRow,
) => Promise<NativePrice | null>;
const fields = (op: NativeOperation) =>
  Object.fromEntries(op.fields.map((f) => [f.key, f.value]));
const has = (r: object, key: string) => Object.hasOwn(r, key);
const positive = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
const text = (v: NativeValue, fallback: string | null = null) =>
  v == null
    ? fallback
    : typeof v === "string"
      ? v
      : (() => {
          throw new Error("Testo tecnico non valido");
        })();
const quantity = (v: unknown, integer = false) => {
  if (!positive(v) || Number(v) > 1e6 || (integer && !Number.isSafeInteger(v)))
    throw new Error("Conferma una quantità valida, senza valori predefiniti");
  return v as number;
};
const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
function assertCatalogue(
  id: NativeValue,
  kind: string,
  catalogue: NativeCatalogue,
) {
  if (
    id != null &&
    !catalogue.some(
      (c) =>
        c.id === id &&
        (c.kind === kind ||
          (["serramento", "accessorio"].includes(kind) &&
            c.kind === "famiglia")),
    )
  )
    throw new Error(
      "Articolo non disponibile per questa tipologia: scegli il riferimento corretto",
    );
}
const upsert = <T extends { id: string }>(rows: T[], row: T) =>
  rows.some((r) => r.id === row.id)
    ? rows.map((r) => (r.id === row.id ? row : r))
    : [...rows, row];
export function srNativeContext(
  detail: SrProgettoDetail,
  title: string,
  catalogue: NativeCatalogue,
): NativeContext {
  return {
    module: "serramenti",
    modelTitle: title,
    catalogue,
    current: [
      ...detail.serramenti.map((r) => ({
        id: r.id,
        kind: "serramento",
        fields: Object.entries({
          title: r.tipologia_label,
          quantity: r.quantita,
          width: r.larghezza_mm,
          height: r.altezza_mm,
          room: r.ambiente,
          material: r.materiale,
          series: r.serie,
          glass: r.vetro,
          opening: r.apertura,
          insideColor: r.colore_interno,
          outsideColor: r.colore_esterno,
          catalogueId: r.family_id,
          supplierLineId: r.supplier_product_line_id,
          installationExcluded: r.posa_esclusa,
        }).map(([key, value]) => ({ key, value: value ?? null })),
      })),
      ...detail.accessori.map((r) => ({
        id: r.id,
        kind: "accessorio",
        fields: Object.entries({
          title: r.descrizione,
          quantity: r.quantita,
          width: r.larghezza_mm,
          height: r.altezza_mm,
          depth: r.profondita_mm ?? null,
          catalogueId: r.family_id,
          parentId: r.serramento_id,
          supplierLineId: r.supplier_product_line_id,
          installationExcluded: r.posa_esclusa,
        }).map(([key, value]) => ({ key, value: value ?? null })),
      })),
      ...detail.servizi.map((r) => ({
        id: r.id,
        kind: "servizio",
        fields: [
          { key: "title", value: r.descrizione },
          { key: "quantity", value: r.quantita },
          { key: "catalogueId", value: r.tariffa_id },
          { key: "unit", value: r.unita },
        ],
      })),
    ].map((row) => {
      const original = [...detail.serramenti, ...detail.accessori].find(
        (r) => r.id === row.id,
      );
      return original
        ? {
            ...row,
            axes: Object.entries(original.valori_assi ?? {}).map(
              ([axis, value]) => ({
                axis,
                value,
                choice: original.scelte_assi?.[axis] ?? null,
              }),
            ),
          }
        : row;
    }),
  };
}
/** Isolated full BOM. Existing catalogue choices, drawings, photos and supplier
 * metadata survive unless their actual technical source changes. */
export async function applySrNativeTurn(
  base: SrProgettoDetail,
  raw: NativeTurn,
  catalogue: NativeCatalogue,
  resolve: NativePriceResolver,
  manual: Record<string, number> = {},
) {
  const turn = readNativeTurn(raw);
  if (turn.module !== "serramenti") throw new Error("Modulo non coerente");
  const next = structuredClone(base),
    idMap = new Map<string, string>();
  const allOld = [...base.serramenti, ...base.accessori, ...base.servizi];
  let position = Math.max(-1, ...allOld.map((r) => r.position ?? 0)) + 1;
  for (const op of turn.operations)
    idMap.set(
      op.id,
      allOld.some((r) => r.id === op.id) ? op.id : crypto.randomUUID(),
    );
  for (const op of turn.operations) {
    const f = fields(op),
      id = idMap.get(op.id)!;
    const old = allOld.find((r) => r.id === op.id);
    const oldKind =
      old &&
      (base.serramenti.includes(old as SrSerramentoRow)
        ? "serramento"
        : base.accessori.includes(old as SrAccessorioRow)
          ? "accessorio"
          : "servizio");
    if (oldKind && oldKind !== op.kind)
      throw new Error("La tipologia di una riga esistente non può cambiare");
    if (op.action === "remove") {
      if (!old) throw new Error("Riga da rimuovere non presente");
      next.serramenti = next.serramenti.filter((r) => r.id !== id);
      next.accessori = next.accessori.filter(
        (r) => r.id !== id && r.serramento_id !== id,
      );
      next.servizi = next.servizi.filter((r) => r.id !== id);
      continue;
    }
    if (has(f, "catalogueId"))
      assertCatalogue(f.catalogueId, op.kind, catalogue);
    if (
      has(f, "installationExcluded") &&
      typeof f.installationExcluded !== "boolean"
    )
      throw new Error("Conferma esplicitamente la scelta della posa");
    if (
      has(f, "unit") &&
      op.kind !== "servizio" &&
      f.unit !== "cad" &&
      f.unit !== "pz"
    )
      throw new Error("I serramenti e gli accessori si configurano per pezzo");
    const q = quantity(
      has(f, "quantity") ? f.quantity : old?.quantita,
      op.kind !== "servizio",
    );
    const catalogueChanged =
      has(f, "catalogueId") &&
      f.catalogueId !==
        (old && ("family_id" in old ? old.family_id : old.tariffa_id));
    const serviceUnitChanged =
      op.kind === "servizio" &&
      has(f, "unit") &&
      f.unit !== (old as SrServizioRow | undefined)?.unita;
    const priceChanging =
      !old ||
      catalogueChanged ||
      serviceUnitChanged ||
      op.axes.length > 0 ||
      op.fields.some((f) =>
        [
          "quantity",
          "width",
          "height",
          "depth",
          "installationExcluded",
          "supplierLineId",
          "material",
          "series",
          "glass",
          "opening",
          "insideColor",
          "outsideColor",
        ].includes(f.key),
      );
    const quoted = priceChanging
      ? await resolve(op, { ...f, quantity: q }, old)
      : null;
    const oldPrice =
      old &&
      ("prezzo_unitario" in old
        ? old.prezzo_unitario
        : old.prezzo_unitario_vendita);
    const price =
      manual[op.id] ?? quoted?.price ?? (!priceChanging ? oldPrice : null);
    if (!positive(price))
      throw new Error(
        "Prezzo non verificato: scegli un articolo compatibile o conferma un prezzo manuale nella proposta",
      );
    const stamp = new Date().toISOString();
    const common = {
      id,
      progetto_id: base.progetto.id,
      company_id: base.progetto.company_id,
      position: old?.position ?? position++,
      quantita: q,
      created_at: old?.created_at ?? stamp,
      updated_at: stamp,
    };
    if (op.kind === "servizio") {
      const previous = old as SrServizioRow | undefined;
      const cost = quoted
        ? (quoted.cost ?? null)
        : catalogueChanged || serviceUnitChanged
          ? null
          : (previous?.prezzo_unitario_costo ?? null);
      const unit = has(f, "unit")
        ? text(f.unit)
        : (quoted?.unit ?? previous?.unita ?? null);
      if (!unit?.trim())
        throw new Error(
          "Conferma l’unità del servizio, senza valori predefiniti",
        );
      if (quoted?.unit && unit !== quoted.unit)
        throw new Error(
          "Unità diversa dalla tariffa: scegli un riferimento compatibile",
        );
      const row: SrServizioRow = {
        variante_id: null,
        ...previous,
        ...common,
        descrizione: has(f, "title")
          ? text(f.title, "")!
          : (previous?.descrizione ?? ""),
        tariffa_id: has(f, "catalogueId")
          ? text(f.catalogueId)
          : (previous?.tariffa_id ?? null),
        unita: unit,
        prezzo_unitario_vendita: price!,
        prezzo_totale_vendita: round(q * price!),
        note: has(f, "notes") ? text(f.notes) : (previous?.note ?? null),
        prezzo_unitario_costo: cost,
        prezzo_totale_costo: cost == null ? null : round(q * cost),
      };
      next.servizi = upsert(next.servizi, row);
      continue;
    }
    const previous = old as SrSerramentoRow | SrAccessorioRow | undefined;
    const L = has(f, "width") ? f.width : (previous?.larghezza_mm ?? null),
      H = has(f, "height") ? f.height : (previous?.altezza_mm ?? null);
    if ([L, H].some((v) => v != null && (!positive(v) || Number(v) > 20000)))
      throw new Error("Misure non valide: usa millimetri confermati");
    const title = has(f, "title")
      ? text(f.title, "")!
      : ((previous &&
          ("tipologia_label" in previous
            ? previous.tipologia_label
            : previous.descrizione)) ??
        "");
    if (
      /finestr|portafinestr|zanzar|persian|portonc|avvolgibil/i.test(title) &&
      (!positive(L) || !positive(H))
    )
      throw new Error("Conferma larghezza e altezza del serramento");
    const axes = Object.fromEntries(op.axes.map((a) => [a.axis, a.value])),
      choices = Object.fromEntries(
        op.axes.filter((a) => a.choice != null).map((a) => [a.axis, a.choice!]),
      );
    const patch = {
      ...common,
      larghezza_mm: L as number | null,
      altezza_mm: H as number | null,
      family_id: has(f, "catalogueId")
        ? text(f.catalogueId)
        : (previous?.family_id ?? null),
      posa_esclusa: has(f, "installationExcluded")
        ? f.installationExcluded === true
        : (previous?.posa_esclusa ?? false),
      valori_assi: {
        ...(catalogueChanged ? {} : (previous?.valori_assi ?? {})),
        ...axes,
      },
      scelte_assi: {
        ...(catalogueChanged ? {} : (previous?.scelte_assi ?? {})),
        ...choices,
      },
      supplier_product_line_id:
        quoted?.supplierLineId !== undefined
          ? quoted.supplierLineId
          : has(f, "supplierLineId")
            ? text(f.supplierLineId)
            : catalogueChanged
              ? null
              : (previous?.supplier_product_line_id ?? null),
      supplier_catalog_id:
        quoted?.supplierId !== undefined
          ? quoted.supplierId
          : catalogueChanged
            ? null
            : (previous?.supplier_catalog_id ?? null),
      listino_voce_id:
        quoted?.sourceId ??
        (priceChanging ? null : (previous?.listino_voce_id ?? null)),
      prezzo_unitario: price!,
      prezzo_totale: round(q * price!),
      note: has(f, "notes") ? text(f.notes) : (previous?.note ?? null),
    };
    for (const axis of op.axes)
      if (axis.choice == null) delete patch.scelte_assi[axis.axis];
    if (op.kind === "serramento") {
      const row: SrSerramentoRow = {
        tipologia: "voce_manuale",
        ambiente: null,
        materiale: null,
        serie: null,
        vetro: null,
        vetro_specs: null,
        apertura: null,
        colore_interno: null,
        colore_esterno: null,
        macrocategoria_override_id: null,
        foto_storage_path: null,
        foto_render_path: null,
        ...(old as SrSerramentoRow | undefined),
        ...patch,
        tipologia_label: title,
        metri_quadri:
          positive(L) && positive(H)
            ? round((Number(L) * Number(H) * q) / 1e6)
            : null,
      };
      for (const [field, key] of [
        ["room", "ambiente"],
        ["series", "serie"],
        ["glass", "vetro"],
        ["opening", "apertura"],
        ["insideColor", "colore_interno"],
        ["outsideColor", "colore_esterno"],
      ] as const)
        if (has(f, field)) row[key] = text(f[field]);
      if (has(f, "material")) {
        if (
          f.material != null &&
          ![
            "pvc",
            "alluminio",
            "legno",
            "alluminio_legno",
            "acciaio",
            "misto",
          ].includes(String(f.material))
        )
          throw new Error("Materiale non supportato");
        row.materiale = f.material as SrMaterialePrincipale | null;
      }
      if (catalogueChanged) {
        row.foto_storage_path = quoted?.image ?? null;
        row.foto_render_path = null;
        row.disegno_config = quoted?.drawing ?? null;
        row.vetro_specs = null;
      }
      if (op.axes.length && quoted?.drawing !== undefined)
        row.disegno_config = quoted.drawing;
      next.serramenti = upsert(next.serramenti, row);
    } else {
      const parent = has(f, "parentId")
        ? text(f.parentId)
        : ((old as SrAccessorioRow | undefined)?.serramento_id ?? null);
      const row: SrAccessorioRow = {
        tipo: "altro",
        ...(old as SrAccessorioRow | undefined),
        ...patch,
        descrizione: title,
        serramento_id: parent ? (idMap.get(parent) ?? parent) : null,
        modalita_prezzo:
          quoted?.mode ??
          (old as SrAccessorioRow | undefined)?.modalita_prezzo ??
          null,
        profondita_mm: has(f, "depth")
          ? (f.depth as number | null)
          : ((old as SrAccessorioRow | undefined)?.profondita_mm ?? null),
      };
      if (
        row.profondita_mm != null &&
        (!positive(row.profondita_mm) || row.profondita_mm > 20000)
      )
        throw new Error("Profondità non valida");
      next.accessori = upsert(next.accessori, row);
    }
  }
  if (
    next.accessori.some(
      (r) =>
        r.serramento_id &&
        !next.serramenti.some((s) => s.id === r.serramento_id),
    )
  )
    throw new Error("Accessorio collegato a un serramento non presente");
  for (const parent of next.serramenti) {
    const previous = base.serramenti.find((r) => r.id === parent.id);
    if (
      !previous ||
      ["larghezza_mm", "altezza_mm", "quantita"].every(
        (k) =>
          previous[k as keyof SrSerramentoRow] ===
          parent[k as keyof SrSerramentoRow],
      )
    )
      continue;
    if (
      next.accessori.some(
        (r) =>
          r.serramento_id === parent.id &&
          base.accessori.some((a) => a.id === r.id) &&
          !turn.operations.some((op) => op.id === r.id),
      )
    )
      throw new Error(
        "Le misure del serramento sono cambiate: conferma anche le misure e il prezzo degli accessori collegati",
      );
    for (const child of next.accessori.filter(
      (r) => r.serramento_id === parent.id,
    )) {
      const oldChild = base.accessori.find((a) => a.id === child.id);
      if (!oldChild) continue;
      const childOp = turn.operations.find((op) => op.id === child.id);
      for (const [key, field] of [
        ["larghezza_mm", "width"],
        ["altezza_mm", "height"],
        ["quantita", "quantity"],
      ] as const)
        if (
          oldChild[key] === previous[key] &&
          parent[key] !== previous[key] &&
          !childOp?.fields.some((f) => f.key === field)
        )
          throw new Error(
            "Conferma le nuove misure e quantità degli accessori collegati, non soltanto la descrizione",
          );
    }
  }
  if (
    [
      ...next.serramenti.map((r) => r.tipologia_label),
      ...next.accessori.map((r) => r.descrizione),
      ...next.servizi.map((r) => r.descrizione),
    ].some((title) => !title?.trim())
  )
    throw new Error("Completa i titoli delle righe tecniche");
  return next;
}

export type FvNativeCatalogue = ListinoComponentiFv & {
  kits: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  labour: Array<Record<string, unknown>>;
  services: Array<Record<string, unknown>>;
};
export function fvNativeContext(
  data: WizardData,
  title: string,
  catalogue: NativeCatalogue,
): NativeContext {
  return {
    module: "fotovoltaico",
    modelTitle: title,
    catalogue,
    current: [
      {
        id: "configurazione",
        kind: "configurazione",
        fields: Object.entries({
          panelId: data.pannello_id,
          inverterId: data.inverter_id,
          batteryId: data.accumulo_id,
          kitId: data.kit_bundle_id,
          panelCount: data.numero_pannelli_scelti,
          withBattery: data.con_accumulo,
          withWallbox: data.con_wallbox,
          withOptimizers: data.con_ottimizzatori,
        }).map(([key, value]) => ({ key, value })),
      },
      ...data.prodotti_extra.map((r, i) => ({
        id: r.uid ?? `product-${i}`,
        kind: "prodotto",
        fields: [
          { key: "title", value: r.descrizione },
          { key: "quantity", value: r.quantita },
          { key: "catalogueId", value: r.listino_id },
        ],
      })),
      ...data.manodopera_righe.map((r, i) => ({
        id: r.uid ?? `labour-${i}`,
        kind: "manodopera",
        fields: [
          { key: "title", value: r.descrizione },
          { key: "quantity", value: r.ore },
          { key: "catalogueId", value: r.tariffa_id },
        ],
      })),
      ...data.servizi_righe.map((r, i) => ({
        id: r.uid ?? `service-${i}`,
        kind: "servizio",
        fields: [
          { key: "title", value: r.descrizione },
          { key: "quantity", value: r.quantita },
          { key: "catalogueId", value: r.catalogue_id ?? null },
        ],
      })),
    ],
  };
}
export function applyFvNativeTurn(
  base: WizardData,
  raw: NativeTurn,
  catalogue: FvNativeCatalogue,
  manual: Record<string, number> = {},
) {
  const turn = readNativeTurn(raw);
  if (turn.module !== "fotovoltaico") throw new Error("Modulo non coerente");
  const data = structuredClone(base);
  const targets = fvNativeContext(base, "", []).current;
  // Stable source identities, even if previous operations remove/reorder rows.
  const products = new Map(
    base.prodotti_extra.map((r, i) => [r.uid ?? `product-${i}`, r]),
  );
  const labour = new Map(
    base.manodopera_righe.map((r, i) => [
      r.uid ?? `labour-${i}`,
      { ...r, uid: r.uid ?? `labour-${i}` },
    ]),
  );
  const services = new Map(
    base.servizi_righe.map((r, i) => [
      r.uid ?? `service-${i}`,
      { ...r, uid: r.uid ?? `service-${i}` },
    ]),
  );
  for (const op of turn.operations) {
    const f = fields(op),
      old = targets.find((r) => r.id === op.id);
    if (old && old.kind !== op.kind)
      throw new Error("Tipologia della riga FV incoerente");
    if (op.action === "remove") {
      if (!old || op.kind === "configurazione")
        throw new Error("Riga FV non rimovibile");
      products.delete(op.id);
      labour.delete(op.id);
      services.delete(op.id);
      continue;
    }
    if (op.kind === "configurazione") {
      if (op.id !== "configurazione")
        throw new Error("Una sola configurazione tecnica per impianto");
      if (
        (data.kit_bundle_id || f.kitId) &&
        [
          "panelId",
          "inverterId",
          "batteryId",
          "withBattery",
          "panelCount",
        ].some((k) => has(f, k)) &&
        f.kitId !== null
      )
        throw new Error(
          "Kit chiavi in mano e componenti singoli sono alternative: disattiva il kit prima di modificarli",
        );
      for (const [key, target, source] of [
        ["panelId", "pannello_id", catalogue.pannelli],
        ["inverterId", "inverter_id", catalogue.inverter],
        ["batteryId", "accumulo_id", catalogue.accumuli],
        ["kitId", "kit_bundle_id", catalogue.kits],
      ] as const) {
        if (!has(f, key)) continue;
        if (f[key] != null && !source.some((r) => r.id === f[key]))
          throw new Error(`Riferimento ${key} non disponibile`);
        data[target] = text(f[key]);
      }
      if (has(f, "panelCount"))
        data.numero_pannelli_scelti = quantity(f.panelCount, true);
      for (const [key, target] of [
        ["withBattery", "con_accumulo"],
        ["withWallbox", "con_wallbox"],
        ["withOptimizers", "con_ottimizzatori"],
      ] as const)
        if (has(f, key)) {
          if (typeof f[key] !== "boolean")
            throw new Error("Conferma esplicitamente la scelta tecnica");
          data[target] = f[key] as boolean;
        }
      if (has(f, "kitId") && data.kit_bundle_id) {
        const kit = catalogue.kits.find((k) => k.id === data.kit_bundle_id)!;
        if (
          !positive(Number(kit.fv_kwp)) ||
          !positive(Number(kit.prezzo_offerta))
        )
          throw new Error("Kit senza dati tecnici o prezzo verificato");
        data.kit_nome = String(kit.nome);
        data.kit_prezzo = Number(kit.prezzo_offerta);
        data.potenza_kwp = Number(kit.fv_kwp);
        data.capacita_accumulo_kwh = Number(kit.fv_accumulo_kwh ?? 0);
        data.con_accumulo = data.capacita_accumulo_kwh > 0;
        // Existing installation/services are NOT erased just by selecting a kit.
        data.prezzo_vendita_manuale = null;
      }
      if (!data.kit_bundle_id) {
        data.kit_nome = null;
        data.kit_prezzo = null;
        const panel = catalogue.pannelli.find((p) => p.id === data.pannello_id),
          battery = catalogue.accumuli.find((p) => p.id === data.accumulo_id);
        if (!panel || !positive(Number(panel.potenza_w)))
          throw new Error(
            "Potenza del pannello non verificata: nessun valore da 540 W viene assunto",
          );
        data.potenza_kwp = round(
          (data.numero_pannelli_scelti * Number(panel.potenza_w)) / 1000,
        );
        if (data.con_accumulo) {
          if (!battery || !positive(Number(battery.capacita_kwh)))
            throw new Error("Seleziona l’accumulo e verifica la capacità");
          data.capacita_accumulo_kwh = Number(battery.capacita_kwh);
        } else {
          data.accumulo_id = null;
          data.capacita_accumulo_kwh = 0;
        }
      }
      continue;
    }
    const source =
      op.kind === "prodotto"
        ? catalogue.products
        : op.kind === "manodopera"
          ? catalogue.labour
          : catalogue.services;
    const previous =
      op.kind === "prodotto"
        ? products.get(op.id)
        : op.kind === "manodopera"
          ? labour.get(op.id)
          : services.get(op.id);
    const previousSelectedId =
      previous &&
      ("listino_id" in previous
        ? previous.listino_id
        : "tariffa_id" in previous
          ? previous.tariffa_id
          : (previous.catalogue_id ?? null));
    const selectedId = has(f, "catalogueId")
      ? text(f.catalogueId)
      : previousSelectedId;
    const sameSource = (selectedId ?? null) === (previousSelectedId ?? null);
    const selected = selectedId
      ? source.find((p) => p.id === selectedId)
      : null;
    if (selectedId && !selected)
      throw new Error("Voce del listino FV non disponibile");
    if (selected?.configurazione_richiesta)
      throw new Error(String(selected.configurazione_richiesta));
    if (op.axes.length)
      throw new Error(
        "Le varianti del prodotto extra vanno configurate nel listino, non ignorate nel preventivo FV",
      );
    const sourceUnit =
      op.kind === "manodopera"
        ? unitaTariffa(
            selected as { unita?: string; unita_fatturazione?: string } | null,
            "h",
          )
        : (selected?.unita_misura ?? selected?.unita);
    // Check BOTH the actual catalogue unit and the AI field: an explicit "h"
    // must not disguise a day rate, nor "pz" disguise a square-metre price.
    for (const rawUnit of [sourceUnit, has(f, "unit") ? f.unit : null]) {
      if (rawUnit == null) continue;
      const unit = String(rawUnit).trim().toLocaleLowerCase("it");
      if (op.kind === "manodopera" && !["h", "ora", "ore"].includes(unit))
        throw new Error(
          "La manodopera FV usa ore: scegli una tariffa oraria senza conversioni automatiche",
        );
      if (
        op.kind !== "manodopera" &&
        !["cad", "pz", "a_corpo", "a corpo"].includes(unit)
      )
        throw new Error(
          "Unità non supportata dalle righe extra FV: verifica nel configuratore",
        );
    }
    const previousPrice =
      previous &&
      ("tariffa_oraria_vendita" in previous
        ? previous.tariffa_oraria_vendita
        : previous.prezzo_vendita);
    const selectedService =
      selected && op.kind === "servizio"
        ? servizioDaCatalogo(selected, 1)
        : null;
    const price =
      manual[op.id] ??
      selectedService?.prezzo_vendita ??
      (selected
        ? Number(selected.prezzo_vendita ?? selected.prezzo)
        : sameSource
          ? previousPrice
          : undefined);
    if (!positive(price))
      throw new Error(
        "Conferma un prezzo manuale oppure scegli un riferimento di listino verificato",
      );
    const q = quantity(
      has(f, "quantity")
        ? f.quantity
        : previous && ("ore" in previous ? previous.ore : previous.quantita),
    );
    const title = text(
      f.title,
      (sameSource ? previous?.descrizione : null) ??
        String(
          selected?.nome ??
            selected?.descrizione ??
            previous?.descrizione ??
            "",
        ),
    )!;
    if (op.kind === "prodotto")
      products.set(op.id, {
        ...(previous as WizardData["prodotti_extra"][number]),
        uid:
          (previous as WizardData["prodotti_extra"][number])?.uid ??
          crypto.randomUUID(),
        listino_id: selectedId,
        descrizione: title,
        quantita: q,
        prezzo_vendita: price!,
        prezzo_acquisto:
          selected?.prezzo_acquisto == null
            ? sameSource
              ? ((previous as WizardData["prodotti_extra"][number])
                  ?.prezzo_acquisto ?? null)
              : null
            : Number(selected.prezzo_acquisto),
      });
    else if (op.kind === "manodopera")
      labour.set(op.id, {
        ...(previous as WizardData["manodopera_righe"][number]),
        uid: previous?.uid ?? crypto.randomUUID(),
        tariffa_id: selectedId,
        descrizione: title,
        ore: q,
        tariffa_oraria_vendita: price!,
        tariffa_oraria_netta: Number(
          costoTariffa(selected as CostiTariffa | null) ??
            selected?.costo_orario ??
            (sameSource
              ? (previous as WizardData["manodopera_righe"][number])
                  ?.tariffa_oraria_netta
              : null) ??
            0,
        ),
      });
    else
      services.set(op.id, {
        ...(previous as WizardData["servizi_righe"][number]),
        uid: previous?.uid ?? crypto.randomUUID(),
        catalogue_id: selectedId,
        tipo:
          selectedService?.tipo ??
          (sameSource
            ? (previous as WizardData["servizi_righe"][number])?.tipo
            : null) ??
          "altro",
        descrizione: title,
        quantita: q,
        prezzo_vendita: price!,
        prezzo_netto:
          selectedService?.prezzo_netto ??
          (sameSource
            ? (previous as WizardData["servizi_righe"][number])?.prezzo_netto
            : null) ??
          0,
        note_operative: text(
          f.notes,
          selectedService?.note_operative ??
            (sameSource
              ? (previous as WizardData["servizi_righe"][number])
                  ?.note_operative
              : null) ??
            null,
        ),
      });
  }
  data.prodotti_extra = [...products.values()];
  data.manodopera_righe = [...labour.values()];
  data.servizi_righe = [...services.values()];
  for (const [flag, pattern, label] of [
    ["withWallbox", /wall.?box|colonnin|ricaric/i, "wallbox"],
    ["withOptimizers", /ottimizz|optimizer/i, "ottimizzatori"],
  ] as const) {
    if (
      turn.operations.some((op) =>
        op.fields.some((f) => f.key === flag && f.value === true),
      ) &&
      !data.prodotti_extra.some((r) => pattern.test(r.descrizione))
    )
      throw new Error(
        `Aggiungi e prezza anche gli ${label}: il solo interruttore non inserisce componenti nel preventivo`,
      );
  }
  if (
    data.kit_bundle_id &&
    turn.operations.some(
      (op) =>
        op.kind === "configurazione" &&
        op.fields.some((f) => f.key === "kitId"),
    ) &&
    (labour.size || services.size)
  )
    throw new Error(
      "Il kit comprende posa e servizi: rimuovi esplicitamente le voci precedenti per evitare doppioni",
    );
  if (
    !data.kit_bundle_id &&
    data.numero_pannelli_max != null &&
    data.numero_pannelli_scelti > data.numero_pannelli_max
  )
    throw new Error(
      "Numero di pannelli oltre la capienza verificata del tetto",
    );
  const issues = problemiConfigurazioneFv(data, catalogue);
  if (issues.length) throw new Error(issues.join(". "));
  return data;
}
export const fvNativeRows = (
  data: WizardData,
  catalogue: ListinoComponentiFv,
) => righeComponentiFv(data, catalogue);
