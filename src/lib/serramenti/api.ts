/**
 * src/lib/serramenti/api.ts — API client modulo Stima Serramenti
 *
 * Tutte le query rispettano il pattern Supabase con error handling esplicito.
 * Tabelle sr_* (mirror in src/types/serramenti.ts).
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  SrProgettoRow,
  SrSerramentoRow,
  SrAccessorioRow,
  SrMediaRow,
  SrCalcoloRisparmioRow,
  SrTemplatePdfRow,
  SrProgettoDetail,
  SrStatoProgetto,
  SrTipoIntervento,
} from "@/types/serramenti";

// ─── PROGETTI ───────────────────────────────────────────────────────────────

/**
 * Input creazione progetto: accetta TUTTI i campi del progetto, non solo i 4
 * essenziali. Bug fix: prima i campi cliente_indirizzo, cliente_telefono,
 * cliente_email, cap, provincia, ecc. inseriti nello Step 1 venivano persi
 * perché non passati a createProgetto.
 */
export type SrCreateProgettoInput = Partial<SrProgettoRow>;

export async function createProgetto(input: SrCreateProgettoInput): Promise<SrProgettoRow> {
  // company_id viene iniettato dal trigger / RLS check via profiles.company_id
  const { data: profile } = await supabase
    .from("profiles" as never)
    .select("company_id")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (profile as any)?.company_id;
  if (!companyId) throw new Error("Profilo senza azienda associata");

  // Whitelist dei campi insertabili (no id, created_at, code: gestiti da trigger)
  const insertable: Partial<SrProgettoRow> = {
    company_id: companyId,
    cliente_id: input.cliente_id ?? null,
    cliente_nome: input.cliente_nome ?? null,
    cliente_cognome: input.cliente_cognome ?? null,
    cliente_indirizzo: input.cliente_indirizzo ?? null,
    cliente_citta: input.cliente_citta ?? null,
    cliente_cap: input.cliente_cap ?? null,
    cliente_provincia: input.cliente_provincia ?? null,
    cliente_telefono: input.cliente_telefono ?? null,
    cliente_email: input.cliente_email ?? null,
    cliente_codice_fiscale: input.cliente_codice_fiscale ?? null,
    cantiere_indirizzo: input.cantiere_indirizzo ?? null,
    cantiere_citta: input.cantiere_citta ?? null,
    cantiere_cap: input.cantiere_cap ?? null,
    cantiere_provincia: input.cantiere_provincia ?? null,
    cantiere_piano: input.cantiere_piano ?? null,
    cantiere_condominio: input.cantiere_condominio ?? false,
    tipo_intervento: input.tipo_intervento ?? "sostituzione",
    intervento_titolo: input.intervento_titolo ?? null,
    intervento_sintesi: input.intervento_sintesi ?? null,
    materiale_principale: input.materiale_principale ?? null,
    esigenze: input.esigenze ?? [],
    soluzione: input.soluzione ?? [],
    perche_noi: input.perche_noi ?? null,
    incluso_investimento: input.incluso_investimento ?? null,
    testimonianze: input.testimonianze ?? [],
    prossimi_passi: input.prossimi_passi ?? null,
    note_interne: input.note_interne ?? null,
    sopralluogo_id: input.sopralluogo_id ?? null,
    opportunita_id: input.opportunita_id ?? null,
    stato: "bozza",
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_progetti")
    .insert(insertable)
    .select("*")
    .single();
  if (error) {
    console.error("[serramenti] createProgetto failed", error);
    throw new Error("Creazione progetto serramenti fallita");
  }
  return data as SrProgettoRow;
}

export async function createProgettoDaSopralluogo(
  sopralluogo_id: string,
  cliente_id?: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("sr_create_progetto_da_sopralluogo", {
    p_sopralluogo_id: sopralluogo_id,
    p_cliente_id: cliente_id ?? null,
  });
  if (error) {
    console.error("[serramenti] createProgettoDaSopralluogo failed", error);
    throw new Error("Creazione progetto da sopralluogo fallita");
  }
  return data as string;
}

export async function listProgetti(opts?: { stato?: SrStatoProgetto; limit?: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("sr_progetti")
    .select("id, code, stato, cliente_nome, cliente_cognome, cantiere_citta, totale_min, totale_max, totale_serramenti, tipo_intervento, materiale_principale, created_at, updated_at, consulenza_at, pdf_url")
    .order("created_at", { ascending: false });
  if (opts?.stato) q = q.eq("stato", opts.stato);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) {
    console.error("[serramenti] listProgetti failed", error);
    throw new Error("Errore caricamento progetti serramenti");
  }
  return (data ?? []) as SrProgettoRow[];
}

export async function getProgetto(id: string): Promise<SrProgettoDetail> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [
    { data: progetto, error: e1 },
    { data: serramenti, error: e2 },
    { data: accessori, error: e3 },
    { data: media, error: e4 },
    { data: risparmio, error: e5 },
    { data: manodopera, error: e6 },
  ] = await Promise.all([
    sb.from("sr_progetti").select("*").eq("id", id).maybeSingle(),
    sb.from("sr_serramenti_progetto").select("*").eq("progetto_id", id).order("position"),
    sb.from("sr_accessori_progetto").select("*").eq("progetto_id", id).order("position"),
    sb.from("sr_progetti_media").select("*").eq("progetto_id", id).order("position"),
    sb.from("sr_calcolo_risparmio").select("*").eq("progetto_id", id).maybeSingle(),
    sb.from("sr_servizi_progetto").select("*").eq("progetto_id", id).order("position"),
  ]);

  if (e1 || !progetto) {
    console.error("[serramenti] getProgetto failed", e1);
    throw new Error("Progetto non trovato");
  }
  if (e2 || e3 || e4 || e6) {
    console.error("[serramenti] getProgetto related failed", e2 || e3 || e4 || e6);
    throw new Error("Errore caricamento dati progetto");
  }
  if (e5 && e5.code !== "PGRST116") {
    console.warn("[serramenti] getProgetto risparmio missing", e5);
  }

  const serviziList = (manodopera ?? []) as import("@/types/serramenti").SrServizioRow[];
  return {
    progetto: progetto as SrProgettoRow,
    serramenti: (serramenti ?? []) as SrSerramentoRow[],
    accessori: (accessori ?? []) as SrAccessorioRow[],
    media: (media ?? []) as SrMediaRow[],
    risparmio: (risparmio ?? null) as SrCalcoloRisparmioRow | null,
    servizi: serviziList,
    manodopera: serviziList, // alias retrocompat
  };
}

export async function updateProgetto(id: string, patch: Partial<SrProgettoRow>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("sr_progetti").update(patch).eq("id", id);
  if (error) {
    console.error("[serramenti] updateProgetto failed", error);
    throw new Error("Salvataggio progetto fallito");
  }
}

export async function deleteProgetto(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("sr_progetti").delete().eq("id", id);
  if (error) throw new Error("Eliminazione progetto fallita");
}

// ─── SERRAMENTI (BOM) ───────────────────────────────────────────────────────

export async function addSerramento(
  progetto_id: string,
  serramento: Partial<SrSerramentoRow>,
): Promise<SrSerramentoRow> {
  const { data: progetto } = await supabase
    .from("sr_progetti" as never)
    .select("company_id")
    .eq("id", progetto_id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (progetto as any)?.company_id;
  if (!companyId) throw new Error("Progetto non trovato");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_serramenti_progetto")
    .insert({
      progetto_id,
      company_id: companyId,
      position: serramento.position ?? 0,
      tipologia: serramento.tipologia ?? "finestra_1anta",
      tipologia_label: serramento.tipologia_label ?? null,
      ambiente: serramento.ambiente ?? null,
      materiale: serramento.materiale ?? null,
      serie: serramento.serie ?? null,
      vetro: serramento.vetro ?? null,
      apertura: serramento.apertura ?? null,
      larghezza_mm: serramento.larghezza_mm ?? null,
      altezza_mm: serramento.altezza_mm ?? null,
      quantita: serramento.quantita ?? 1,
      prezzo_unitario: serramento.prezzo_unitario ?? null,
      prezzo_totale: serramento.prezzo_totale ?? null,
      note: serramento.note ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error("Aggiunta serramento fallita");
  return data as SrSerramentoRow;
}

export async function updateSerramento(id: string, patch: Partial<SrSerramentoRow>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_serramenti_progetto").update(patch).eq("id", id);
  if (error) throw new Error("Modifica serramento fallita");
}

export async function deleteSerramento(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_serramenti_progetto").delete().eq("id", id);
  if (error) throw new Error("Eliminazione serramento fallita");
}

// ─── ACCESSORI (BOM) ────────────────────────────────────────────────────────

export async function addAccessorio(
  progetto_id: string,
  accessorio: Partial<SrAccessorioRow>,
): Promise<SrAccessorioRow> {
  const { data: progetto } = await supabase
    .from("sr_progetti" as never)
    .select("company_id")
    .eq("id", progetto_id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (progetto as any)?.company_id;
  if (!companyId) throw new Error("Progetto non trovato");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_accessori_progetto")
    .insert({
      progetto_id,
      company_id: companyId,
      position: accessorio.position ?? 0,
      tipo: accessorio.tipo ?? "avvolgibile",
      descrizione: accessorio.descrizione ?? null,
      quantita: accessorio.quantita ?? 1,
      prezzo_unitario: accessorio.prezzo_unitario ?? null,
      prezzo_totale: accessorio.prezzo_totale ?? null,
      serramento_id: accessorio.serramento_id ?? null,
      note: accessorio.note ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error("Aggiunta accessorio fallita");
  return data as SrAccessorioRow;
}

export async function updateAccessorio(id: string, patch: Partial<SrAccessorioRow>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_accessori_progetto").update(patch).eq("id", id);
  if (error) throw new Error("Modifica accessorio fallita");
}

export async function deleteAccessorio(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_accessori_progetto").delete().eq("id", id);
  if (error) throw new Error("Eliminazione accessorio fallita");
}

// ─── TEMPLATE PDF (per azienda) ─────────────────────────────────────────────

export async function getTemplatePdf(): Promise<SrTemplatePdfRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_template_pdf").select("*").maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error("[serramenti] getTemplatePdf failed", error);
    return null;
  }
  return data as SrTemplatePdfRow | null;
}

// ─── LISTINO MANODOPERA (tariffe_aziendali) ─────────────────────────────────

export interface TariffaMinimal {
  id: string;
  nome: string;
  descrizione: string | null;
  unita: string | null;
  prezzo_costo: number | null;
  prezzo_vendita: number | null;
  categoria_prodotto: string | null;
  vertical_associato: string | null;
}

export async function listTariffeManodopera(searchQuery?: string): Promise<TariffaMinimal[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("tariffe_aziendali")
    .select("id, nome, descrizione, unita, prezzo_costo, prezzo_vendita, categoria_prodotto, vertical_associato, tipo, attiva")
    .eq("attiva", true)
    .order("nome", { ascending: true })
    .limit(100);
  if (searchQuery && searchQuery.trim().length >= 2) {
    const t = `%${searchQuery.trim()}%`;
    q = q.or(`nome.ilike.${t},descrizione.ilike.${t},categoria_prodotto.ilike.${t}`);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[serramenti] listTariffeManodopera failed", error);
    throw new Error("Errore caricamento tariffe manodopera");
  }
  return (data ?? []) as TariffaMinimal[];
}

// ─── Manodopera progetto (sr_servizi_progetto) ───────────────────────────

export async function addManodopera(
  progetto_id: string,
  m: Partial<import("@/types/serramenti").SrManodoperaRow>,
): Promise<import("@/types/serramenti").SrManodoperaRow> {
  const { data: prog } = await supabase
    .from("sr_progetti" as never)
    .select("company_id")
    .eq("id", progetto_id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (prog as any)?.company_id;
  if (!companyId) throw new Error("Progetto non trovato");

  const quantita = m.quantita ?? 1;
  const totCosto = m.prezzo_unitario_costo != null
    ? Number(m.prezzo_unitario_costo) * quantita : null;
  const totVendita = m.prezzo_unitario_vendita != null
    ? Number(m.prezzo_unitario_vendita) * quantita : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_servizi_progetto")
    .insert({
      progetto_id,
      company_id: companyId,
      position: m.position ?? 0,
      tariffa_id: m.tariffa_id ?? null,
      variante_id: m.variante_id ?? null,
      descrizione: m.descrizione ?? "Posa serramenti",
      unita: m.unita ?? "cantiere",
      quantita,
      prezzo_unitario_costo: m.prezzo_unitario_costo ?? null,
      prezzo_unitario_vendita: m.prezzo_unitario_vendita ?? null,
      prezzo_totale_costo: totCosto,
      prezzo_totale_vendita: totVendita,
      note: m.note ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error("Aggiunta manodopera fallita");
  return data as import("@/types/serramenti").SrManodoperaRow;
}

export async function updateManodopera(
  id: string,
  patch: Partial<import("@/types/serramenti").SrManodoperaRow>,
): Promise<void> {
  // Ricalcolo totali se cambia qty o prezzi unitari
  if (patch.quantita !== undefined || patch.prezzo_unitario_costo !== undefined || patch.prezzo_unitario_vendita !== undefined) {
    // Devo recuperare i valori attuali per i campi non in patch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orig } = await (supabase as any)
      .from("sr_servizi_progetto").select("quantita, prezzo_unitario_costo, prezzo_unitario_vendita").eq("id", id).maybeSingle();
    const q = patch.quantita ?? orig?.quantita ?? 1;
    const pc = patch.prezzo_unitario_costo ?? orig?.prezzo_unitario_costo;
    const pv = patch.prezzo_unitario_vendita ?? orig?.prezzo_unitario_vendita;
    if (pc != null) patch.prezzo_totale_costo = Number(pc) * q;
    if (pv != null) patch.prezzo_totale_vendita = Number(pv) * q;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_servizi_progetto").update(patch).eq("id", id);
  if (error) throw new Error("Modifica manodopera fallita");
}

export async function deleteManodopera(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_servizi_progetto").delete().eq("id", id);
  if (error) throw new Error("Eliminazione manodopera fallita");
}

// ─── LISTINO GERARCHIA (macrocategorie → categorie → families) ──────────────

export interface ListinoMacrocategoria {
  id: string;
  nome: string;
  descrizione: string | null;
  icona: string | null;
  colore: string | null;
  immagine_url: string | null;
  verticali_abilitati: string[];
}

export interface ListinoCategoria {
  id: string;
  nome: string;
  descrizione: string | null;
  icona: string | null;
  colore: string | null;
  immagine_url: string | null;
  macrocategoria_id: string | null;
}

/**
 * Lista macrocategorie attive. Opzioni:
 *   - `vertical`: filtra solo macro esposte al verticale (es. 'serramentista').
 *     Una macro con `verticali_abilitati = []` è considerata generica → sempre
 *     visibile. Quando passi un vertical, vedi: generiche + quelle con il vertical
 *     nell'array.
 *   - `onlyWithFamilies=true` (default nel picker preventivo): filtra fuori
 *     le macro senza famiglie nei suoi rami categoria → famiglia. Evita
 *     macrocategorie fantasma (create durante test ma mai popolate) che
 *     porterebbero a un dead-end UX.
 */
export async function listMacrocategorie(opts?: {
  onlyWithFamilies?: boolean;
  vertical?: string | null;
}): Promise<ListinoMacrocategoria[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("listino_macrocategorie")
    .select("id, nome, descrizione, icona, colore, immagine_url, verticali_abilitati")
    .eq("attivo", true)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });
  // Filtro vertical lato server via PostgREST `or`:
  // verticali_abilitati = '{}' (vuoto → generica) OR ? = ANY(verticali_abilitati)
  if (opts?.vertical) {
    q = q.or(`verticali_abilitati.eq.{},verticali_abilitati.cs.{${opts.vertical}}`);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[serramenti] listMacrocategorie failed", error);
    throw new Error("Errore caricamento macrocategorie listino");
  }
  const macros = (data ?? []) as ListinoMacrocategoria[];
  if (!opts?.onlyWithFamilies || macros.length === 0) return macros;

  // Filtro lato client: per ogni macro conta le famiglie esistenti.
  // 1 sola query: prendo tutte le famiglie con la loro categoria→macro.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: catRows } = await (supabase as any)
    .from("listino_categorie")
    .select("id, macrocategoria_id");
  const catToMacro = new Map<string, string>();
  (catRows ?? []).forEach((c: { id: string; macrocategoria_id: string | null }) => {
    if (c.macrocategoria_id) catToMacro.set(c.id, c.macrocategoria_id);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: famRows } = await (supabase as any)
    .from("article_families").select("categoria_id");
  const macrosWithFam = new Set<string>();
  (famRows ?? []).forEach((f: { categoria_id: string | null }) => {
    if (f.categoria_id) {
      const macroId = catToMacro.get(f.categoria_id);
      if (macroId) macrosWithFam.add(macroId);
    }
  });
  return macros.filter((m) => macrosWithFam.has(m.id));
}

/**
 * Lista categorie. Se `onlyWithFamilies=true` filtra fuori le categorie senza
 * articoli (dead-end UX).
 */
export async function listCategorieByMacro(
  macroId: string | null,
  opts?: { onlyWithFamilies?: boolean },
): Promise<ListinoCategoria[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("listino_categorie")
    .select("id, nome, descrizione, icona, colore, immagine_url, macrocategoria_id")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });
  if (macroId) q = q.eq("macrocategoria_id", macroId);
  const { data, error } = await q;
  if (error) {
    console.error("[serramenti] listCategorieByMacro failed", error);
    throw new Error("Errore caricamento categorie listino");
  }
  const cats = (data ?? []) as ListinoCategoria[];
  if (!opts?.onlyWithFamilies || cats.length === 0) return cats;

  const catIds = cats.map((c) => c.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: famRows } = await (supabase as any)
    .from("article_families")
    .select("categoria_id")
    .in("categoria_id", catIds);
  const catsWithFam = new Set<string>(
    (famRows ?? []).map((f: { categoria_id: string }) => f.categoria_id),
  );
  return cats.filter((c) => catsWithFam.has(c.id));
}

// ─── SCHEDA TECNICA: campi tipizzati per macrocategoria ──────────────────
//
// Ogni macrocategoria può definire un set di "campi descrittivi" tipizzati
// che vivono in `listino_macrocategoria_fields`. I valori per ogni articolo
// (famiglia) sono salvati in `article_families.custom_field_values` JSONB
// con chiave = `field_key`.
//
// Use case: "Infissi" ha campi {materiale_profilo, vetro, Uw, colori...},
// "Pannelli FV" ha {potenza_wp, efficienza, tecnologia_celle...}. Lo schema
// pilota sia il form di anagrafica famiglia che il rendering nel preventivo/PDF.

export type ListinoFieldType =
  | "text" | "textarea" | "number" | "select" | "multiselect" | "boolean" | "color";

export interface ListinoFieldOption {
  value: string;
  label: string;
}

export interface ListinoMacroField {
  id: string;
  macrocategoria_id: string;
  field_key: string;
  field_label: string;
  field_type: ListinoFieldType;
  field_unit: string | null;
  field_options: ListinoFieldOption[];
  field_placeholder: string | null;
  field_help: string | null;
  required: boolean;
  show_in_picker: boolean;
  show_in_pdf: boolean;
  sort_order: number;
}

/**
 * Carica la scheda tecnica (lista campi tipizzati) di una macrocategoria,
 * ordinata per sort_order. Restituisce array vuoto se la macro non ha schema.
 */
export async function listMacroFields(macroId: string): Promise<ListinoMacroField[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("listino_macrocategoria_fields")
    .select(`
      id, macrocategoria_id, field_key, field_label, field_type, field_unit,
      field_options, field_placeholder, field_help, required,
      show_in_picker, show_in_pdf, sort_order
    `)
    .eq("macrocategoria_id", macroId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[serramenti] listMacroFields failed", error);
    throw new Error("Errore caricamento scheda tecnica");
  }
  return (data ?? []) as ListinoMacroField[];
}

export async function createMacroField(
  input: Omit<ListinoMacroField, "id">,
): Promise<ListinoMacroField> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("listino_macrocategoria_fields")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    console.error("[serramenti] createMacroField failed", error);
    throw new Error("Errore creazione campo scheda tecnica");
  }
  return data as ListinoMacroField;
}

export async function updateMacroField(
  id: string,
  patch: Partial<Omit<ListinoMacroField, "id" | "macrocategoria_id">>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("listino_macrocategoria_fields")
    .update(patch)
    .eq("id", id);
  if (error) {
    console.error("[serramenti] updateMacroField failed", error);
    throw new Error("Errore aggiornamento campo scheda tecnica");
  }
}

export async function deleteMacroField(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("listino_macrocategoria_fields")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("[serramenti] deleteMacroField failed", error);
    throw new Error("Errore eliminazione campo scheda tecnica");
  }
}

/**
 * Bootstrap rapido: popola la scheda tecnica di una macro con i campi
 * standard del verticale indicato (serramentista | fotovoltaico | bagno |
 * tetti). Idempotente: campi già esistenti non vengono duplicati.
 * Ritorna il numero di campi effettivamente creati.
 */
export async function seedMacroFieldsFromVertical(
  macroId: string,
  vertical: string,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("seed_macro_fields_from_vertical", {
    p_macro_id: macroId,
    p_vertical: vertical,
  });
  if (error) {
    console.error("[serramenti] seedMacroFieldsFromVertical failed", error);
    throw new Error("Errore seed scheda tecnica");
  }
  return Number(data ?? 0);
}

/**
 * Aggiorna i verticali abilitati su una macrocategoria. Una macro con
 * `[]` (default) è generica e appare in tutti i moduli preventivo.
 */
export async function updateMacrocategoriaVerticali(
  macroId: string,
  verticali: string[],
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("listino_macrocategorie")
    .update({ verticali_abilitati: verticali })
    .eq("id", macroId);
  if (error) {
    console.error("[serramenti] updateMacrocategoriaVerticali failed", error);
    throw new Error("Errore aggiornamento verticali macrocategoria");
  }
}

// ─── LISTINO PRODOTTI (article_families + listino_griglia) ─────────────────

export interface ListinoFamily {
  id: string;
  nome: string;
  descrizione: string | null;
  immagine_url: string | null;
  vertical: string | null;
  prezzo_base_vendita: number | null;
  vat_rate: number | null;
  modalita_prezzo_base: string | null;
  categoria_id: string | null;
  // ─── Scheda tecnica (valori tipizzati dei campi definiti su macrocategoria) ─
  custom_field_values: Record<string, unknown>;
  // ─── Manodopera auto-link (configurata in FamilyEditor → Step Manodopera) ─
  manodopera_modalita: "tariffa" | "manuale" | "nessuna" | null;
  posa_tariffa_default_id: string | null;
  posa_quantita_default: number | null;
  posa_linked: boolean | null;
  manodopera_unita: string | null;
  manodopera_costo_acquisto: number | null;
  manodopera_prezzo_vendita: number | null;
}

export interface ListinoGrigliaItem {
  id: string;
  family_id: string;
  valore_x: number | null;
  valore_y: number | null;
  prezzo_vendita: number | null;
  prezzo_acquisto: number | null;
  note: string | null;
}

export async function listListinoFamilies(opts?: {
  searchQuery?: string;
  categoriaId?: string | null;
}): Promise<ListinoFamily[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("article_families")
    .select(`
      id, nome, descrizione, immagine_url, vertical, prezzo_base_vendita, vat_rate,
      modalita_prezzo_base, categoria_id, custom_field_values,
      manodopera_modalita, posa_tariffa_default_id, posa_quantita_default, posa_linked,
      manodopera_unita, manodopera_costo_acquisto, manodopera_prezzo_vendita
    `)
    .order("nome", { ascending: true })
    .limit(100);
  const search = opts?.searchQuery?.trim();
  if (search && search.length >= 2) {
    q = q.ilike("nome", `%${search}%`);
  }
  if (opts?.categoriaId) {
    q = q.eq("categoria_id", opts.categoriaId);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[serramenti] listListinoFamilies failed", error);
    throw new Error("Errore caricamento listino prodotti");
  }
  return (data ?? []) as ListinoFamily[];
}

export async function listGrigliaByFamily(family_id: string): Promise<ListinoGrigliaItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("listino_griglia")
    .select("id, family_id, valore_x, valore_y, prezzo_vendita, prezzo_acquisto, note")
    .eq("family_id", family_id)
    .order("valore_x", { ascending: true })
    .order("valore_y", { ascending: true });
  if (error) {
    console.error("[serramenti] listGrigliaByFamily failed", error);
    throw new Error("Errore caricamento griglia prezzi");
  }
  return (data ?? []) as ListinoGrigliaItem[];
}

// ─── CRM CONTACTS (riuso marketing_contacts) ────────────────────────────────

export interface CrmContactMinimal {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  company_name: string | null;
}

export async function listCrmContacts(searchQuery?: string, limit: number = 50): Promise<CrmContactMinimal[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("marketing_contacts")
    .select("id, first_name, last_name, email, phone, address, city, province, postal_code, company_name")
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (searchQuery && searchQuery.trim().length >= 2) {
    const t = `%${searchQuery.trim()}%`;
    q = q.or(`first_name.ilike.${t},last_name.ilike.${t},email.ilike.${t},phone.ilike.${t},company_name.ilike.${t}`);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[serramenti] listCrmContacts failed", error);
    throw new Error("Errore caricamento contatti CRM");
  }
  return (data ?? []) as CrmContactMinimal[];
}

// ─── RENDER INFISSI ─────────────────────────────────────────────────────────

export interface RenderSessionMinimal {
  id: string;
  status: string;
  result_urls: string[] | null;
  original_photo_url: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  created_at: string;
}

export async function listRenderSessions(opts?: { limit?: number }): Promise<RenderSessionMinimal[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("render_sessions")
    .select("id, status, result_urls, original_photo_url, config, created_at")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 30);
  if (error) {
    console.error("[serramenti] listRenderSessions failed", error);
    throw new Error("Errore caricamento render disponibili");
  }
  return ((data ?? []) as RenderSessionMinimal[]).filter(
    (r) => Array.isArray(r.result_urls) && r.result_urls.length > 0,
  );
}

/**
 * Importa un render esistente come media del progetto serramenti.
 * Crea una row in sr_progetti_media con kind='render', referenziando l'URL
 * direttamente da render_sessions (nessuna copia in storage perché il render
 * è già una risorsa firmata della stessa azienda).
 */
export async function importRender(input: {
  progetto_id: string;
  render_session_id: string;
  result_index?: number;
  caption?: string;
}): Promise<import("@/types/serramenti").SrMediaRow> {
  const { data: prog } = await supabase
    .from("sr_progetti" as never)
    .select("company_id")
    .eq("id", input.progetto_id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (prog as any)?.company_id;
  if (!companyId) throw new Error("Progetto non trovato");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rs, error: rsErr } = await (supabase as any)
    .from("render_sessions")
    .select("id, company_id, result_urls, status")
    .eq("id", input.render_session_id)
    .maybeSingle();
  if (rsErr || !rs) throw new Error("Render non trovato");
  if (rs.company_id !== companyId) throw new Error("Render appartiene ad altra azienda");
  if (!Array.isArray(rs.result_urls) || rs.result_urls.length === 0) {
    throw new Error("Render senza immagini disponibili");
  }
  const idx = input.result_index ?? 0;
  const url = rs.result_urls[idx] ?? rs.result_urls[0];

  // Insert direttamente come media kind='render'. Storage path = "render-session:<id>:<idx>"
  // (sentinel: la edge function PDF saprà che è un riferimento esterno e non
  // tenterà di rinfrescare la signed URL sul bucket sr-progetti).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_progetti_media")
    .insert({
      progetto_id: input.progetto_id,
      company_id: companyId,
      kind: "render",
      storage_path: `render-session:${rs.id}:${idx}`,
      url,
      caption: input.caption ?? null,
      posizione_pdf: "pag3_render",
      position: 0,
    })
    .select("*")
    .single();
  if (error) throw new Error("Aggiunta render al progetto fallita");
  return data as import("@/types/serramenti").SrMediaRow;
}

// ─── MEDIA ──────────────────────────────────────────────────────────────────

const SR_MEDIA_TTL_SEC = 60 * 60 * 24 * 7;

export interface UploadMediaInput {
  progetto_id: string;
  kind: import("@/types/serramenti").SrMediaKind;
  caption?: string | null;
  posizione_pdf?: string | null;
  serramento_id?: string | null;
  position?: number;
}

export async function uploadMedia(file: File, opts: UploadMediaInput): Promise<import("@/types/serramenti").SrMediaRow> {
  // 1) Ottieni company_id dal progetto
  const { data: prog } = await supabase
    .from("sr_progetti" as never)
    .select("company_id")
    .eq("id", opts.progetto_id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (prog as any)?.company_id;
  if (!companyId) throw new Error("Progetto non trovato");

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${companyId}/${opts.progetto_id}/photos/${filename}`;

  const { error: uploadErr } = await supabase.storage
    .from("sr-progetti")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadErr) {
    console.error("[serramenti] uploadMedia storage failed", uploadErr);
    throw new Error("Upload file fallito");
  }

  // Signed URL
  const { data: signed } = await supabase.storage
    .from("sr-progetti")
    .createSignedUrl(storagePath, SR_MEDIA_TTL_SEC);
  const url = signed?.signedUrl ?? "";

  // 2) Insert row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_progetti_media")
    .insert({
      progetto_id: opts.progetto_id,
      company_id: companyId,
      kind: opts.kind,
      storage_path: storagePath,
      url,
      caption: opts.caption ?? null,
      posizione_pdf: opts.posizione_pdf ?? null,
      serramento_id: opts.serramento_id ?? null,
      position: opts.position ?? 0,
    })
    .select("*")
    .single();
  if (error) {
    // Rollback storage
    try { await supabase.storage.from("sr-progetti").remove([storagePath]); }
    catch (e) { console.warn("[serramenti] uploadMedia rollback failed", e); }
    throw new Error("Registrazione media fallita");
  }
  return data as import("@/types/serramenti").SrMediaRow;
}

export async function deleteMedia(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("sr_progetti_media").select("storage_path").eq("id", id).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storagePath = (existing as any)?.storage_path;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("sr_progetti_media").delete().eq("id", id);
  if (error) throw new Error("Eliminazione media fallita");
  if (storagePath) {
    try {
      const { error: rmErr } = await supabase.storage.from("sr-progetti").remove([storagePath]);
      if (rmErr) console.warn("[serramenti] deleteMedia cleanup failed", storagePath, rmErr);
    } catch (e) {
      console.warn("[serramenti] deleteMedia exception", e);
    }
  }
}

// ─── EDGE FUNCTIONS ─────────────────────────────────────────────────────────

export async function generaPdf(progetto_id: string): Promise<{ html_url: string; duration_ms: number }> {
  const { data, error } = await supabase.functions.invoke("sr-genera-pdf", {
    body: { progetto_id },
  });
  if (error) {
    console.error("[serramenti] generaPdf failed", error);
    throw new Error("Generazione PDF fallita");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  if (!r?.ok) throw new Error(r?.error ?? "Generazione PDF fallita");
  return { html_url: r.html_url, duration_ms: r.duration_ms };
}

export async function convertiInOrdine(progetto_id: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("sr_converti_in_ordine", {
    p_progetto_id: progetto_id,
  });
  if (error) {
    console.error("[serramenti] convertiInOrdine failed", error);
    throw new Error(error.message || "Conversione in commessa fallita");
  }
  return data as string; // ordine_id
}

export async function importDaSopralluogo(input: {
  progetto_id: string;
  sopralluogo_id: string;
  replace?: boolean;
}): Promise<{ imported_count: number; accessori_imported: number }> {
  const { data, error } = await supabase.functions.invoke("sr-import-da-sopralluogo", {
    body: input,
  });
  if (error) {
    console.error("[serramenti] importDaSopralluogo failed", error);
    throw new Error("Import da sopralluogo fallito");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  if (!r?.ok) throw new Error(r?.error ?? "Import fallito");
  return { imported_count: r.imported_count, accessori_imported: r.accessori_imported };
}

export async function upsertTemplatePdf(patch: Partial<SrTemplatePdfRow>): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles" as never)
    .select("company_id")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (profile as any)?.company_id;
  if (!companyId) throw new Error("Profilo senza azienda");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_template_pdf")
    .upsert({ ...patch, company_id: companyId }, { onConflict: "company_id" });
  if (error) {
    console.error("[serramenti] upsertTemplatePdf failed", error);
    throw new Error("Salvataggio template fallito");
  }
}
