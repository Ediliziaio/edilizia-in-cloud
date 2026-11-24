/**
 * Il modello di sopralluogo scritto dall'AI, ripulito prima di arrivare all'editor
 * (piano sopralluoghi, lotto 6). Lo usano la edge function `ai-genera-modello-sopralluogo` e i test.
 *
 * L'AI può sbagliare forma: tipi di campo che non esistono, chiavi con spazi, scelte senza opzioni,
 * righe del preventivo che puntano a campi inventati. Qui si corregge quello che si può e si scrive
 * cosa si è corretto; quello che non serve si toglie. Mai fidarsi della forma del JSON del modello.
 */

const TIPI_CAMPO = new Set(["text", "textarea", "number", "dimension", "select", "multiselect", "boolean", "date", "color", "currency"]);
const UNITA_CAMPO = new Set(["cm", "mm", "m", "mq", "ml", "kw", "kwh", "kg", "l", "gradi", "°C"]);
const UNITA_RIGA = new Set(["pz", "mq", "ml", "m", "kg", "h", "corpo"]);
const MAX_TIPI = 10;
const MAX_SEZIONI = 8;
const MAX_CAMPI = 20;
const MAX_OPZIONI = 25;

type J = Record<string, unknown>;
const ogg = (v: unknown): J | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const testo = (v: unknown, max = 120): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export const chiaveDa = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "campo";

function unica(chiave: string, usate: Set<string>): string {
  let k = chiave;
  for (let i = 2; usate.has(k); i++) k = `${chiave}_${i}`;
  usate.add(k);
  return k;
}

export interface EsitoModelloGenerato {
  schema: {
    version: 1;
    header_schema: J[];
    area_definition: J;
    element_types: J[];
    general_required_photos: J[];
    output_mapping: { estimate_lines: Record<string, J> };
  };
  avvisi: string[];
}

function campi(grezzi: unknown, usate: Set<string>, avvisi: string[], dove: string): J[] {
  const fuori: J[] = [];
  for (const g of lista(grezzi).slice(0, MAX_CAMPI)) {
    const c = ogg(g);
    if (!c) continue;
    const label = testo(c.label);
    if (!label) continue;
    let tipo = testo(c.type, 20);
    if (!TIPI_CAMPO.has(tipo)) {
      avvisi.push(`${dove}: «${label}» aveva un tipo sconosciuto (${tipo || "vuoto"}), diventa testo`);
      tipo = "text";
    }
    const campo: J = { key: unica(chiaveDa(testo(c.key, 48) || label), usate), label, type: tipo, width: [3, 4, 6, 8, 12].includes(Number(c.width)) ? Number(c.width) : 6 };
    if (c.required === true) campo.required = true;
    if (c.solo_tecnico === true) campo.solo_tecnico = true;
    const aiuto = testo(c.help, 200);
    if (aiuto) campo.help = aiuto;
    if (tipo === "dimension") campo.unit = UNITA_CAMPO.has(testo(c.unit, 8)) ? testo(c.unit, 8) : "cm";
    if (tipo === "select" || tipo === "multiselect") {
      const valori = new Set<string>();
      const opzioni = lista(c.options).slice(0, MAX_OPZIONI).flatMap((o) => {
        const x = ogg(o);
        const l = x ? testo(x.label, 80) : testo(o, 80);
        if (!l) return [];
        const v = unica(chiaveDa((x && testo(x.value, 48)) || l), valori);
        return [{ value: v, label: l }];
      });
      if (opzioni.length < 2) {
        avvisi.push(`${dove}: «${label}» era una scelta senza almeno due opzioni, diventa testo`);
        campo.type = "text";
      } else {
        campo.options = opzioni;
      }
    }
    fuori.push(campo);
  }
  return fuori;
}

function sezioni(grezze: unknown, avvisi: string[], dove: string, usate = new Set<string>()): J[] {
  const chiaviSezioni = new Set<string>();
  return lista(grezze).slice(0, MAX_SEZIONI).flatMap((g) => {
    const s = ogg(g);
    if (!s) return [];
    const label = testo(s.label) || "Dati";
    const f = campi(s.fields, usate, avvisi, `${dove} › ${label}`);
    if (!f.length) return [];
    const sezione: J = { key: unica(chiaveDa(testo(s.key, 48) || label), chiaviSezioni), label, fields: f };
    if (s.solo_tecnico === true) sezione.solo_tecnico = true;
    return [sezione];
  });
}

function foto(grezze: unknown, max: number): J[] {
  const usate = new Set<string>();
  return lista(grezze).slice(0, max).flatMap((g) => {
    const x = ogg(g);
    const label = x ? testo(x.label) : testo(g);
    return label ? [{ key: unica(chiaveDa((x && testo(x.key, 48)) || label), usate), label, required: x?.required === true }] : [];
  });
}

export function normalizzaModelloGenerato(grezzo: unknown): EsitoModelloGenerato {
  const avvisi: string[] = [];
  const r = ogg(grezzo) ?? {};
  const chiaviTipi = new Set<string>();
  const tipiGrezzi = lista(r.element_types);
  if (tipiGrezzi.length > MAX_TIPI) avvisi.push(`Tenuti i primi ${MAX_TIPI} tipi di elemento su ${tipiGrezzi.length}`);
  const tipi = tipiGrezzi.slice(0, MAX_TIPI).flatMap((g) => {
    const t = ogg(g);
    if (!t) return [];
    const label = testo(t.label);
    if (!label) return [];
    const sez = sezioni(t.sections, avvisi, label);
    if (!sez.length) {
      avvisi.push(`«${label}» non aveva campi validi ed è stato tolto`);
      return [];
    }
    return [{
      key: unica(chiaveDa(testo(t.key, 48) || label), chiaviTipi),
      label,
      label_plural: testo(t.label_plural) || label,
      sections: sez,
      required_photos: foto(t.required_photos, 6),
      allow_quantity: true,
      _grezzo: t,
    }];
  });

  const righe: Record<string, J> = {};
  const mapping = ogg(ogg(r.output_mapping)?.estimate_lines) ?? {};
  for (const t of tipi) {
    const grezzaChiave = testo((t._grezzo as J).key, 48);
    const m = ogg(mapping[grezzaChiave]) ?? ogg(mapping[t.key]);
    if (!m) continue;
    const chiavi = new Set((t.sections as J[]).flatMap((s) => (s.fields as J[]).map((f) => f.key as string)));
    const numeriche = new Set((t.sections as J[]).flatMap((s) => (s.fields as J[]).filter((f) => f.type === "number" || f.type === "dimension").map((f) => f.key as string)));
    let descrizione = testo(m.description_template, 200);
    const inventati = [...descrizione.matchAll(/\{([a-z0-9_]+)\}/gi)].map((x) => x[1]).filter((k) => !chiavi.has(k));
    for (const k of inventati) descrizione = descrizione.replace(`{${k}}`, "");
    if (inventati.length) avvisi.push(`Riga del preventivo di «${t.label}»: tolti campi che non esistono (${inventati.join(", ")})`);
    descrizione = descrizione.replace(/\s+/g, " ").trim();
    if (!descrizione) continue;
    const qf = testo(m.quantity_field, 48);
    righe[t.key as string] = {
      description_template: descrizione,
      unit: UNITA_RIGA.has(testo(m.unit, 8)) ? testo(m.unit, 8) : "pz",
      quantity_field: numeriche.has(qf) ? qf : "quantity",
    };
  }

  const area = ogg(r.area_definition) ?? {};
  const testata = sezioni(r.header_schema, avvisi, "Dati iniziali");
  if (!tipi.length) avvisi.push("Nessun tipo di elemento valido: il modello va completato a mano");

  return {
    schema: {
      version: 1,
      header_schema: testata,
      area_definition: {
        label: testo(area.label, 40) || "Ambiente",
        label_plural: testo(area.label_plural, 40) || "Ambienti",
        name_suggestions: lista(area.name_suggestions).map((x) => testo(x, 40)).filter(Boolean).slice(0, 20),
        fields: [],
      },
      element_types: tipi.map(({ _grezzo: _g, ...t }) => t),
      general_required_photos: foto(r.general_required_photos, 8),
      output_mapping: { estimate_lines: righe },
    },
    avvisi,
  };
}
