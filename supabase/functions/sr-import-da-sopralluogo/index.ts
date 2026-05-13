/**
 * Edge Function: sr-import-da-sopralluogo
 *
 * Importa i serramenti dal sopralluogo Infissi v6 nel BOM del progetto
 * Stima Serramenti. Mappa survey_elements (tipo=infisso) → sr_serramenti_progetto.
 *
 * Body: { progetto_id: string, sopralluogo_id: string, replace?: boolean }
 *  - replace=true: cancella i serramenti esistenti prima dell'import
 *  - replace=false (default): aggiunge in coda
 *
 * Output: { ok, imported_count, accessori_imported, area_groups }
 */
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

interface Payload {
  progetto_id: string;
  sopralluogo_id: string;
  replace?: boolean;
}

// Mappa apertura del sopralluogo → label visuale
const APERTURA_MAP: Record<string, string> = {
  battente_dx: "Apertura a Destra",
  battente_sx: "Apertura a Sinistra",
  anta_ribalta_dx: "Anta-Ribalta a Destra",
  anta_ribalta_sx: "Anta-Ribalta a Sinistra",
  due_ante_simmetriche: "Due ante simmetriche",
  anta_ribalta_simmetrica: "Due ante anta-ribalta",
  vasistas: "Solo Ribalta (vasistas)",
  scorrevole_dx: "Scorrevole verso Destra",
  scorrevole_sx: "Scorrevole verso Sinistra",
  scorrevole_simmetrico: "Scorrevole simmetrico",
  fisso: "Fisso",
  a_libro_dx: "A libro verso Destra",
  a_libro_sx: "A libro verso Sinistra",
};

const MATERIALE_MAP: Record<string, string> = {
  pvc: "pvc",
  alluminio: "alluminio",
  legno: "legno",
  alluminio_legno: "alluminio_legno",
  acciaio: "acciaio",
};

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    const auth = await requireAuth(req, corsHeaders);
    const supabaseAdmin = auth.supabaseAdmin;

    const p = (await req.json()) as Payload;
    if (!p.progetto_id) return errorResponse("progetto_id mancante", 400, corsHeaders);
    if (!p.sopralluogo_id) return errorResponse("sopralluogo_id mancante", 400, corsHeaders);

    // 1. Verifica progetto e sopralluogo + authz
    const { data: prog, error: progErr } = await supabaseAdmin
      .from("sr_progetti").select("id, company_id").eq("id", p.progetto_id).maybeSingle();
    if (progErr || !prog) return errorResponse("Progetto non trovato", 404, corsHeaders);

    const { data: survey, error: surveyErr } = await supabaseAdmin
      .from("surveys").select("id, company_id").eq("id", p.sopralluogo_id).maybeSingle();
    if (surveyErr || !survey) return errorResponse("Sopralluogo non trovato", 404, corsHeaders);
    if (survey.company_id !== prog.company_id) {
      return errorResponse("Sopralluogo e progetto appartengono a aziende diverse", 403, corsHeaders);
    }

    // 2. Replace mode: cancella esistenti
    if (p.replace) {
      await supabaseAdmin.from("sr_serramenti_progetto").delete().eq("progetto_id", p.progetto_id);
      await supabaseAdmin.from("sr_accessori_progetto").delete().eq("progetto_id", p.progetto_id);
    }

    // 3. Load elementi del sopralluogo (solo infissi)
    const { data: elements } = await supabaseAdmin
      .from("survey_elements")
      .select("id, element_type, area_id, values, quantity, position")
      .eq("survey_id", p.sopralluogo_id)
      .eq("element_type", "infisso")
      .order("position");

    if (!elements || elements.length === 0) {
      return jsonResponse(
        { ok: true, imported_count: 0, accessori_imported: 0, message: "Nessun infisso nel sopralluogo" },
        200, corsHeaders,
      );
    }

    // Load aree (per ambiente)
    const { data: areas } = await supabaseAdmin
      .from("survey_areas")
      .select("id, name")
      .eq("survey_id", p.sopralluogo_id);
    const areaName: Record<string, string> = {};
    for (const a of (areas ?? []) as Array<{ id: string; name: string }>) {
      areaName[a.id] = a.name;
    }

    // 4. Conta posizione iniziale (se non replace)
    const { data: existing } = await supabaseAdmin
      .from("sr_serramenti_progetto")
      .select("position")
      .eq("progetto_id", p.progetto_id)
      .order("position", { ascending: false })
      .limit(1);
    const startPos = (existing && existing[0]?.position != null) ? Number(existing[0].position) + 1 : 0;

    let startPosAcc = 0;
    {
      const { data: existingAcc } = await supabaseAdmin
        .from("sr_accessori_progetto")
        .select("position")
        .eq("progetto_id", p.progetto_id)
        .order("position", { ascending: false })
        .limit(1);
      startPosAcc = (existingAcc && existingAcc[0]?.position != null) ? Number(existingAcc[0].position) + 1 : 0;
    }

    // 5. Mappa ogni element → riga BOM
    const serramentiPayload: Array<Record<string, unknown>> = [];
    const accessoriPayload: Array<Record<string, unknown>> = [];
    let posSerr = startPos;
    let posAcc = startPosAcc;

    for (const el of elements as Array<{
      id: string; area_id: string | null; values: Record<string, unknown>; quantity: number;
    }>) {
      const values = (el.values ?? {}) as Record<string, unknown>;

      // Section "dati_chiave"
      const tipologia = (values.tipologia as string | undefined) ?? "finestra_2ante";
      const materiale = (values.materiale_richiesto as string | undefined)
        ?? (values.materiale as string | undefined)
        ?? null;
      const apertura = (values.apertura as string | undefined) ?? null;

      // Section "telaio" / colori (presenti nel template Infissi)
      const colore_interno = (values.colore_interno_infissi as string | undefined) ?? null;
      const colore_esterno = (values.colore_esterno_infissi as string | undefined) ?? null;

      // Misure (sezione misure_foro)
      const larghezza_mm = parseIntSafe(values.larghezza_mm) ?? parseIntSafe(values.larghezza) ?? null;
      const altezza_mm = parseIntSafe(values.altezza_mm) ?? parseIntSafe(values.altezza) ?? null;

      const ambiente = el.area_id ? areaName[el.area_id] : null;

      // Riga BOM
      serramentiPayload.push({
        progetto_id: p.progetto_id,
        company_id: prog.company_id,
        position: posSerr++,
        tipologia,
        tipologia_label: tipologiaLabel(tipologia),
        ambiente,
        materiale: materiale ? (MATERIALE_MAP[materiale] ?? materiale) : null,
        apertura: apertura ? (APERTURA_MAP[apertura] ?? apertura) : null,
        colore_interno,
        colore_esterno,
        larghezza_mm,
        altezza_mm,
        quantita: el.quantity ?? 1,
        metri_quadri: larghezza_mm && altezza_mm ? (larghezza_mm * altezza_mm * (el.quantity ?? 1)) / 1_000_000 : null,
      });

      // Accessori (complementi)
      const isComplemento = (key: string): boolean => {
        const v = values[key];
        if (typeof v === "boolean") return v;
        if (typeof v === "object" && v !== null) return true;
        return false;
      };
      const addAccessorio = (tipo: string, descrizione?: string) => {
        accessoriPayload.push({
          progetto_id: p.progetto_id,
          company_id: prog.company_id,
          position: posAcc++,
          tipo,
          descrizione: descrizione ?? null,
          quantita: el.quantity ?? 1,
        });
      };
      if (isComplemento("tapparella")) addAccessorio("tapparella", "Tapparella");
      if (isComplemento("cassonetto")) addAccessorio("cassonetto", "Sostituzione cassonetto");
      if (isComplemento("zanzariera")) addAccessorio("zanzariera", "Zanzariera");
      if (isComplemento("persiana")) addAccessorio("persiana", "Persiana");
      if (isComplemento("scuro")) addAccessorio("scuro", "Scuro");
      if (isComplemento("inferriata")) addAccessorio("inferriata", "Inferriata di sicurezza");
    }

    // 6. Insert
    if (serramentiPayload.length > 0) {
      const { error: insSerErr } = await supabaseAdmin
        .from("sr_serramenti_progetto")
        .insert(serramentiPayload);
      if (insSerErr) throw new Error(`Insert serramenti fallito: ${insSerErr.message}`);
    }
    if (accessoriPayload.length > 0) {
      const { error: insAccErr } = await supabaseAdmin
        .from("sr_accessori_progetto")
        .insert(accessoriPayload);
      if (insAccErr) throw new Error(`Insert accessori fallito: ${insAccErr.message}`);
    }

    // 7. Aggiorna link sopralluogo + sintesi
    await supabaseAdmin.from("sr_progetti").update({
      sopralluogo_id: p.sopralluogo_id,
      totale_serramenti: serramentiPayload.length,
      totale_accessori: accessoriPayload.length,
    }).eq("id", p.progetto_id);

    // 8. Audit
    await supabaseAdmin.from("sr_progetti_audit").insert({
      progetto_id: p.progetto_id,
      company_id: prog.company_id,
      user_id: auth.userId,
      event_type: "imported_from_sopralluogo",
      event_data: {
        sopralluogo_id: p.sopralluogo_id,
        serramenti_count: serramentiPayload.length,
        accessori_count: accessoriPayload.length,
        replace: !!p.replace,
      },
    });

    return jsonResponse({
      ok: true,
      imported_count: serramentiPayload.length,
      accessori_imported: accessoriPayload.length,
    }, 200, corsHeaders);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sr-import-da-sopralluogo] error", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});

function parseIntSafe(v: unknown): number | null {
  if (v == null) return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

function tipologiaLabel(tipo: string): string {
  const map: Record<string, string> = {
    finestra_1anta: "Finestra a 1 anta",
    finestra_2ante: "Finestra a 2 ante",
    finestra_3ante: "Finestra a 3 ante",
    finestra_4ante: "Finestra a 4 ante",
    portafinestra_1anta: "Porta-finestra a 1 anta",
    portafinestra_2ante: "Porta-finestra a 2 ante",
    portafinestra_3ante: "Porta-finestra a 3 ante",
    alzante_scorrevole: "Alzante-scorrevole",
    scorrevole: "Scorrevole",
    a_libro: "A libro / pieghevole",
    bow_window: "Bow-window",
    fisso: "Fisso",
    lucernario: "Lucernario",
    tonda_ovale: "Tonda / ovale",
  };
  return map[tipo] ?? tipo;
}
