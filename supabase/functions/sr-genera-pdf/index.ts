/**
 * Edge Function: sr-genera-pdf
 *
 * Genera l'HTML del preventivo Serramenti (3 pagine A4) e lo salva su
 * Supabase Storage. Il cliente può aprirlo nel browser e stamparlo come
 * PDF tramite Ctrl+P (CSS @page A4).
 *
 * Architettura:
 *   1. Auth + load progetto (verifica company_id)
 *   2. Load serramenti + accessori + media
 *   3. Load template_pdf azienda (branding) + consulente (profiles)
 *   4. Calcola cronoprogramma (server-side, no client)
 *   5. Render HTML self-contained
 *   6. Salva in Storage `sr-progetti/<company>/<id>/preventivo.html`
 *   7. Aggiorna sr_progetti.pdf_html_url + pdf_generated_at
 *   8. Log in sr_pdf_generation_log
 *
 * Body: { progetto_id: string }
 * Output: { ok: true, html_url, public_url, duration_ms, pages_count }
 */
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { renderSrPdfHtml, type SrPdfData } from "../_shared/srHtmlTemplate.ts";
import { generateQrSvg } from "../_shared/qrcode.ts";

interface Payload {
  progetto_id: string;
}

// ─── Cronoprogramma (duplicato server-side per non dipendere dal client) ────

interface FaseCrono { label: string; giorno_inizio: number; giorno_fine: number; emoji: string }

function generaCrono(numSerramenti: number, giorniProduzione: number, giorniCollaudo: number): FaseCrono[] {
  const giorniPosa = Math.ceil((numSerramenti || 1) * 0.8);
  const fasi: FaseCrono[] = [];
  fasi.push({ label: "Conferma ordine", giorno_inizio: 1, giorno_fine: 1, emoji: "📝" });
  const prodInizio = 2, prodFine = prodInizio + giorniProduzione - 1;
  fasi.push({ label: "Produzione", giorno_inizio: prodInizio, giorno_fine: prodFine, emoji: "🏭" });
  const soprGiorno = Math.max(prodFine - 2, prodInizio + 1);
  fasi.push({ label: "Sopralluogo pre-posa", giorno_inizio: soprGiorno, giorno_fine: soprGiorno, emoji: "📐" });
  const posaInizio = prodFine + 1, posaFine = posaInizio + giorniPosa - 1;
  fasi.push({ label: "Posa", giorno_inizio: posaInizio, giorno_fine: posaFine, emoji: "🔧" });
  fasi.push({ label: "Collaudo finale", giorno_inizio: posaFine + 1, giorno_fine: posaFine + giorniCollaudo, emoji: "✅" });
  return fasi;
}

const TIPOLOGIE_LABELS: Record<string, string> = {
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

const MATERIALI_LABELS: Record<string, string> = {
  alluminio: "Alluminio",
  pvc: "PVC",
  legno: "Legno",
  alluminio_legno: "Alluminio-legno",
  acciaio: "Acciaio",
  misto: "Misto",
};

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  const t0 = Date.now();
  // deno-lint-ignore no-explicit-any
  let supabaseAdmin: any = null;
  let userId: string | null = null;
  let payloadProgettoId: string | null = null;
  let companyId: string | null = null;

  try {
    const auth = await requireAuth(req, corsHeaders);
    userId = auth.userId;
    supabaseAdmin = auth.supabaseAdmin;

    const p = (await req.json()) as Payload;
    if (!p.progetto_id) return errorResponse("progetto_id mancante", 400, corsHeaders);
    payloadProgettoId = p.progetto_id;

    // 1. Load progetto
    const { data: prog, error: progErr } = await supabaseAdmin
      .from("sr_progetti")
      .select("*")
      .eq("id", p.progetto_id)
      .maybeSingle();
    if (progErr) throw new Error(`Errore caricamento progetto: ${progErr.message}`);
    if (!prog) return errorResponse("Progetto non trovato", 404, corsHeaders);
    companyId = prog.company_id;

    // Authz: verifica company corrente
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    const userCompanyId = (profile as { company_id?: string } | null)?.company_id ?? null;
    if (userCompanyId && prog.company_id !== userCompanyId) {
      const { data: superRoles } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin");
      if (!superRoles || superRoles.length === 0) {
        return errorResponse("Non autorizzato per questo progetto", 403, corsHeaders);
      }
    }

    // 2. Load BOM
    const [{ data: serramenti }, { data: accessori }, { data: media }, { data: template }, { data: company }] =
      await Promise.all([
        supabaseAdmin.from("sr_serramenti_progetto").select("*").eq("progetto_id", p.progetto_id).order("position"),
        supabaseAdmin.from("sr_accessori_progetto").select("*").eq("progetto_id", p.progetto_id).order("position"),
        supabaseAdmin.from("sr_progetti_media").select("*").eq("progetto_id", p.progetto_id).order("position"),
        supabaseAdmin.from("sr_template_pdf").select("*").eq("company_id", prog.company_id).maybeSingle(),
        supabaseAdmin.from("companies").select("name, ragione_sociale, indirizzo, telefono, email, partita_iva, logo_url").eq("id", prog.company_id).maybeSingle(),
      ]);

    // 2b. Scheda tecnica dinamica: per ogni serramento → family_id → article_families
    // (custom_field_values + categoria_id) → listino_categorie (macrocategoria_id)
    // → listino_macrocategoria_fields (con show_in_pdf=true) → array di {label,value,unit}.
    // Tutto best-effort: se un lookup fallisce, il serramento appare senza specs.
    //
    // deno-lint-ignore no-explicit-any
    type FamilyRow = { id: string; categoria_id: string | null; custom_field_values: Record<string, any> | null };
    // deno-lint-ignore no-explicit-any
    type FieldRow = {
      macrocategoria_id: string; field_key: string; field_label: string;
      field_type: string; field_unit: string | null;
      field_options: Array<{ value: string; label: string }> | null;
      show_in_pdf: boolean; sort_order: number;
    };
    const familyIds = Array.from(new Set(
      ((serramenti ?? []) as Array<{ family_id?: string | null }>).map((s) => s.family_id).filter((v): v is string => !!v),
    ));
    const familyById = new Map<string, FamilyRow>();
    const fieldsByMacro = new Map<string, FieldRow[]>();
    const categoriaToMacro = new Map<string, string>();

    if (familyIds.length > 0) {
      const { data: famRows } = await supabaseAdmin
        .from("article_families")
        .select("id, categoria_id, custom_field_values")
        .in("id", familyIds);
      ((famRows ?? []) as FamilyRow[]).forEach((f) => familyById.set(f.id, f));

      const categoriaIds = Array.from(new Set(
        ((famRows ?? []) as FamilyRow[]).map((f) => f.categoria_id).filter((v): v is string => !!v),
      ));
      if (categoriaIds.length > 0) {
        const { data: catRows } = await supabaseAdmin
          .from("listino_categorie")
          .select("id, macrocategoria_id")
          .in("id", categoriaIds);
        ((catRows ?? []) as Array<{ id: string; macrocategoria_id: string | null }>).forEach((c) => {
          if (c.macrocategoria_id) categoriaToMacro.set(c.id, c.macrocategoria_id);
        });

        const macroIds = Array.from(new Set(Array.from(categoriaToMacro.values())));
        if (macroIds.length > 0) {
          const { data: fieldRows } = await supabaseAdmin
            .from("listino_macrocategoria_fields")
            .select("macrocategoria_id, field_key, field_label, field_type, field_unit, field_options, show_in_pdf, sort_order")
            .in("macrocategoria_id", macroIds)
            .eq("show_in_pdf", true)
            .order("sort_order", { ascending: true });
          ((fieldRows ?? []) as FieldRow[]).forEach((f) => {
            const arr = fieldsByMacro.get(f.macrocategoria_id) ?? [];
            arr.push(f);
            fieldsByMacro.set(f.macrocategoria_id, arr);
          });
        }
      }
    }

    // Costruisce le specs tecniche stringa-formato per un serramento dato il
    // suo family_id (best effort: empty array se manca qualche tassello).
    const buildSpecsTecniche = (
      familyId: string | null | undefined,
    ): Array<{ label: string; value: string; unit: string | null }> => {
      if (!familyId) return [];
      const fam = familyById.get(familyId);
      if (!fam) return [];
      const values = (fam.custom_field_values ?? {}) as Record<string, unknown>;
      if (Object.keys(values).length === 0) return [];
      const macroId = fam.categoria_id ? categoriaToMacro.get(fam.categoria_id) : undefined;
      if (!macroId) return [];
      const fields = fieldsByMacro.get(macroId) ?? [];
      const out: Array<{ label: string; value: string; unit: string | null }> = [];
      for (const f of fields) {
        const raw = values[f.field_key];
        if (raw === undefined || raw === null || raw === "") continue;
        let display: string;
        if (f.field_type === "select" && typeof raw === "string") {
          display = f.field_options?.find((o) => o.value === raw)?.label ?? raw;
        } else if (f.field_type === "multiselect" && Array.isArray(raw)) {
          display = (raw as string[])
            .map((v) => f.field_options?.find((o) => o.value === v)?.label ?? v)
            .join(", ");
        } else if (f.field_type === "boolean") {
          display = raw ? "Sì" : "No";
        } else {
          display = String(raw);
        }
        out.push({ label: f.field_label, value: display, unit: f.field_unit });
      }
      return out;
    };

    // 2c. Pagine dedicate macrocategoria: l'azienda può configurare alcune
    // macro con `mostra_pagina_dedicata_pdf=true` per dare risalto a linee
    // premium (foto + storytelling). Inseriamo una pagina dedicata per
    // ciascuna macro coinvolta nel BOM, in ordine di prima occorrenza.
    type MacroPagina = {
      macro_id: string;
      nome: string;
      descrizione_estesa: string;
      immagine_url: string | null;
    };
    let macroPagineDedicate: MacroPagina[] = [];
    // Ordine di apparizione: usiamo le family_ids già raccolte (ordine BOM).
    const macroIdsInBom: string[] = [];
    const seenMacroIds = new Set<string>();
    for (const fId of familyIds) {
      const fam = familyById.get(fId);
      const macroId = fam?.categoria_id ? categoriaToMacro.get(fam.categoria_id) : undefined;
      if (macroId && !seenMacroIds.has(macroId)) {
        seenMacroIds.add(macroId);
        macroIdsInBom.push(macroId);
      }
    }
    if (macroIdsInBom.length > 0) {
      // deno-lint-ignore no-explicit-any
      const { data: macroRows } = await (supabaseAdmin as any)
        .from("listino_macrocategorie")
        .select("id, nome, descrizione, descrizione_estesa, immagine_url, mostra_pagina_dedicata_pdf")
        .in("id", macroIdsInBom)
        .eq("mostra_pagina_dedicata_pdf", true);
      const macroById = new Map<string, MacroPagina>();
      ((macroRows ?? []) as Array<{
        id: string; nome: string; descrizione: string | null;
        descrizione_estesa: string | null; immagine_url: string | null;
      }>).forEach((m) => {
        const desc = (m.descrizione_estesa ?? m.descrizione ?? "").trim();
        if (!desc) return; // niente testo → niente pagina
        macroById.set(m.id, {
          macro_id: m.id,
          nome: m.nome,
          descrizione_estesa: desc,
          immagine_url: m.immagine_url,
        });
      });
      macroPagineDedicate = macroIdsInBom
        .filter((id) => macroById.has(id))
        .map((id) => macroById.get(id)!);
    }

    // 3. Consulente
    let consulente: { nome: string; ruolo: string | null; telefono: string | null; email: string | null; foto: string | null } | null = null;
    if (prog.consulente_id) {
      const { data: cons } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name, email, phone, role_interno, photo_url")
        .eq("id", prog.consulente_id)
        .maybeSingle();
      if (cons) {
        consulente = {
          nome: [cons.first_name, cons.last_name].filter(Boolean).join(" ") || "Consulente",
          ruolo: cons.role_interno || "Consulente tecnico",
          telefono: cons.phone,
          email: cons.email,
          foto: cons.photo_url,
        };
      }
    }

    // 4. Cronoprogramma
    const numSerr = (serramenti ?? []).reduce((acc: number, s: { quantita?: number }) => acc + (s.quantita ?? 1), 0);
    const cronoFasi = generaCrono(numSerr, prog.crono_giorni_produzione ?? 30, prog.crono_giorni_collaudo ?? 1);
    const cronoDurata = Math.max(...cronoFasi.map((f) => f.giorno_fine));

    // 4b. Render + foto cantiere. Rinfresca signed URL su TUTTI i media
    // (precedente: solo render). Bug fix: i link nel PDF non scadono dopo
    // 7 giorni perché ogni generazione PDF rigenera URL freschi.
    type MediaRow = {
      id: string; kind: string; storage_path: string; url: string | null;
      caption: string | null; position: number;
    };

    const refreshMediaUrl = async (m: MediaRow): Promise<string> => {
      // Sentinel "render-session:<id>:<idx>" → URL del render esterno, non
      // un file nel bucket sr-progetti. Conserviamo l'URL così com'è.
      if (!m.storage_path || m.storage_path.startsWith("render-session:")) {
        return m.url ?? "";
      }
      try {
        const { data: signed, error: e } = await supabaseAdmin.storage
          .from("sr-progetti")
          .createSignedUrl(m.storage_path, 60 * 60 * 24 * 7);
        if (e) {
          console.warn("[sr-genera-pdf] signed url refresh failed", m.storage_path, e.message);
          return m.url ?? "";
        }
        return signed?.signedUrl ?? m.url ?? "";
      } catch (err) {
        console.warn("[sr-genera-pdf] signed url refresh exception", m.storage_path, err);
        return m.url ?? "";
      }
    };

    const mediaRows = (media ?? []) as MediaRow[];

    // Render foto-realistici (max 4 nel PDF)
    const renderRows = mediaRows.filter((m) => m.kind === "render");
    const renders = await Promise.all(renderRows.slice(0, 4).map(async (m) => ({
      url: await refreshMediaUrl(m),
      caption: m.caption,
    })));

    // 4c. Public URL + QR code
    const appOrigin = Deno.env.get("APP_PUBLIC_URL") ?? "https://app.ediliziaincloud.it";
    const publicUrl = prog.public_token ? `${appOrigin}/stima/${prog.public_token}` : null;
    const qrSvg = publicUrl ? generateQrSvg(publicUrl, { size: 200, margin: 1, color: "#2D7D5C" }) : null;

    // 5. Costruisci payload template
    // deno-lint-ignore no-explicit-any
    const tpl = (template ?? {}) as any;
    // deno-lint-ignore no-explicit-any
    const com = (company ?? {}) as any;

    const finPianiInput = (prog.fin_piani && Array.isArray(prog.fin_piani) ? prog.fin_piani : []) as Array<{
      nome: string; mesi: number; tasso: number; rata_mese: number; anticipo?: number; finanziato?: number;
    }>;
    const importoMedio = ((Number(prog.totale_min) || 0) + (Number(prog.totale_max) || 0)) / 2;
    const anticipoEur = importoMedio * ((Number(prog.fin_anticipo_pct) || 0) / 100);
    const finanziatoEur = importoMedio - anticipoEur;

    const data: SrPdfData = {
      code: prog.code,
      data_emissione: prog.created_at,
      cliente_nome: prog.cliente_nome ?? "",
      cliente_cognome: prog.cliente_cognome ?? "",
      cliente_indirizzo: prog.cliente_indirizzo,
      cliente_telefono: prog.cliente_telefono,
      cliente_email: prog.cliente_email,
      cliente_citta: prog.cliente_citta,
      cantiere_citta: prog.cantiere_citta,
      totale_serramenti: numSerr,
      totale_accessori: (accessori ?? []).reduce((acc: number, a: { quantita?: number }) => acc + (a.quantita ?? 1), 0),
      tipo_intervento: prog.tipo_intervento,
      intervento_titolo: prog.intervento_titolo || `Per ${prog.cliente_nome ?? ""}`,
      intervento_sintesi: prog.intervento_sintesi,
      materiale_principale: prog.materiale_principale,
      esigenze: (Array.isArray(prog.esigenze) && prog.esigenze.length > 0)
        ? prog.esigenze
        : (Array.isArray(tpl.esigenze_default) ? tpl.esigenze_default : []),
      soluzione: (Array.isArray(prog.soluzione) && prog.soluzione.length > 0)
        ? prog.soluzione
        : (Array.isArray(tpl.soluzione_default) ? tpl.soluzione_default : []),
      perche_noi: (Array.isArray(prog.perche_noi) && prog.perche_noi.length > 0)
        ? prog.perche_noi
        : (Array.isArray(tpl.perche_noi_default) ? tpl.perche_noi_default : []),
      incluso_investimento: (Array.isArray(prog.incluso_investimento) && prog.incluso_investimento.length > 0)
        ? prog.incluso_investimento
        : (Array.isArray(tpl.incluso_default) ? tpl.incluso_default : []),
      testimonianze: (Array.isArray(prog.testimonianze) && prog.testimonianze.length > 0)
        ? prog.testimonianze
        : (Array.isArray(tpl.testimonianze_default) ? tpl.testimonianze_default : []),
      prossimi_passi: (Array.isArray(prog.prossimi_passi) && prog.prossimi_passi.length > 0)
        ? prog.prossimi_passi
        : (Array.isArray(tpl.prossimi_passi_default) ? tpl.prossimi_passi_default : []),
      totale_min: Number(prog.totale_min) || 0,
      totale_max: Number(prog.totale_max) || 0,
      iva_inclusa: !!prog.iva_inclusa,
      fin_anticipo_pct: Number(prog.fin_anticipo_pct) || 0,
      fin_anticipo_eur: anticipoEur,
      fin_finanziato_eur: finanziatoEur,
      fin_piani: finPianiInput.map((p) => ({
        nome: p.nome, mesi: p.mesi, tasso: p.tasso, rata_mese: p.rata_mese,
      })),
      risparmio_eur_anno: prog.risparmio_eur_anno != null ? Number(prog.risparmio_eur_anno) : null,
      detrazione_aliquota: prog.detrazione_aliquota != null ? Number(prog.detrazione_aliquota) : null,
      detrazione_eur_totale: prog.detrazione_eur_totale != null ? Number(prog.detrazione_eur_totale) : null,
      detrazione_eur_anno: prog.detrazione_eur_anno != null ? Number(prog.detrazione_eur_anno) : null,
      payback_anni: prog.payback_anni != null ? Number(prog.payback_anni) : null,
      co2_risparmiata_t_anno: prog.co2_risparmiata_t_anno != null ? Number(prog.co2_risparmiata_t_anno) : null,
      cashflow: null,
      serramenti: (serramenti ?? []).map((s: {
        tipologia: string; tipologia_label?: string | null;
        materiale?: string | null; serie?: string | null; vetro?: string | null;
        larghezza_mm?: number | null; altezza_mm?: number | null; quantita?: number;
        family_id?: string | null;
      }) => ({
        tipologia_label: s.tipologia_label || TIPOLOGIE_LABELS[s.tipologia] || s.tipologia,
        materiale: s.materiale ? (MATERIALI_LABELS[s.materiale] ?? s.materiale) : null,
        serie: s.serie,
        vetro: s.vetro,
        larghezza_mm: s.larghezza_mm ?? null,
        altezza_mm: s.altezza_mm ?? null,
        quantita: s.quantita ?? 1,
        // Scheda tecnica dinamica (campi show_in_pdf=true della macro)
        specs_tecniche: buildSpecsTecniche(s.family_id),
      })),
      // Pagine dedicate macrocategoria (storytelling premium): array di
      // {macro_id, nome, descrizione_estesa, immagine_url}. Vuoto se nessuna.
      macro_pagine_dedicate: macroPagineDedicate,
      accessori: (accessori ?? []).map((a: { tipo: string; descrizione?: string | null; quantita?: number }) => ({
        tipo: a.tipo,
        descrizione: a.descrizione,
        quantita: a.quantita ?? 1,
      })),
      consulenza_at: prog.consulenza_at,
      consulenza_luogo: prog.consulenza_luogo,
      consulente_nome: consulente?.nome ?? null,
      consulente_ruolo: consulente?.ruolo ?? null,
      consulente_telefono: consulente?.telefono ?? null,
      consulente_email: consulente?.email ?? null,
      consulente_foto_url: consulente?.foto ?? null,
      crono_fasi: cronoFasi,
      crono_durata_giorni: cronoDurata,
      public_url: publicUrl,
      qr_svg: qrSvg,
      renders,
      valido_fino_giorni: prog.valido_fino_giorni ?? 15,
      azienda_nome: tpl.ragione_sociale || com.ragione_sociale || com.name || "Azienda",
      azienda_indirizzo: tpl.indirizzo_completo || com.indirizzo,
      azienda_telefono: tpl.telefono || com.telefono,
      azienda_email: tpl.email || com.email,
      azienda_partita_iva: tpl.partita_iva || com.partita_iva,
      azienda_logo_url: tpl.logo_url || com.logo_url,
      colore_primario: tpl.colore_primario || "#2D7D5C",
    };

    // 6b. Rigenera signed URL del logo se proviene dal bucket sr-progetti
    // (path template-logos/...). Anche il logo scade dopo 1 anno, ma se
    // l'azienda lo carica oggi e genera PDF tra 2 anni, l'URL sarebbe morto.
    if (data.azienda_logo_url) {
      try {
        const url = new URL(data.azienda_logo_url);
        // Path tipo /storage/v1/object/sign/sr-progetti/<company>/template-logos/<file>
        const match = url.pathname.match(/sr-progetti\/(.+)/);
        if (match) {
          const logoPath = decodeURIComponent(match[1]).split("?")[0];
          const { data: signed } = await supabaseAdmin.storage
            .from("sr-progetti")
            .createSignedUrl(logoPath, 60 * 60 * 24 * 365);
          if (signed?.signedUrl) data.azienda_logo_url = signed.signedUrl;
        }
      } catch (err) {
        console.warn("[sr-genera-pdf] logo refresh failed", err);
      }
    }

    // 6. Render HTML
    const html = renderSrPdfHtml(data);
    const htmlBytes = new TextEncoder().encode(html);

    // 7. Salva su Storage
    const storagePath = `${prog.company_id}/${prog.id}/preventivo.html`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("sr-progetti")
      .upload(storagePath, htmlBytes, {
        contentType: "text/html; charset=utf-8",
        upsert: true,
        cacheControl: "no-cache",
      });
    if (uploadErr) throw new Error(`Errore upload HTML: ${uploadErr.message}`);

    // 8. URL firmato (7 giorni)
    const { data: signed } = await supabaseAdmin.storage
      .from("sr-progetti")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    const htmlUrl = signed?.signedUrl ?? "";

    // 9. Aggiorna progetto
    await supabaseAdmin.from("sr_progetti").update({
      pdf_html_url: htmlUrl,
      pdf_generated_at: new Date().toISOString(),
      public_url: publicUrl,
      stato: prog.stato === "bozza" ? "da_consegnare" : prog.stato,
    }).eq("id", prog.id);

    // 10. Log
    const duration_ms = Date.now() - t0;
    await supabaseAdmin.from("sr_pdf_generation_log").insert({
      progetto_id: prog.id,
      company_id: prog.company_id,
      user_id: userId,
      variant: "vendita",
      status: "success",
      html_url: htmlUrl,
      duration_ms,
      pages_count: 3,
    });

    return jsonResponse(
      { ok: true, html_url: htmlUrl, public_url: publicUrl, duration_ms, pages_count: 3 },
      200, corsHeaders,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sr-genera-pdf] error", msg);
    if (supabaseAdmin && payloadProgettoId && companyId) {
      try {
        await supabaseAdmin.from("sr_pdf_generation_log").insert({
          progetto_id: payloadProgettoId,
          company_id: companyId,
          user_id: userId,
          variant: "vendita",
          status: "error",
          error_message: msg,
          duration_ms: Date.now() - t0,
        });
      } catch { /* swallow */ }
    }
    return errorResponse(msg, 500, corsHeaders);
  }
});
