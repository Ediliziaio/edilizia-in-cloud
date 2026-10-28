import type { SurveyDetail } from "@/lib/api/surveys";
import { energyKind, energyIssues } from "./energySurvey";
import { energyGeometryIssues, validateEnergyValues } from "./energyDrawing";
import type { ClmComputoVoce } from "@/types/climatizzazione";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import type { ListinoComponentiFv } from "@/lib/fotovoltaico/componentiConfigurazione";
export type EnergyQuoteModule =
  | "fotovoltaico"
  | "climatizzazione"
  | "termoidraulico";
export interface EnergyQuoteRow {
  key: string;
  title: string;
  quantity: number;
  unit: "cad" | "ml";
  area: string;
  kind: string;
  checks: string[];
  model: string;
}
export function energyQuoteModule(d: SurveyDetail): EnergyQuoteModule {
  if (d.template.category === "fotovoltaico") return "fotovoltaico";
  if (d.template.category !== "climatizzazione")
    throw new Error("Questo rilievo non è un impianto energetico.");
  return ["pdc", "ibrido", "acs"].includes(
    String(d.survey.header_data.en_scenario),
  )
    ? "termoidraulico"
    : "climatizzazione";
}
export const energySourceKey = (surveyId: string, elementId: string) =>
  `rilievo:${surveyId}:${elementId}`;
/** Only an identifier, never a URL supplied by a document or a signed media token. Access is rechecked by useSurveyDetail. */
export function energySurveyOrigin(
  value: string | null | undefined,
): string | undefined {
  return value?.match(
    /(?:^|\[)rilievo:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?=:|\])/i,
  )?.[1];
}
export function energyQuoteRows(
  d: SurveyDetail,
  companyId: string,
): EnergyQuoteRow[] {
  if (!companyId || d.survey.company_id !== companyId)
    throw new Error("Il rilievo non appartiene all’azienda attiva.");
  energyQuoteModule(d);
  return d.elements.flatMap((e) => {
    const type = d.template.schema.element_types.find(
        (t) => t.key === e.element_type,
      ),
      kind = energyKind(type),
      v = e.values;
    if (
      !type ||
      !kind ||
      !["nuovo", "sostituire"].includes(String(v.en_action))
    )
      return [];
    validateEnergyValues(type, v);
    const q = kind === "route" ? v.en_length : v.en_count;
    const checks = [...energyIssues(type, v), ...energyGeometryIssues(type, v)];
    if (typeof q !== "number" || !Number.isFinite(q) || q <= 0)
      checks.push("Quantità mancante o non valida.");
    return [
      {
        key: energySourceKey(d.survey.id, e.id),
        title:
          kind === "roof"
            ? `Moduli FV · ${e.element_label || type.label}`
            : e.element_label || type.label,
        quantity: typeof q === "number" && Number.isFinite(q) ? q : 0,
        unit: kind === "route" ? "ml" : "cad",
        area: d.areas.find((a) => a.id === e.area_id)?.name || "Impianto",
        kind,
        checks,
        model: String(v.en_model || ""),
      },
    ];
  });
}
export function energyQuoteHref(d: SurveyDetail) {
  const module = energyQuoteModule(d),
    scenario = String(d.survey.header_data.en_scenario);
  const params = new URLSearchParams({ rilievo: d.survey.id });
  if (d.survey.contact_id) params.set("contact_id", d.survey.contact_id);
  if (d.survey.opportunity_id)
    params.set("opportunity_id", d.survey.opportunity_id);
  if (module === "fotovoltaico") {
    const model = (
      {
        nuovo: "nuovo",
        accumulo: "accumulo",
        ampliamento: "ampliamento",
        sostituzione: "componenti",
      } as Record<string, string>
    )[scenario];
    if (model) params.set("modello", model);
  }
  if (module === "climatizzazione") {
    const configs = [
      ...new Set(
        d.elements
          .filter((e) => ["split", "en_unita_esterna"].includes(e.element_type))
          .map((e) => e.values.en_configuration),
      ),
    ];
    if (
      configs.length === 1 &&
      ["monosplit", "multisplit", "canalizzato"].includes(String(configs[0]))
    )
      params.set("modello", String(configs[0]));
  }
  if (module === "termoidraulico")
    params.set(
      "modello",
      scenario === "ibrido"
        ? "ibrido"
        : scenario === "acs"
          ? "acqua-calda"
          : "pompa-calore",
    );
  return `/azienda/${module === "fotovoltaico" ? "marketing/fotovoltaico" : module}/nuovo?${params}`;
}
export function energyComputoRows(
  rows: EnergyQuoteRow[],
  prices: Record<string, string>,
  companyId: string,
  projectId: string,
  existing: Array<{ fonte?: string | null }>,
): ClmComputoVoce[] {
  if (!companyId || !projectId)
    throw new Error("Apri prima un preventivo salvato nell’azienda attiva.");
  return rows.map((r, i): ClmComputoVoce => {
    if (r.checks.length || !r.quantity)
      throw new Error(`Completa le verifiche di ${r.title}.`);
    if (existing.some((e) => e.fonte === r.key))
      throw new Error(
        "Questo elemento è già presente nel computo. Modificalo senza duplicarlo.",
      );
    const raw = prices[r.key]?.trim().replace(",", "."),
      price = Number(raw);
    if (!raw || !Number.isFinite(price) || price <= 0)
      throw new Error(
        "Inserisci un prezzo unitario maggiore di zero, IVA esclusa, per ogni voce selezionata.",
      );
    return {
      id: crypto.randomUUID(),
      company_id: companyId,
      progetto_id: projectId,
      capitolo_nome: r.area,
      descrizione: [r.title, r.model].filter(Boolean).join(" · "),
      descrizione_estesa: `Origine: ${r.key}. Quantità dal sopralluogo; prezzo confermato dall’operatore.`,
      note_interne:
        "Costi di acquisto e manodopera da completare: nessun costo effettivo dedotto dal sopralluogo.",
      unita_misura: r.unit,
      quantita: r.quantity,
      prezzo_unitario: price,
      costo_materiali: 0,
      costo_manodopera: 0,
      sconto_pct: 0,
      importo: Math.round(r.quantity * price * 100) / 100,
      margine_eur: 0,
      margine_pct: 0,
      listino_voce_id: null,
      ordine: existing.length + i,
      fonte: r.key,
    };
  });
}
export interface FvSurveySelection {
  panelId: string;
  inverterId: string;
  batteryId: string;
  acknowledge: boolean;
}
/** FV principal components stay principal components. Never turn them into duplicate priced extras. */
export function energyFvPatch(
  d: SurveyDetail,
  companyId: string,
  listino: ListinoComponentiFv,
  selection: FvSurveySelection,
): Partial<WizardData> {
  if (energyQuoteModule(d) !== "fotovoltaico")
    throw new Error("Serve un sopralluogo fotovoltaico.");
  if (d.survey.header_data.en_scenario !== "nuovo")
    throw new Error(
      "L’importazione automatica FV è disponibile per un impianto nuovo completo. Per aggiunta accumulo, ampliamento o ricambi usa il modello dedicato e configura le sole forniture: i componenti esistenti non vengono conteggiati automaticamente.",
    );
  const rows = energyQuoteRows(d, companyId),
    roofs = rows.filter((r) => r.kind === "roof"),
    invs = rows.filter((r) => r.kind === "inverter"),
    batteries = rows.filter((r) => r.kind === "battery");
  if (!selection.acknowledge)
    throw new Error(
      "Conferma l’abbinamento al catalogo e le verifiche del tecnico.",
    );
  if (
    !roofs.length ||
    invs.length !== 1 ||
    invs[0].quantity !== 1 ||
    batteries.length > 1 ||
    batteries.some((b) => b.quantity !== 1)
  )
    throw new Error(
      "Il wizard supporta un modello di modulo, un inverter e un accumulo: verifica manualmente le configurazioni diverse.",
    );
  if ([...roofs, ...invs, ...batteries].some((r) => r.checks.length))
    throw new Error(
      "Completa le verifiche tecniche dei componenti principali.",
    );
  const panel = listino.pannelli.find((p) => p.id === selection.panelId),
    inverter = listino.inverter.find((p) => p.id === selection.inverterId),
    battery = listino.accumuli.find((p) => p.id === selection.batteryId);
  if (!panel || !inverter || (batteries.length && !battery))
    throw new Error("Scegli i componenti dal catalogo aziendale corrente.");
  for (const p of [panel, inverter, ...(batteries.length ? [battery!] : [])])
    if (
      typeof p.prezzo_vendita !== "number" ||
      !Number.isFinite(p.prezzo_vendita) ||
      p.prezzo_vendita <= 0
    )
      throw new Error(
        "I prodotti selezionati devono avere un prezzo di vendita valido nel catalogo.",
      );
  const roofValues = roofs.map(
    (r) =>
      d.elements.find((e) => energySourceKey(d.survey.id, e.id) === r.key)!
        .values,
  );
  if (roofValues.some((v) => v.en_module_watt !== panel.potenza_w))
    throw new Error(
      "La potenza del modulo di catalogo è diversa da quella del rilievo: aggiorna il rilievo prima dell’importazione.",
    );
  if (
    !Number.isFinite(Number(inverter.potenza_kw)) ||
    Number(inverter.potenza_kw) <= 0
  )
    throw new Error("Potenza inverter di catalogo da completare.");
  const invValues = d.elements.find(
    (e) => energySourceKey(d.survey.id, e.id) === invs[0].key,
  )!.values;
  if (invValues.en_power !== inverter.potenza_kw)
    throw new Error(
      "Potenza inverter diversa dal rilievo: verifica il modello.",
    );
  if (batteries.length) {
    const bv = d.elements.find(
      (e) => energySourceKey(d.survey.id, e.id) === batteries[0].key,
    )!.values;
    if (
      !Number.isFinite(Number(battery!.capacita_kwh)) ||
      Number(battery!.capacita_kwh) <= 0 ||
      bv.en_capacity !== battery!.capacita_kwh
    )
      throw new Error(
        "Capacità accumulo diversa dal rilievo o assente in catalogo.",
      );
  }
  const count = roofs.reduce((s, r) => s + r.quantity, 0);
  return {
    numero_pannelli_scelti: count,
    potenza_kwp: (count * Number(panel.potenza_w)) / 1000,
    pannello_id: selection.panelId,
    inverter_id: selection.inverterId,
    accumulo_id: batteries.length ? selection.batteryId : null,
    con_accumulo: !!batteries.length,
    capacita_accumulo_kwh: batteries.length
      ? Number(battery!.capacita_kwh) || 0
      : 0,
    kit_bundle_id: null,
    kit_nome: null,
    kit_prezzo: null,
    fonte_dati_tetto: "manuale",
    qualita_dati_tetto: `Manuale · sopralluogo ${d.survey.code} [rilievo:${d.survey.id}] · ${roofs.length} falde distinte, vedere dossier. Nessuna resa stimata.`,
    // Gross roof dimensions are not usable surface (walkways, exclusions and obstructions differ).
    superficie_tetto_disponibile_mq: null,
    layout_tetto: null,
    layout_overlay: null,
    tetto_mock: false,
  };
}

export function applyEnergyFvImport(
  current: WizardData,
  d: SurveyDetail,
  companyId: string,
  listino: ListinoComponentiFv,
  selection: FvSurveySelection,
  rows: EnergyQuoteRow[],
  prices: Record<string, string>,
): WizardData {
  if (current.qualita_dati_tetto?.includes(d.survey.id))
    throw new Error(
      "Questo rilievo è già stato importato. Modifica i dati nel preventivo senza duplicarli.",
    );
  if (
    current.prezzo_vendita_manuale != null &&
    current.prezzo_vendita_manuale > 0
  )
    throw new Error(
      "Il prezzo manuale a corpo sostituisce i prezzi delle righe: rimuovilo o completa la configurazione manualmente.",
    );
  if (
    current.pannello_id ||
    current.inverter_id ||
    current.accumulo_id ||
    current.kit_bundle_id
  )
    throw new Error(
      "Il preventivo ha già componenti principali: apri una nuova bozza o aggiorna i componenti manualmente, senza sovrascriverli.",
    );
  const patch = energyFvPatch(d, companyId, listino, selection),
    allowed = energyQuoteRows(d, companyId);
  if (
    rows.some(
      (r) =>
        ["roof", "inverter", "battery"].includes(r.kind) ||
        !allowed.some((a) => a.key === r.key),
    )
  )
    throw new Error("Voci accessorie non valide.");
  const extra = energyComputoRows(
    rows,
    prices,
    companyId,
    "fv-review",
    current.prodotti_extra.map((r) => ({
      fonte: r.descrizione.match(/\[([^\]]+)\]$/)?.[1],
    })),
  );
  return {
    ...current,
    ...patch,
    con_wallbox: current.con_wallbox || rows.some((r) => r.kind === "wallbox"),
    prodotti_extra: [
      ...current.prodotti_extra,
      ...extra.map((r): WizardData["prodotti_extra"][number] => ({
        uid: crypto.randomUUID(),
        listino_id: null,
        descrizione: `${r.descrizione} · ${r.unita_misura} [${r.fonte}]`,
        quantita: r.quantita,
        unita_misura: r.unita_misura === "ml" ? "m" : "pz",
        prezzo_vendita: r.prezzo_unitario,
        prezzo_acquisto: null,
      })),
    ],
  };
}
