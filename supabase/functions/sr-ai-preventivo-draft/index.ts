/**
 * sr-ai-preventivo-draft
 *
 * Genera una BOZZA strutturata per il preventivatore serramenti.
 * Non scrive righe nel preventivo: la UI deve far approvare ogni posizione
 * prima di inserirla in sr_serramenti_progetto.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

type DraftSource = "testo" | "foto" | "mixed";

interface DraftImage {
  name: string;
  mime: string;
  data_base64: string;
}

interface DraftRequest {
  progetto_id: string;
  prompt?: string;
  source?: DraftSource;
  images?: DraftImage[];
}

interface ListinoFamily {
  id: string;
  nome: string;
  descrizione?: string | null;
  modalita_prezzo_base?: string | null;
  prezzo_base_vendita?: number | string | null;
  macrocategoria_id?: string | null;
  categoria_id?: string | null;
  custom_field_values?: Record<string, unknown> | null;
}

interface GridCell {
  id: string;
  family_id: string;
  valore_x: number | null;
  valore_y: number | null;
  prezzo_vendita: number | string | null;
  supplier_catalog_id: string | null;
  supplier_product_line_id: string | null;
}

interface AiItemRaw {
  ambiente?: string;
  tipologia?: string;
  tipologia_label?: string;
  materiale?: string;
  serie?: string;
  vetro?: string;
  apertura?: string;
  colore_interno?: string;
  colore_esterno?: string;
  larghezza_mm?: number;
  altezza_mm?: number;
  quantita?: number;
  family_nome?: string;
  note?: string;
  confidence?: number;
  missing_fields?: string[];
  warnings?: string[];
}

interface AiDraftRaw {
  summary?: string;
  items?: AiItemRaw[];
  warnings?: string[];
  questions?: string[];
}

interface StaffEditPermissions {
  can_edit_marketing?: boolean | null;
  can_edit_marketing_opportunities?: boolean | null;
}

interface DraftItem {
  id: string;
  ambiente: string | null;
  tipologia: string;
  tipologia_label: string;
  materiale: string | null;
  serie: string | null;
  vetro: string | null;
  apertura: string | null;
  colore_interno: string | null;
  colore_esterno: string | null;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  quantita: number;
  family_id: string | null;
  family_nome: string | null;
  listino_voce_id: string | null;
  supplier_catalog_id: string | null;
  supplier_product_line_id: string | null;
  prezzo_unitario: number | null;
  prezzo_totale: number | null;
  note: string | null;
  confidence: number;
  missing_fields: string[];
  warnings: string[];
}

const SYSTEM_PROMPT = `Sei l'assistente AI del preventivatore serramenti Edilizia in Cloud.
Devi trasformare testo, foto di rilievo o appunti in una BOZZA di righe preventivo serramenti.

OUTPUT OBBLIGATORIO: solo JSON valido, niente markdown, con schema:
{
  "summary": "breve sintesi per il commerciale",
  "items": [
    {
      "ambiente": "Soggiorno",
      "tipologia": "finestra_2ante",
      "tipologia_label": "Finestra 2 ante",
      "materiale": "pvc|alluminio|legno|alluminio_legno|acciaio|misto",
      "serie": "nome modello o serie se dichiarata",
      "vetro": "vetrocamera, triplo vetro, stratificato...",
      "apertura": "battente, scorrevole, vasistas...",
      "colore_interno": "se indicato",
      "colore_esterno": "se indicato",
      "larghezza_mm": 1200,
      "altezza_mm": 1400,
      "quantita": 2,
      "family_nome": "nome articolo/listino se evidente tra quelli disponibili",
      "note": "note utili",
      "confidence": 0.0,
      "missing_fields": ["larghezza_mm"],
      "warnings": ["misura letta male, confermare"]
    }
  ],
  "warnings": [],
  "questions": []
}

REGOLE NON NEGOZIABILI:
1. Non inventare misure. Se non sono scritte o dette, mettile mancanti.
2. Da una foto normale puoi riconoscere tipologia/materiale probabile, ma non misure precise senza appunti, metro o quote leggibili.
3. Non inventare prezzi. Il sistema calcola prezzi dopo il tuo JSON.
4. Se non sei sicuro di materiale, serie, vetro o colore, lascia il campo vuoto e aggiungi missing_fields/warnings.
5. Usa quantita=1 se una voce singolare e' evidente; se non chiaro, segnala.
6. tipologia deve essere una chiave breve se possibile: finestra_1anta, finestra_2ante, porta_finestra, scorrevole, persiana, portoncino, zanzariera, accessorio.
7. Le righe devono essere operative per un commerciale: concrete e controllabili.
8. COMPLETEZZA: non perdere voci. Se il commerciale elenca piu' ambienti o piu' pezzi, crea UNA riga per ciascun pezzo/ambiente. Meglio una riga in piu' (con missing_fields da confermare) che dimenticarne una.
9. ACCESSORI come righe separate: avvolgibili/tapparelle, cassonetti, zanzariere, davanzali/soglie, controtelai/falsi telai, inferriate, motorizzazioni — se citati o chiaramente visibili — vanno SEMPRE in righe proprie (tipologia "zanzariera" o "accessorio"), non fusi dentro la finestra. Riporta in 'note' a quale serramento/ambiente si riferiscono.
10. "A CORPO": se la richiesta e' "fornitura a corpo" o un importo unico senza dettaglio pezzi, crea UNA riga descrittiva (tipologia "accessorio"), quantita 1, e segnala in warnings che e' una voce a corpo da dettagliare.
11. POSA: se e' citata posa/installazione/smontaggio (inclusa o esclusa), riportalo in 'note' della riga. Il prezzo della posa lo gestisce il sistema, non metterlo tu.
12. CONFIDENCE realistica: 0.85+ se misure E tipologia sono chiare; 0.5-0.85 se inferito ragionevolmente; <0.5 se molto incerto (e aggiungi un warning).
13. Sfrutta il CONTESTO PROGETTO (tipo intervento, materiale principale, vincoli, serramenti gia' presenti): usa quei default quando il commerciale non specifica, e NON ripetere serramenti gia' presenti nel preventivo.`;

const MAX_IMAGES = 6;
const MAX_TOTAL_IMAGE_BASE64_CHARS = 18_000_000;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("Metodo non consentito", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = (await req.json()) as DraftRequest;
    const progettoId = body.progetto_id;
    if (!progettoId) return errorResponse("progetto_id obbligatorio", 400, cors);

    const prompt = (body.prompt ?? "").trim();
    const images = (body.images ?? []).filter((img) => img.data_base64 && img.mime?.startsWith("image/")).slice(0, MAX_IMAGES);
    if (prompt.length < 8 && images.length === 0) {
      return errorResponse("Inserisci testo/audio trascritto o almeno una foto", 400, cors);
    }
    const totalImagePayload = images.reduce((sum, img) => sum + img.data_base64.length, 0);
    if (totalImagePayload > MAX_TOTAL_IMAGE_BASE64_CHARS) {
      return errorResponse("Foto troppo pesanti: carica immagini compresse o meno foto alla volta", 413, cors);
    }

    const { data: progetto, error: progettoError } = await supabaseAdmin
      .from("sr_progetti")
      .select("id, company_id, cliente_nome, cliente_cognome, cliente_indirizzo, cliente_citta, cliente_cap, cliente_provincia, cliente_telefono, cliente_email, cantiere_indirizzo, cantiere_citta, cantiere_cap, cantiere_provincia, cantiere_piano, cantiere_vincoli, tipo_intervento, intervento_titolo, intervento_sintesi, materiale_principale")
      .eq("id", progettoId)
      .maybeSingle();
    if (progettoError || !progetto) return errorResponse("Progetto serramenti non trovato", 404, cors);

    const companyId = progetto.company_id as string;
    const access = await requireCompanyAccess(supabaseAdmin, userId, companyId, cors);
    await requireSerramentiAiPermission(supabaseAdmin, userId, companyId, access.roles, cors);

    const familiesRes = await supabaseAdmin
      .from("article_families")
      .select("id, nome, descrizione, modalita_prezzo_base, prezzo_base_vendita, macrocategoria_id, categoria_id, custom_field_values")
      .eq("company_id", companyId)
      .eq("attivo", true)
      .is("deleted_at", null)
      .order("nome", { ascending: true })
      .limit(160);
    if (familiesRes.error) {
      return errorResponse("Listino serramenti non leggibile", 500, cors);
    }

    const families = ((familiesRes.data ?? []) as ListinoFamily[]);
    const familyIds = families.map((family) => family.id);
    let grid: GridCell[] = [];
    if (familyIds.length > 0) {
      const gridRes = await supabaseAdmin
        .from("listino_griglia")
        .select("id, family_id, valore_x, valore_y, prezzo_vendita, supplier_catalog_id, supplier_product_line_id")
        .in("family_id", familyIds)
        .limit(2500);
      if (gridRes.error) {
        return errorResponse("Griglia prezzi serramenti non leggibile", 500, cors);
      }
      grid = ((gridRes.data ?? []) as GridCell[]);
    }

    // Serramenti GIÀ presenti nel preventivo → contesto anti-duplicato (regola 13).
    // Fail-soft: se la lettura fallisce non blocchiamo la bozza.
    let esistentiContext = "";
    try {
      const esistentiRes = await supabaseAdmin
        .from("sr_serramenti_progetto")
        .select("tipologia_label, ambiente, larghezza_mm, altezza_mm, quantita")
        .eq("progetto_id", progettoId)
        .limit(60);
      const righe = (esistentiRes.data ?? []) as Array<Record<string, unknown>>;
      if (righe.length > 0) {
        esistentiContext = righe.map((r) => {
          const dim = r.larghezza_mm && r.altezza_mm ? ` ${r.larghezza_mm}x${r.altezza_mm}mm` : "";
          const qty = r.quantita ? ` x${r.quantita}` : "";
          const amb = r.ambiente ? ` (${r.ambiente})` : "";
          return `- ${r.tipologia_label ?? "voce"}${amb}${dim}${qty}`;
        }).join("\n");
      }
    } catch (_e) {
      esistentiContext = "";
    }

    const familyContext = families.slice(0, 120).map((family) => {
      const values = family.custom_field_values ?? {};
      const material = stringValue(values.materiale_profilo) ?? stringValue(values.materiale) ?? "";
      const serie = stringValue(values.serie) ?? stringValue(values.nome_serie) ?? "";
      return [
        `id=${family.id}`,
        `nome=${family.nome}`,
        material ? `materiale=${material}` : "",
        serie ? `serie=${serie}` : "",
        family.modalita_prezzo_base ? `prezzo=${family.modalita_prezzo_base}` : "",
      ].filter(Boolean).join(" | ");
    }).join("\n");

    const clienteNome = [progetto.cliente_nome, progetto.cliente_cognome]
      .filter(Boolean)
      .join(" ") || "non indicato";
    const clienteIndirizzo = [
      progetto.cliente_indirizzo,
      [progetto.cliente_cap, progetto.cliente_citta].filter(Boolean).join(" "),
      progetto.cliente_provincia,
    ].filter(Boolean).join(", ") || "non indicato";
    const cantiereIndirizzo = [
      progetto.cantiere_indirizzo,
      [progetto.cantiere_cap, progetto.cantiere_citta].filter(Boolean).join(" "),
      progetto.cantiere_provincia,
      progetto.cantiere_piano ? `piano ${progetto.cantiere_piano}` : "",
    ].filter(Boolean).join(", ") || "non indicato";
    const vincoliCantiere = Array.isArray(progetto.cantiere_vincoli) && progetto.cantiere_vincoli.length > 0
      ? progetto.cantiere_vincoli.join(", ")
      : "non indicati";

    const userText = [
      "CONTESTO PROGETTO:",
      `Cliente: ${clienteNome}`,
      `Contatti cliente: telefono ${progetto.cliente_telefono ?? "non indicato"} · email ${progetto.cliente_email ?? "non indicata"}`,
      `Indirizzo cliente: ${clienteIndirizzo}`,
      `Cantiere: ${cantiereIndirizzo}`,
      `Vincoli cantiere: ${vincoliCantiere}`,
      `Tipo intervento: ${progetto.tipo_intervento ?? "non indicato"}`,
      `Titolo intervento: ${progetto.intervento_titolo ?? "non indicato"}`,
      `Sintesi intervento: ${progetto.intervento_sintesi ?? "non indicata"}`,
      `Materiale principale progetto: ${progetto.materiale_principale ?? "non indicato"}`,
      `Fonte input: ${body.source ?? (images.length > 0 ? "foto" : "testo")}`,
      esistentiContext
        ? `Serramenti GIÀ presenti nel preventivo (NON ripeterli, aggiungi solo i nuovi):\n${esistentiContext}`
        : "Serramenti già presenti nel preventivo: nessuno",
      "",
      "RICHIESTA COMMERCIALE:",
      prompt || "(nessun testo, analizza le immagini)",
      "",
      "ARTICOLI LISTINO DISPONIBILI (se riconosci un nome simile usa family_nome):",
      familyContext || "Nessun articolo listino disponibile: crea solo righe descrittive con prezzo da confermare.",
    ].join("\n");

    const userContent: Array<Record<string, unknown>> = [{ type: "text", text: userText }];
    for (const image of images) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${image.mime};base64,${image.data_base64}`,
        },
      });
    }

    const t0 = Date.now();
    const aiRes = await aiRouterComplete({
      supabase: supabaseAdmin,
      taskKey: images.length > 0 ? "serramenti_photo_to_quote" : "serramenti_text_to_quote",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      params: { temperature: 0.1, max_tokens: 6000 },
      responseFormat: { type: "json_object" },
      companyId,
      userId,
      personaKey: "sales",
      estimatedCostEur: images.length > 0 ? 0.08 : 0.03,
    });

    const parsed = parseJson(aiRes.content);
    const normalized = normalizeDraft(parsed, families, grid);
    return jsonResponse({
      ...normalized,
      model_used: aiRes.modelUsed,
      duration_ms: Date.now() - t0,
    }, 200, cors);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[sr-ai-preventivo-draft]", error);
    return errorResponse(error instanceof Error ? error.message : "Errore bozza AI serramenti", 500, cors);
  }
});

function normalizeDraft(raw: AiDraftRaw, families: ListinoFamily[], grid: GridCell[]) {
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter(Boolean).map(String) : [];
  const questions = Array.isArray(raw.questions) ? raw.questions.filter(Boolean).map(String) : [];
  const rawItems = Array.isArray(raw.items) ? raw.items : [];

  const items: DraftItem[] = rawItems.slice(0, 40).map((item, index) => {
    const match = matchFamily(item, families);
    const larghezza = positiveNumber(item.larghezza_mm);
    const altezza = positiveNumber(item.altezza_mm);
    const quantita = Math.max(1, Math.min(99, Math.round(positiveNumber(item.quantita) ?? 1)));
    const price = match && larghezza && altezza
      ? computePrice(match, grid, larghezza, altezza, quantita)
      : null;
    const missing = new Set<string>(Array.isArray(item.missing_fields) ? item.missing_fields.map(String) : []);
    if (!larghezza) missing.add("larghezza_mm");
    if (!altezza) missing.add("altezza_mm");
    if (!item.tipologia_label && !item.tipologia && !match) missing.add("tipologia");
    const itemWarnings = Array.isArray(item.warnings) ? item.warnings.filter(Boolean).map(String) : [];
    if (!match) {
      itemWarnings.push("Articolo listino non trovato: la voce sara' inserita come riga manuale da prezzare.");
    } else if (!price) {
      itemWarnings.push("Prezzo non calcolato dal listino: verificare misure, griglia o prezzo base.");
    }

    return {
      id: `ai-${index + 1}`,
      ambiente: clean(item.ambiente),
      tipologia: clean(item.tipologia) ?? "voce_manuale",
      tipologia_label: clean(item.tipologia_label) ?? clean(item.family_nome) ?? clean(item.tipologia) ?? "Serramento da verificare",
      materiale: normalizeMateriale(item.materiale),
      serie: clean(item.serie),
      vetro: clean(item.vetro),
      apertura: clean(item.apertura),
      colore_interno: clean(item.colore_interno),
      colore_esterno: clean(item.colore_esterno),
      larghezza_mm: larghezza,
      altezza_mm: altezza,
      quantita,
      family_id: match?.id ?? null,
      family_nome: match?.nome ?? clean(item.family_nome),
      listino_voce_id: price?.grigliaId ?? null,
      supplier_catalog_id: price?.supplierCatalogId ?? null,
      supplier_product_line_id: price?.supplierProductLineId ?? null,
      prezzo_unitario: price?.unit ?? null,
      prezzo_totale: price?.total ?? null,
      note: clean(item.note),
      confidence: clamp(Number(item.confidence ?? (match ? 0.72 : 0.45)), 0, 1),
      missing_fields: Array.from(missing),
      warnings: itemWarnings,
    };
  });

  if (items.length === 0) {
    warnings.push("Nessuna posizione serramento riconosciuta. Riprova aggiungendo misure, quantità e tipologia.");
  }

  return {
    summary: clean(raw.summary),
    items,
    warnings,
    questions,
  };
}

function matchFamily(item: AiItemRaw, families: ListinoFamily[]): ListinoFamily | null {
  const target = normalize([
    item.family_nome,
    item.tipologia_label,
    item.tipologia,
    item.materiale,
    item.serie,
  ].filter(Boolean).join(" "));
  if (!target) return null;

  let best: { family: ListinoFamily; score: number } | null = null;
  for (const family of families) {
    const haystack = normalize([
      family.nome,
      family.descrizione,
      stringValue(family.custom_field_values?.materiale_profilo),
      stringValue(family.custom_field_values?.serie),
      stringValue(family.custom_field_values?.nome_serie),
    ].filter(Boolean).join(" "));
    if (!haystack) continue;
    let score = 0;
    if (haystack === target) score += 1;
    if (haystack.includes(target) || target.includes(haystack)) score += 0.75;
    const tokens = target.split(" ").filter((t) => t.length > 2);
    const hits = tokens.filter((t) => haystack.includes(t)).length;
    score += tokens.length ? hits / tokens.length : 0;
    if (!best || score > best.score) best = { family, score };
  }
  return best && best.score >= 0.45 ? best.family : null;
}

function computePrice(
  family: ListinoFamily,
  grid: GridCell[],
  larghezza: number,
  altezza: number,
  quantita: number,
): {
  unit: number;
  total: number;
  grigliaId: string | null;
  supplierCatalogId: string | null;
  supplierProductLineId: string | null;
} | null {
  const mode = family.modalita_prezzo_base ?? "pz";
  let unit: number | null = null;
  let selectedCell: GridCell | null = null;
  if (mode === "griglia") {
    const cells = grid
      .filter((cell) => cell.family_id === family.id && Number(cell.valore_x) >= larghezza && Number(cell.valore_y) >= altezza)
      .sort((a, b) => Number(a.valore_x) * Number(a.valore_y) - Number(b.valore_x) * Number(b.valore_y));
    selectedCell = cells[0] ?? null;
    unit = numberValue(selectedCell?.prezzo_vendita);
  } else if (mode === "mq") {
    const base = numberValue(family.prezzo_base_vendita);
    if (base != null) unit = base * ((larghezza * altezza) / 1_000_000);
  } else {
    unit = numberValue(family.prezzo_base_vendita);
  }
  if (unit == null || !Number.isFinite(unit) || unit <= 0) return null;
  const rounded = Number(unit.toFixed(2));
  return {
    unit: rounded,
    total: Number((rounded * quantita).toFixed(2)),
    grigliaId: selectedCell?.id ?? null,
    supplierCatalogId: selectedCell?.supplier_catalog_id ?? null,
    supplierProductLineId: selectedCell?.supplier_product_line_id ?? null,
  };
}

function parseJson(content: string): AiDraftRaw {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as AiDraftRaw;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as AiDraftRaw;
    }
    throw new Error("Risposta AI non strutturata");
  }
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function positiveNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : null;
}

function numberValue(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeMateriale(value: unknown): string | null {
  const v = normalize(String(value ?? ""));
  if (!v) return null;
  if (v.includes("pvc")) return "pvc";
  if (v.includes("alluminio") && v.includes("legno")) return "alluminio_legno";
  if (v.includes("alluminio")) return "alluminio";
  if (v.includes("legno")) return "legno";
  if (v.includes("acciaio")) return "acciaio";
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

async function requireSerramentiAiPermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  userId: string,
  companyId: string,
  roles: string[],
  cors: Record<string, string>,
) {
  if (roles.includes("super_admin") || roles.includes("company_admin")) return;

  const [{ data: multiAccess, error: multiError }, { data: permissions, error: permissionsError }] =
    await Promise.all([
      supabaseAdmin
        .from("multi_company_access")
        .select("access_role")
        .eq("user_id", userId)
        .eq("company_id", companyId)
        .maybeSingle(),
      supabaseAdmin
        .from("staff_permissions")
        .select("can_edit_marketing, can_edit_marketing_opportunities")
        .eq("user_id", userId)
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

  if (multiError || permissionsError) {
    throw new Response(
      JSON.stringify({ error: "Forbidden: unable to verify quote permissions" }),
      { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const accessRole = (multiAccess as { access_role?: string | null } | null)?.access_role ?? null;
  const staffPermissions = permissions as StaffEditPermissions | null;
  const canEdit = Boolean(staffPermissions?.can_edit_marketing_opportunities || staffPermissions?.can_edit_marketing);

  if (accessRole === "company_admin" || canEdit) return;

  throw new Response(
    JSON.stringify({ error: "Forbidden: quote edit permission required" }),
    { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
  );
}
