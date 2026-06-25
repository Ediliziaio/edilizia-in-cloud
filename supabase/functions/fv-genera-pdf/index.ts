/**
 * Edge Function: fv-genera-pdf v2 (Reonic-killer)
 *
 * Genera l'HTML completo del preventivo Fotovoltaico v2 (pagine
 * professionali) e lo salva in Supabase Storage. Il client può quindi
 * aprirlo nel browser e stamparlo come PDF tramite Ctrl+P (CSS @page A4
 * + print-color-adjust:exact garantiscono fedeltà 1:1 al riferimento).
 *
 * Architettura:
 *   - Recupera dati progetto + componenti + manodopera + servizi + calcolo
 *     finanziario + dati azienda + venditore (fully-typed)
 *   - Calcola energy flows + costi 20 anni + CO2 + bolletta prima/dopo
 *   - Renderizza il template HTML configurabile con SVG inline
 *   - Salva in storage `fv-progetti/<company>/<id>/preventivo.html`
 *   - Aggiorna progetto.pdf_vendita_url con il path
 *   - Logga in fv_pdf_generation_log per audit
 *
 * Body: { progetto_id: string, tipo: 'vendita' | 'tecnico' | 'mobile' }
 *   tipo='vendita' → HTML completo configurabile (default)
 *   tipo='tecnico' → mantenuto per back-compat (genera anche lui HTML)
 *   tipo='mobile'  → idem
 *
 * Output: { url, size_bytes, pages_count, duration_ms, format: 'html' }
 *
 * Redeploy-marker: questa function include `_shared/fvHtmlTemplate.ts`
 * (cover PDF con preset 1-click + layout: posizione verticale testo, font,
 * overlay style, decorazione). La CI rileva i cambi solo nella dir propria
 * della function ed ESCLUDE `_shared/`: quando cambia solo il template
 * condiviso, basta un bump qui per far ridistribuire la function dal sorgente.
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import {
  getFvPdfRenderedPagesCount,
  renderFvPdfHtml,
  type FvPdfTemplateData,
} from "../_shared/fvHtmlTemplate.ts";
import { calcolaEnergyFlows } from "../_shared/fvCalcoli.ts";
import {
  assertFvPdfQueryOk,
  mapFvManodoperaRowsToPdfServices,
  safeFvPdfStorageSegment,
} from "../_shared/fvPdfGenerationUtils.ts";

interface Payload {
  progetto_id: string;
  tipo?: "vendita" | "tecnico" | "mobile";
  /** Layout reale pannelli (coordinate Google Solar API) — opzionale; passato dal
   *  wizard per la vista zenitale reale nel PDF. Se assente, si usa il mock. */
  layout_pannelli?: Array<{
    centro_lat: number;
    centro_lng: number;
    orientamento?: "LANDSCAPE" | "PORTRAIT";
    segment_index?: number;
  }> | null;
  /** Orientamento prevalente reale (etichetta "SE 152°") + inclinazione falda. */
  azimut?: string | null;
  inclinazione_tetto?: number | null;
}

type FvListinoMacroForPdf =
  NonNullable<NonNullable<FvPdfTemplateData["template"]>["listino_macrocategorie_fv"]>[number] & {
    verticali_abilitati?: string[] | null;
  };

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  const t0 = Date.now();
  // deno-lint-ignore no-explicit-any
  let supabaseAdmin: any = null;
  let userId: string | null = null;
  let payloadProgettoId: string | null = null;
  let payloadTipo: string = "vendita";

  try {
    const auth = await requireAuth(req, corsHeaders);
    userId = auth.userId;
    supabaseAdmin = auth.supabaseAdmin;

    const p = (await req.json()) as Payload;
    if (!p.progetto_id) return errorResponse("progetto_id mancante", 400, corsHeaders);
    payloadProgettoId = p.progetto_id;
    payloadTipo = p.tipo ?? "vendita";
    if (!["vendita", "tecnico", "mobile"].includes(payloadTipo)) {
      return errorResponse("tipo non valido", 400, corsHeaders);
    }

    // ── Caricamento dati ──────────────────────────────────────────────────
    // Step 1: progetto (per ottenere company_id)
    // Sprint 4: include finanziamento_* columns per PDF rata reale
    const { data: prog, error: progErr } = await supabaseAdmin
      .from("fv_progetti")
      .select(
        "id, company_id, numero, titolo, archetipo, indirizzo, comune, provincia, cap, latitudine, longitudine, tipologia_immobile, prima_casa, consumo_annuo_kwh, costo_kwh_attuale, profilo_consumo, fonte_dati_tetto, qualita_dati_tetto, imagery_date, ore_sole_annue, superficie_tetto_disponibile_mq, perdita_ombreggiamento_pct, numero_pannelli_scelti, potenza_kwp, con_accumulo, capacita_accumulo_kwh, prezzo_vendita_iva_inclusa, payback_anni, npv_25_anni, risparmio_anno1, created_at, created_by, scenario_finanziamento, finanziamento_tabella_id, finanziamento_durata_mesi, finanziamento_rata_eur, finanziamento_taeg, finanziamento_tan, finanziamento_totale_dovuto_eur",
      )
      .eq("id", p.progetto_id)
      .maybeSingle();
    if (progErr) throw new Error(`Errore caricamento progetto: ${progErr.message}`);
    if (!prog) return errorResponse("Progetto non trovato", 404, corsHeaders);

    // EDGE Sprint 3 fix: verifica autorizzazione esplicita oltre RLS.
    // Difesa in profondità: anche se service-role bypassa RLS, qui filtriamo a
    // livello applicativo che l'utente appartenga alla company del progetto.
    // FAIL-CLOSED: requireCompanyAccess lancia un Response 403 se la company
    // dell'utente non corrisponde a prog.company_id (super_admin, profilo
    // primario e multi_company_access esclusi). Il throw viene intercettato dal
    // catch sottostante che ri-emette la Response.
    await requireCompanyAccess(supabaseAdmin, userId, prog.company_id, corsHeaders);

    // Step 2: dati correlati in parallelo (filtrati per company_id corretto)
    const [calcRes, compRes, manodRes, servRes, companyRes, templateRes, macroRes] = await Promise.all([
      supabaseAdmin
        .from("fv_calcolo_finanziario")
        .select("scenario_completo, cassa_anno_per_anno, payback_anni, risparmio_anno1_eur, risparmio_25_anni_eur, npv_25_anni_eur, detrazione_anno_eur")
        .eq("progetto_id", p.progetto_id)
        .eq("attivo", true)
        .maybeSingle(),
      supabaseAdmin
        .from("fv_componenti_progetto")
        .select("articolo_id, categoria, descrizione, marca, modello, quantita, potenza_unitaria_w, capacita_kwh, garanzia_anni, prezzo_unitario_vendita")
        .eq("progetto_id", p.progetto_id)
        .order("ordinamento"),
      supabaseAdmin
        .from("fv_manodopera_progetto")
        .select("descrizione, ore, tariffa_oraria_vendita")
        .eq("progetto_id", p.progetto_id),
      supabaseAdmin
        .from("fv_servizi_progetto")
        .select("tipo, descrizione, quantita, prezzo_vendita, note_operative")
        .eq("progetto_id", p.progetto_id),
      supabaseAdmin
        .from("companies")
        .select("name, vat_number, pec, phone, email, website")
        .eq("id", prog.company_id)
        .maybeSingle(),
      supabaseAdmin
        .from("fv_template_pdf")
        .select("*")
        .eq("company_id", prog.company_id)
        .maybeSingle(),
      supabaseAdmin
        .from("listino_macrocategorie")
        .select("id, nome, descrizione, descrizione_estesa, immagine_url, categoria_tipo, mostra_pagina_dedicata_pdf, verticali_abilitati")
        .eq("company_id", prog.company_id)
        .eq("attivo", true)
        .order("sort_order", { ascending: true })
        .order("nome", { ascending: true }),
    ]);

    assertFvPdfQueryOk("calcolo finanziario", calcRes);
    assertFvPdfQueryOk("componenti progetto", compRes);
    assertFvPdfQueryOk("manodopera progetto", manodRes);
    assertFvPdfQueryOk("servizi progetto", servRes);
    assertFvPdfQueryOk("azienda", companyRes);
    assertFvPdfQueryOk("template PDF", templateRes);
    assertFvPdfQueryOk("macrocategorie listino", macroRes);

    const calc = calcRes.data;
    const company = companyRes.data ?? { name: "Edilizia in Cloud" };
    const template = templateRes.data ?? {};
    const listinoMacrocategorieFv = ((macroRes.data ?? []) as FvListinoMacroForPdf[]).filter((macro) => {
      const verticali = macro.verticali_abilitati ?? [];
      return verticali.length === 0 || verticali.includes("fotovoltaico");
    });
    const validoGiorni = Number(template.scadenza_validita_preventivo_giorni) || 30;
    const componentRows = (compRes.data ?? []) as Array<Record<string, unknown>>;
    const articoloIds = Array.from(
      new Set(
        componentRows
          .map((row) => firstString(row.articolo_id))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const articoloRowsRes = articoloIds.length > 0
      ? await supabaseAdmin
        .from("articoli_native")
        .select("*")
        .in("id", articoloIds)
      : { data: [], error: null };
    assertFvPdfQueryOk("articoli componenti", articoloRowsRes);
    const articoliById = new Map<string, Record<string, unknown>>(
      ((articoloRowsRes.data ?? []) as Array<Record<string, unknown>>)
        .map((row) => [String(row.id), row]),
    );

    // Recupera nome venditore (chi ha creato il progetto)
    let venditoreNome: string | null = null;
    if (prog.created_by) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", prog.created_by)
        .maybeSingle();
      if (profile) {
        venditoreNome = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
      }
    }

    // ── Calcoli aggregati ──────────────────────────────────────────────────
    const flows = calcolaEnergyFlows({
      potenza_kwp: Number(prog.potenza_kwp) || 0,
      has_accumulo: prog.con_accumulo ?? false,
      capacita_accumulo_kwh: Number(prog.capacita_accumulo_kwh) || 0,
      consumo_annuo_kwh: Number(prog.consumo_annuo_kwh) || 0,
      ore_sole_annue: Number(prog.ore_sole_annue) || null,
      profilo_consumo: prog.profilo_consumo ?? "misto",
      perdita_ombreggiamento_pct: Number(prog.perdita_ombreggiamento_pct) || 0,
    });

    // Detrazione: 50% se prima_casa, 36% altrimenti, plafond 96.000€
    const detrazionePerc = prog.prima_casa ? 50 : 36;
    const baseDetrazione = Math.min(96000, Number(prog.prezzo_vendita_iva_inclusa) || 0);
    const detrazioneTotale = (baseDetrazione * detrazionePerc) / 100;
    const costoNetto = (Number(prog.prezzo_vendita_iva_inclusa) || 0) - detrazioneTotale;

    // Cassa cumulata: se non disponibile, generiamo proiezione semplice
    let cassaAnni: Array<{ anno: number; cumulato: number }> = [];
    if (Array.isArray(calc?.cassa_anno_per_anno) && (calc!.cassa_anno_per_anno as Array<unknown>).length > 0) {
      cassaAnni = calc!.cassa_anno_per_anno as Array<{ anno: number; cumulato: number }>;
    } else {
      // Fallback: proiezione semplice
      const investimento = Number(prog.prezzo_vendita_iva_inclusa) || 0;
      const risparmioAnno = Number(prog.risparmio_anno1) || 1500;
      const detrazioneAnno = detrazioneTotale / 10;
      let cum = -investimento;
      cassaAnni.push({ anno: 0, cumulato: cum });
      for (let i = 1; i <= 25; i++) {
        const dettaglio = i <= 10 ? detrazioneAnno : 0;
        cum += risparmioAnno * Math.pow(1.03, i - 1) * Math.pow(0.995, i - 1) + dettaglio;
        cassaAnni.push({ anno: i, cumulato: Math.round(cum) });
      }
    }

    const risparmio25 = Number(prog.npv_25_anni) || cassaAnni[cassaAnni.length - 1]?.cumulato || 0;
    const risparmioAnno1 = Number(prog.risparmio_anno1) || 0;
    const risparmioMensile = Math.round(risparmioAnno1 / 12);

    // Sprint 4: estrazione finanziamento autoritativo dai campi salvati
    // su fv_progetti (lookup tabelle reali). Fallback su scenario_completo
    // legacy se i nuovi campi non sono popolati (back-compat con progetti
    // creati prima di Sprint 4).
    interface FinanziamentoLite {
      finanziaria?: string;
      durata_mesi?: number;
      rata_mensile?: number;
      tan_perc?: number;
      taeg_perc?: number;
      importo_finanziato?: number;
    }
    let finanziamento: {
      finanziaria: string;
      durata_mesi: number;
      rata_mensile: number;
      tan_perc: number;
      taeg_perc: number;
      importo_finanziato: number;
    } | null = null;
    const scenarioFinMode = (prog.scenario_finanziamento as string | null) ?? "rate";
    if (scenarioFinMode !== "cash" && Number(prog.finanziamento_rata_eur) > 0) {
      // Path Sprint 4: dati reali dal lookup eic_tabelle_finanziamento_righe
      // Recupero nome finanziaria via join (best-effort, fallback "Finanziaria")
      let nomeFinanziaria = "Finanziaria";
      if (prog.finanziamento_tabella_id) {
        const { data: tab } = await supabaseAdmin
          .from("eic_tabelle_finanziamento")
          .select("nome_prodotto, eic_finanziarie!inner(nome)")
          .eq("id", prog.finanziamento_tabella_id)
          .maybeSingle();
        if (tab) {
          const fNome = (tab as { eic_finanziarie?: { nome?: string } }).eic_finanziarie?.nome;
          const prodotto = (tab as { nome_prodotto?: string }).nome_prodotto;
          nomeFinanziaria = [fNome, prodotto].filter(Boolean).join(" ") || "Finanziaria";
        }
      } else if (scenarioFinMode === "zero") {
        nomeFinanziaria = "Tasso zero";
      } else if (scenarioFinMode === "noleggio") {
        nomeFinanziaria = "Noleggio operativo FV";
      }
      finanziamento = {
        finanziaria: nomeFinanziaria,
        durata_mesi: Number(prog.finanziamento_durata_mesi) || 84,
        rata_mensile: Number(prog.finanziamento_rata_eur),
        tan_perc: Number(prog.finanziamento_tan ?? 0),
        taeg_perc: Number(prog.finanziamento_taeg ?? 0),
        importo_finanziato:
          Number(prog.finanziamento_totale_dovuto_eur) ||
          Number(prog.prezzo_vendita_iva_inclusa) ||
          0,
      };
    } else if (scenarioFinMode !== "cash") {
      // Fallback legacy: scenario_completo (Sprint 1/2)
      const scenarioFin = (
        calc?.scenario_completo as { finanziamento?: FinanziamentoLite } | undefined
      )?.finanziamento;
      if (scenarioFin) {
        finanziamento = {
          finanziaria: scenarioFin.finanziaria ?? "Finanziaria",
          durata_mesi: scenarioFin.durata_mesi ?? 84,
          rata_mensile:
            scenarioFin.rata_mensile ??
            Math.round(((Number(prog.prezzo_vendita_iva_inclusa) || 0) * 1.2) / 84),
          tan_perc: scenarioFin.tan_perc ?? 4.75,
          taeg_perc: scenarioFin.taeg_perc ?? 5.4,
          importo_finanziato:
            scenarioFin.importo_finanziato ?? (Number(prog.prezzo_vendita_iva_inclusa) || 0),
        };
      }
    }
    // Se cash o niente dati, finanziamento resta null (template gestisce)

    // ── Estrazione cliente da titolo (in W1 cliente_id non sempre popolato) ─
    const titoloParts = (prog.titolo ?? "").trim().split(/\s+/);
    const clienteNome = titoloParts[0] ?? "";
    const clienteCognome = titoloParts.slice(1).join(" ") || "";

    // ── Costruzione data context ──────────────────────────────────────────
    const data: FvPdfTemplateData = {
      azienda: {
        name: company.name ?? "Edilizia in Cloud",
        tagline: "Specialisti fotovoltaico residenziale",
        vat_number: company.vat_number,
        pec: company.pec,
        phone: template.contatto_telefono ?? company.phone,
        email: template.contatto_email ?? company.email,
        website: template.url_sito ?? company.website,
      },
      cliente: {
        nome: clienteNome,
        cognome: clienteCognome,
        cf: null,
        indirizzo: prog.indirizzo ?? "",
        comune: prog.comune,
        cap: prog.cap,
        provincia: prog.provincia,
        tipologia_immobile: prog.tipologia_immobile === "residenziale" ? "Villa singola" : (prog.tipologia_immobile ?? null),
      },
      progetto: {
        numero: prog.numero ?? "",
        titolo: prog.titolo ?? "",
        creato_il: prog.created_at,
        valido_giorni: validoGiorni,
        venditore: venditoreNome,
        potenza_kwp: Number(prog.potenza_kwp) || 0,
        numero_pannelli: Number(prog.numero_pannelli_scelti) || 0,
        layout_pannelli: p.layout_pannelli ?? null,
        has_accumulo: prog.con_accumulo ?? false,
        capacita_accumulo_kwh: Number(prog.capacita_accumulo_kwh) || 0,
        consumo_annuo_kwh: Number(prog.consumo_annuo_kwh) || 0,
        costo_kwh_attuale: Number(prog.costo_kwh_attuale) || 0.32,
        profilo_consumo: prog.profilo_consumo,
        fonte_dati_tetto: prog.fonte_dati_tetto ?? null,
        qualita_dati_tetto: prog.qualita_dati_tetto ?? null,
        imagery_date: prog.imagery_date ?? null,
        tetto_mock: String(prog.qualita_dati_tetto ?? "").toLowerCase() === "mock",
        ore_sole_annue: Number(prog.ore_sole_annue) || null,
        superficie_tetto_disponibile_mq: Number(prog.superficie_tetto_disponibile_mq) || null,
        azimut: p.azimut ?? null,
        inclinazione_tetto: p.inclinazione_tetto ?? null,
      },
      costi: {
        prezzo_vendita_iva_inclusa: Number(prog.prezzo_vendita_iva_inclusa) || 0,
        iva_perc: 10,
        detrazione_eur: Math.round(detrazioneTotale),
        detrazione_perc: detrazionePerc,
        costo_netto_dopo_detrazione: Math.round(costoNetto),
      },
      finanziamento,
      scenario: {
        risparmio_mensile_eur: risparmioMensile,
        risparmio_anno1_eur: Math.round(risparmioAnno1),
        risparmio_25_anni_eur: Math.round(risparmio25),
        payback_anni: Number(prog.payback_anni) || null,
        npv_25_anni: Number(prog.npv_25_anni) || 0,
        cassa_anno_per_anno: cassaAnni,
      },
      flows,
      componenti: componentRows.map((c: Record<string, unknown>) => {
        const articoloId = firstString(c.articolo_id);
        const articolo = articoloId ? articoliById.get(articoloId) ?? null : null;
        return {
          articolo_id: articoloId,
          categoria: String(c.categoria ?? ""),
          descrizione: String(c.descrizione ?? ""),
          marca: firstString(c.marca, articolo?.marca_fv),
          modello: firstString(c.modello, articolo?.modello_fv, articolo?.descrizione),
          quantita: Number(c.quantita) || 1,
          potenza_w: c.potenza_unitaria_w ? Number(c.potenza_unitaria_w) : null,
          capacita_kwh: c.capacita_kwh ? Number(c.capacita_kwh) : null,
          garanzia_anni: c.garanzia_anni ? Number(c.garanzia_anni) : null,
          image_url: firstString(articolo?.immagine_url, articolo?.image_url, articolo?.foto_url),
          articolo_descrizione_estesa: firstString(
            articolo?.descrizione_estesa,
            articolo?.descrizione_lunga,
            articolo?.note_tecniche,
          ),
          scheda_tecnica_url: firstString(articolo?.scheda_tecnica_url),
        };
      }),
      servizi: [
        ...mapFvManodoperaRowsToPdfServices((manodRes.data ?? []) as Array<Record<string, unknown>>),
        ...(servRes.data ?? []).map((s: Record<string, unknown>) => ({
          tipo: s.tipo ? String(s.tipo) : null,
          descrizione: String(s.descrizione ?? ""),
          quantita: Number(s.quantita) || 1,
          prezzo_vendita: Number(s.prezzo_vendita) || 0,
          note_operative: s.note_operative ? String(s.note_operative) : null,
        })),
      ],
      template: {
        logo_url: template.logo_url ?? null,
        pdf_cover_hero: template.pdf_cover_hero ?? null,
        pdf_cover_subhero: template.pdf_cover_subhero ?? null,
        pdf_cover_subhero_template: template.pdf_cover_subhero_template ?? null,
        pdf_cover_eyebrow: template.pdf_cover_eyebrow ?? null,
        pdf_cover_image_url: template.pdf_cover_image_url ?? null,
        pdf_cover_overlay_opacity: template.pdf_cover_overlay_opacity ?? null,
        pdf_cover_bg_color: template.pdf_cover_bg_color ?? null,
        pdf_cover_text_color: template.pdf_cover_text_color ?? null,
        pdf_cover_text_align: template.pdf_cover_text_align ?? null,
        pdf_cover_logo_position: template.pdf_cover_logo_position ?? null,
        pdf_cover_show_client_card: template.pdf_cover_show_client_card ?? null,
        presentazione_impresa_html: template.presentazione_impresa_html ?? null,
        foto_team_url: template.foto_team_url ?? null,
        chi_siamo_titolo: template.chi_siamo_titolo ?? null,
        recensioni: Array.isArray(template.recensioni) ? template.recensioni : [],
        certificazioni: Array.isArray(template.certificazioni) ? template.certificazioni : [],
        render_disclaimer: template.render_disclaimer ?? null,
        percorso_cliente_intro: template.percorso_cliente_intro ?? null,
        consulente_descrizione_default: template.consulente_descrizione_default ?? null,
        pdf_cta_finale_titolo: template.pdf_cta_finale_titolo ?? null,
        pdf_cta_finale_testo: template.pdf_cta_finale_testo ?? null,
        pdf_pages_order: Array.isArray(template.pdf_pages_order) ? template.pdf_pages_order : null,
        valore_proposta_html: template.valore_proposta_html ?? null,
        garanzie_conversione: Array.isArray(template.garanzie_conversione)
          ? template.garanzie_conversione
          : [],
        faq_items: Array.isArray(template.faq_items) ? template.faq_items : [],
        condizioni_legali_attivo: template.condizioni_legali_attivo ?? false,
        condizioni_legali_testo: template.condizioni_legali_testo ?? null,
        urgenza_attiva: template.urgenza_attiva ?? false,
        urgenza_titolo: template.urgenza_titolo ?? null,
        urgenza_descrizione: template.urgenza_descrizione ?? null,
        noleggio_note_legali: template.noleggio_note_legali ?? null,
        listino_macrocategorie_fv: listinoMacrocategorieFv,
      },
    };

    // ── Render HTML ────────────────────────────────────────────────────────
    const pagesCount = getFvPdfRenderedPagesCount(data);
    const html = renderFvPdfHtml(data);
    const htmlBytes = new TextEncoder().encode(html);

    // ── Upload su storage ──────────────────────────────────────────────────
    const filename = `${safeFvPdfStorageSegment(prog.numero)}-${payloadTipo}.html`;
    const path = `${prog.company_id}/${prog.id}/${Date.now()}-${filename}`;
    const { error: errUp } = await supabaseAdmin.storage
      .from("fv-progetti")
      .upload(path, htmlBytes, { contentType: "text/html; charset=utf-8", upsert: false });
    if (errUp) throw new Error(`Upload HTML fallito: ${errUp.message}`);

    // ── Aggiorna progetto + log ────────────────────────────────────────────
    const fieldUrl =
      payloadTipo === "vendita" ? "pdf_vendita_url" : payloadTipo === "tecnico" ? "pdf_tecnico_url" : "pdf_mobile_url";
    const { error: updateErr } = await supabaseAdmin
      .from("fv_progetti")
      .update({ [fieldUrl]: path } as Record<string, unknown>)
      .eq("id", p.progetto_id);
    if (updateErr) throw new Error(`Aggiornamento progetto fallito: ${updateErr.message}`);
    const { error: logErr } = await supabaseAdmin.from("fv_pdf_generation_log").insert({
      progetto_id: p.progetto_id,
      tipo: payloadTipo,
      versione_template: 2,
      storage_url: path,
      size_bytes: htmlBytes.byteLength,
      pages_count: pagesCount,
      duration_ms: Date.now() - t0,
      status: "success",
      created_by: userId,
    });
    if (logErr) console.warn("[fv-genera-pdf v2] log success failed:", logErr.message);

    return jsonResponse(
      {
        url: path,
        size_bytes: htmlBytes.byteLength,
        pages_count: pagesCount,
        duration_ms: Date.now() - t0,
        format: "html",
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fv-genera-pdf v2] ERROR:", msg);
    try {
      if (supabaseAdmin && payloadProgettoId) {
        await supabaseAdmin.from("fv_pdf_generation_log").insert({
          progetto_id: payloadProgettoId,
          tipo: payloadTipo,
          versione_template: 2,
          storage_url: null,
          size_bytes: 0,
          pages_count: 0,
          duration_ms: Date.now() - t0,
          status: "error",
          error_message: msg.substring(0, 500),
          created_by: userId,
        });
      }
    } catch {
      /* noop */
    }
    return errorResponse(msg, 500, corsHeaders);
  }
});
