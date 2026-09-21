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
 * overlay style, decorazione; USP "Perché scegliere noi" in pageGaranzie +
 * cronoprogramma personalizzato in pageIter). La CI rileva i cambi solo nella
 * dir propria della function ed ESCLUDE `_shared/`: quando cambia solo il
 * template condiviso, basta un bump qui per far ridistribuire la function.
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { buildMergeContext, substituteMergeTags } from "../_shared/quoteTemplateComposer.ts";
import { aziendaAccessibile, requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import {
  getFvPdfRenderedPagesCount,
  FOTO_DI_SERIE_FV,
  fotoDeiBlocchiFv,
  renderFvPdfHtml,
  type FvPdfTemplateData,
} from "../_shared/fvHtmlTemplate.ts";
import { eFotoDiSerie } from "../_shared/blocchiPreventivo.ts";
import { calcolaEnergyFlows } from "../_shared/fvCalcoli.ts";
import { coloreDelDocumento } from "../_shared/temaColori.ts";
import { condizioniStandard } from "../_shared/condizioniStandard.ts";
import { CAMPI_IMMAGINE_FOTOVOLTAICO, firmaImmaginiModello, firmatarioStorage } from "../_shared/immaginiModelloPdf.ts";
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

/** fv_progetti.iva_aliquota è una frazione (0.1000 = 10%). Il PDF scriveva
 *  sempre «IVA 10%», anche sui progetti con un'aliquota diversa. */
function aliquotaIva(valore: unknown): number {
  const n = Number(valore);
  if (valore == null || valore === "" || !Number.isFinite(n) || n < 0) return 10;
  return Math.round((n <= 1 ? n * 100 : n) * 100) / 100;
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
        "id, company_id, numero, titolo, archetipo, indirizzo, comune, provincia, cap, latitudine, longitudine, tipologia_immobile, prima_casa, consumo_annuo_kwh, costo_kwh_attuale, profilo_consumo, fonte_dati_tetto, qualita_dati_tetto, imagery_date, ore_sole_annue, superficie_tetto_disponibile_mq, perdita_ombreggiamento_pct, numero_pannelli_scelti, potenza_kwp, con_accumulo, capacita_accumulo_kwh, prezzo_vendita_iva_inclusa, payback_anni, npv_25_anni, risparmio_anno1, created_at, created_by, scenario_finanziamento, finanziamento_tabella_id, finanziamento_durata_mesi, finanziamento_rata_eur, finanziamento_taeg, finanziamento_tan, finanziamento_totale_dovuto_eur, kit_bundle_id, kit_nome, kit_prezzo, prezzo_vendita_manuale, sconto_valore, modalita_pagamento, iva_aliquota",
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
        .select("name, vat_number, pec, phone, email, website, brand_primary_color")
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
    // Le immagini del modello sono percorsi nel bucket privato (vedi
    // _shared/immaginiModelloPdf.ts): si firmano adesso, e solo se stanno nella
    // cartella di questa azienda. Logo e copertina restano link dentro l'HTML
    // salvato, che si riapre nei mesi: la firma vale un anno, come i vecchi link,
    // ma riparte a ogni generazione. Le altre foto diventano base64 qui sotto.
    const template = await firmaImmaginiModello(
      templateRes.data ?? {},
      CAMPI_IMMAGINE_FOTOVOLTAICO,
      firmatarioStorage(supabaseAdmin, 60 * 60 * 24 * 365),
      prog.company_id,
    );
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

    // «A cura di» in copertina: chi ha creato il progetto, ma solo se lavora in
    // questa azienda. Prima ci finiva anche il super admin entrato per assistenza.
    let venditoreNome: string | null = null;
    if (prog.created_by && await aziendaAccessibile(supabaseAdmin, prog.created_by, prog.company_id)) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", prog.created_by)
        .maybeSingle();
      if (profile) {
        venditoreNome = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
      }
    }

    // ── Helper: fetch URL → data URI base64 ─────────────────────────────────
    const urlToB64 = async (url: string, timeout = 8000): Promise<string | undefined> => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
        if (!r.ok) return undefined;
        const buf = new Uint8Array(await r.arrayBuffer());
        const ct = r.headers.get("content-type") ?? "image/jpeg";
        let b64 = "";
        for (let i = 0; i < buf.length; i++) b64 += String.fromCharCode(buf[i]);
        return `data:${ct};base64,${btoa(b64)}`;
      } catch { return undefined; }
    };

    // ── Immagini satellitari (Google Static Maps) per pagina anteprima ──────
    let mapImages: { close?: string; medium?: string; overview?: string; wide?: string } | null = null;
    const satLat = Number(prog.latitudine), satLng = Number(prog.longitudine);
    // La chiave Google Maps sta in platform_settings (come per maps-proxy), non
    // solo nell'env: leggerla da lì fa apparire la mappa satellitare anche nel PDF.
    const googleMapsKey = (await getPlatformSetting("google_maps_api_key", "GOOGLE_MAPS_API_KEY")) || "";
    if (satLat && satLng && googleMapsKey) {
      const fetchSatImg = (zoom: number) =>
        urlToB64(
          `https://maps.googleapis.com/maps/api/staticmap?center=${satLat},${satLng}&zoom=${zoom}&size=640x480&scale=2&maptype=satellite&key=${googleMapsKey}`,
        );
      // 4 zoom distinti → 4 viste sempre diverse nel PDF
      const [close, medium, overview, wide] = await Promise.all([
        fetchSatImg(20), // zenitale ravvicinata
        fetchSatImg(18), // aerea
        fetchSatImg(17), // via/strada
        fetchSatImg(15), // panoramica zona
      ]);
      if (close || medium || overview || wide) mapImages = { close, medium, overview, wide };
    }

    // ── Cantieri + Bundle: fetch immagini in parallelo ────────────────────────
    const cantieriGalleria = (
      (template as Record<string, unknown>).cantieri_galleria as
        | Array<{ foto_url?: string; citta?: string; descrizione?: string }> | null
    ) ?? [];
    const cantieriFotoUrls = cantieriGalleria
      .map((c) => c.foto_url)
      .filter((u): u is string => Boolean(u))
      .slice(0, 3);

    type BundleRow = { nome: string; descrizione: string | null; fv_kwp: number | null; fv_accumulo_kwh: number | null; cover_image_url: string | null };
    type BundleVoceRow = { bundle_id: string; prodotto_id: string | null; quantita: number; immagine_url?: string | null; article_templates?: { name?: string; immagine_url?: string | null } | null; tariffe_aziendali?: { nome?: string } | null; article_families?: { nome?: string; immagine_url?: string | null } | null };

    // La foto della riga di un kit e' un'ECCEZIONE, non la regola: se non c'e'
    // si prende quella del prodotto di listino a cui la riga e' collegata.
    // Cosi' basta caricare la foto una volta sola nel listino e tutti i kit
    // che usano quel prodotto la mostrano.
    const fotoDellaVoce = (v: BundleVoceRow): string => {
      const propria = typeof v.immagine_url === "string" ? v.immagine_url : "";
      if (propria) return propria;
      const daFamiglia = v.article_families?.immagine_url;
      if (typeof daFamiglia === "string" && daFamiglia) return daFamiglia;
      const daProdotto = v.article_templates?.immagine_url;
      if (typeof daProdotto === "string" && daProdotto) return daProdotto;
      return "";
    };

    let bundleData: BundleRow | null = null;
    let bundleVoci: BundleVoceRow[] = [];
    if (prog.kit_bundle_id) {
      // Solo un kit di questa azienda: con l'id di un kit altrui il PDF ne
      // stampava nome, voci e copertina.
      const bRes = await supabaseAdmin
        .from("bundle_prodotti")
        .select("nome, descrizione, fv_kwp, fv_accumulo_kwh, cover_image_url")
        .eq("id", prog.kit_bundle_id)
        .eq("company_id", prog.company_id)
        .maybeSingle();
      bundleData = bRes.data ?? null;
      if (bundleData) {
        const bvRes = await supabaseAdmin
          .from("bundle_voci")
          .select("bundle_id, prodotto_id, quantita, immagine_url, article_templates(name, immagine_url), tariffe_aziendali(nome), article_families(nome, immagine_url)")
          .eq("bundle_id", prog.kit_bundle_id)
          .order("sort_order");
        bundleVoci = (bvRes.data ?? []) as BundleVoceRow[];
      }
    }

    // Fetch immagini cantieri + copertina bundle in parallelo
    const [cantieriFotoB64, bundleCoverB64] = await Promise.all([
      Promise.all(cantieriFotoUrls.map((u) => urlToB64(u))),
      bundleData?.cover_image_url ? urlToB64(bundleData.cover_image_url) : Promise.resolve(undefined),
    ]);

    // Foto azienda + foto impianti delle recensioni → base64 (così compaiono nel
    // PDF anche nel download lato browser, senza dipendere da URL esterni/CORS).
    const fotoTeamB64 = template.foto_team_url
      ? await urlToB64(template.foto_team_url as string)
      : undefined;
    const recensioniRaw = Array.isArray(template.recensioni)
      ? (template.recensioni as Array<Record<string, unknown>>)
      : [];
    const recensioniB64 = await Promise.all(
      recensioniRaw.map(async (rec) => {
        const fotoUrl = typeof rec?.foto_url === "string" ? rec.foto_url : "";
        const fotoB64 = fotoUrl ? await urlToB64(fotoUrl) : undefined;
        return { ...rec, foto_url: fotoB64 ?? null };
      }),
    );

    // Base64 delle foto componenti FV (articoli_native.immagine_url) → compaiono
    // nel PDF anche nel download lato browser.
    const componentImgB64 = new Map<string, string>();
    await Promise.all(
      Array.from(articoliById.values()).map(async (art) => {
        const u = firstString(
          (art as Record<string, unknown>).immagine_url,
          (art as Record<string, unknown>).image_url,
          (art as Record<string, unknown>).foto_url,
        );
        if (u) {
          const b64 = await urlToB64(u);
          if (b64) componentImgB64.set(u, b64);
        }
      }),
    );

    // Base64 delle foto delle voci bundle/kit.
    const bundleVociImgB64 = new Map<string, string>();
    await Promise.all(
      bundleVoci.map(async (v) => {
        const u = fotoDellaVoce(v);
        if (u) {
          const b64 = await urlToB64(u);
          if (b64) bundleVociImgB64.set(u, b64);
        }
      }),
    );

    // ── Foto di serie del documento ────────────────────────────────────────
    // CO₂ (alberi, voli, auto, bosco), fasi (installatori) e investimento
    // (inverter e batteria): stanno nel sito, in public/pdf-stock/fotovoltaico, e
    // si incorporano come le altre immagini, così il documento resta completo anche
    // aperto senza rete. Solo risposte che sono davvero immagini: per un file che
    // manca il sito risponde con la sua pagina HTML, e quella non va nel PDF. Una
    // foto che non arriva lascia la pagina col disegno di prima.
    // Prima il dominio dell'app che serve di sicuro public/ (verificato il 21/09),
    // poi APP_URL come riserva: il .it non risponde, e non si sa a quale punti.
    const basiFotoDiSerie = [...new Set(
      ["https://app.ediliziaincloud.com", Deno.env.get("APP_URL")]
        .filter((b): b is string => Boolean(b))
        .map((b) => `${b.replace(/\/+$/, "")}/pdf-stock/fotovoltaico`),
    )];
    const fotoDiSerie = async (file: string): Promise<string | null> => {
      for (const base of basiFotoDiSerie) {
        const dati = await urlToB64(`${base}/${file}`);
        if (dati?.startsWith("data:image/")) return dati;
      }
      return null;
    };
    const [fotoAlberi, fotoVoli, fotoAuto, fotoBosco, fotoInstallatori, fotoImpianto] = await Promise.all([
      fotoDiSerie(FOTO_DI_SERIE_FV.alberi), fotoDiSerie(FOTO_DI_SERIE_FV.voli), fotoDiSerie(FOTO_DI_SERIE_FV.auto),
      fotoDiSerie(FOTO_DI_SERIE_FV.bosco), fotoDiSerie(FOTO_DI_SERIE_FV.installatori), fotoDiSerie(FOTO_DI_SERIE_FV.impianto),
    ]);

    // Le foto dei blocchi accesi (come funziona, sicurezza sul tetto…): quelle di
    // serie dal sito, come sopra; quelle dell'azienda dal link appena firmato.
    // Solo immagini vere; una che non arriva lascia il blocco senza quella foto.
    const sitiFotoDiSerie = [...new Set(
      ["https://app.ediliziaincloud.com", Deno.env.get("APP_URL")]
        .filter((b): b is string => Boolean(b))
        .map((b) => b.replace(/\/+$/, "")),
    )];
    const fotoDelBlocco = async (indirizzo: string): Promise<string | null> => {
      const candidati = indirizzo.startsWith("/") ? sitiFotoDiSerie.map((b) => `${b}${indirizzo}`) : [indirizzo];
      for (const url of candidati) {
        const dati = await urlToB64(url);
        if (dati?.startsWith("data:image/")) return dati;
      }
      return null;
    };
    const blocchiFoto = Object.fromEntries(await Promise.all(
      Object.entries(fotoDeiBlocchiFv(template as FvPdfTemplateData["template"])).map(async ([chiave, foto]) => {
        const pronte = await Promise.all(foto.map(async (u) => ({ src: await fotoDelBlocco(u), diSerie: eFotoDiSerie(u) })));
        return [chiave, pronte.filter((f): f is { src: string; diSerie: boolean } => Boolean(f.src))] as const;
      }),
    ));

    // ── Calcoli aggregati ──────────────────────────────────────────────────
    const ingressiFlussi = {
      potenza_kwp: Number(prog.potenza_kwp) || 0,
      has_accumulo: prog.con_accumulo ?? false,
      capacita_accumulo_kwh: Number(prog.capacita_accumulo_kwh) || 0,
      consumo_annuo_kwh: Number(prog.consumo_annuo_kwh) || 0,
      ore_sole_annue: Number(prog.ore_sole_annue) || null,
      profilo_consumo: prog.profilo_consumo ?? "misto",
      perdita_ombreggiamento_pct: Number(prog.perdita_ombreggiamento_pct) || 0,
    };
    const flows = calcolaEnergyFlows(ingressiFlussi);
    // Gli stessi flussi senza batteria, con gli stessi dati: la pagina della
    // produzione dice quanto cambia l'accumulo con numeri calcolati, non a occhio.
    const flowsSenzaAccumulo = ingressiFlussi.has_accumulo
      ? calcolaEnergyFlows({ ...ingressiFlussi, has_accumulo: false, capacita_accumulo_kwh: 0 })
      : null;

    // Detrazione: quella del calcolo finanziario, che la dà solo ai privati
    // (50% prima casa, 36% le altre, plafond dal catalogo incentivi). Il PDF la
    // ricalcolava per conto suo e la stampava anche ad aziende, condomini e CER.
    const detrazionePerc = prog.prima_casa === true ? 50 : 36;
    const privato = ["privato_prima", "privato_seconda", "privato_isee"].includes(String(prog.archetipo ?? ""));
    const detrazioneTotale = calc?.detrazione_anno_eur != null
      ? Number(calc.detrazione_anno_eur) * 10
      : privato
        ? (Math.min(96000, Number(prog.prezzo_vendita_iva_inclusa) || 0) * detrazionePerc) / 100
        : 0;
    const costoNetto = (Number(prog.prezzo_vendita_iva_inclusa) || 0) - detrazioneTotale;

    // Cassa cumulata: se non disponibile, generiamo proiezione semplice
    let cassaAnni: Array<{ anno: number; cumulato: number }> = [];
    if (Array.isArray(calc?.cassa_anno_per_anno) && (calc!.cassa_anno_per_anno as Array<unknown>).length > 0) {
      cassaAnni = calc!.cassa_anno_per_anno as Array<{ anno: number; cumulato: number }>;
    } else if (Number(prog.risparmio_anno1) > 0) {
      // Fallback: proiezione semplice dal risparmio salvato. Senza risparmio la
      // cassa resta vuota e la pagina dei 25 anni non esce (prima si partiva da
      // un risparmio inventato di 1.500 €/anno).
      const investimento = Number(prog.prezzo_vendita_iva_inclusa) || 0;
      const risparmioAnno = Number(prog.risparmio_anno1);
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
      tan_perc: number | null;
      taeg_perc: number | null;
      importo_finanziato: number;
    } | null = null;
    const scenarioFinMode = (prog.scenario_finanziamento as string | null) ?? "rate";
    // Un tasso assente resta assente («n.d.» nel PDF); il noleggio non ha TAN né TAEG.
    const tasso = (valore: unknown): number | null =>
      scenarioFinMode === "noleggio" || valore == null || valore === "" || !Number.isFinite(Number(valore))
        ? null
        : Number(valore);
    if (
      scenarioFinMode !== "cash" &&
      Number(prog.finanziamento_rata_eur) > 0 &&
      Number(prog.finanziamento_durata_mesi) > 0
    ) {
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
        durata_mesi: Number(prog.finanziamento_durata_mesi),
        rata_mensile: Number(prog.finanziamento_rata_eur),
        tan_perc: tasso(prog.finanziamento_tan),
        taeg_perc: tasso(prog.finanziamento_taeg),
        // Il capitale, non il totale dovuto (che comprende gli interessi); con
        // un anticipo si riduce più sotto, insieme alla rata.
        importo_finanziato: Number(prog.prezzo_vendita_iva_inclusa) || 0,
      };
    } else if (scenarioFinMode !== "cash") {
      // Fallback legacy: scenario_completo (Sprint 1/2)
      const scenarioFin = (
        calc?.scenario_completo as { finanziamento?: FinanziamentoLite } | undefined
      )?.finanziamento;
      // Solo se il vecchio scenario aveva davvero rata e durata: mancando, prima
      // si stampavano il 120% del prezzo in 84 rate, TAN 4,75% e TAEG 5,4%.
      if (scenarioFin && Number(scenarioFin.rata_mensile) > 0 && Number(scenarioFin.durata_mesi) > 0) {
        finanziamento = {
          finanziaria: scenarioFin.finanziaria ?? "Finanziaria",
          durata_mesi: Number(scenarioFin.durata_mesi),
          rata_mensile: Number(scenarioFin.rata_mensile),
          tan_perc: tasso(scenarioFin.tan_perc),
          taeg_perc: tasso(scenarioFin.taeg_perc),
          importo_finanziato:
            Number(scenarioFin.importo_finanziato) || Number(prog.prezzo_vendita_iva_inclusa) || 0,
        };
      }
    }
    // Se cash o niente dati, finanziamento resta null (template gestisce)

    // ── Modalità di pagamento — ADATTIVA alla modalità scelta ─────────────
    //   diretto (cash): tranche acconto/SAL/saldo (% → € sul totale)
    //   finanziato (rate/zero): anticipo in contanti + resto a rate
    //   noleggio: canone mensile, zero anticipo
    // Gli importi € si ricalcolano sul prezzo IVA inclusa; la rata si scala
    // linearmente sul capitale residuo.
    let modalitaPagamento:
      | { tipo: "diretto"; tranche: Array<{ label: string; pct: number; importo_eur: number }>; note: string | null }
      | { tipo: "finanziato"; anticipo_pct: number; anticipo_eur: number; finanziato_eur: number; rata_mensile: number; durata_mesi: number; tasso_zero: boolean; note: string | null }
      | { tipo: "noleggio"; canone_mensile: number; durata_mesi: number; note: string | null }
      | null = null;
    {
      const mpRaw = prog.modalita_pagamento as
        | { tranche?: Array<{ label?: string; pct?: number }>; note?: string | null; anticipo_pct?: number }
        | null;
      const noteMp = mpRaw?.note ?? null;
      const totalePag = Number(prog.prezzo_vendita_iva_inclusa) || 0;

      if (scenarioFinMode === "noleggio" && finanziamento) {
        modalitaPagamento = {
          tipo: "noleggio",
          canone_mensile: finanziamento.rata_mensile,
          durata_mesi: finanziamento.durata_mesi,
          note: noteMp,
        };
      } else if (
        (scenarioFinMode === "rate" || scenarioFinMode === "zero") &&
        finanziamento &&
        totalePag > 0
      ) {
        const anticipoPct = Math.max(0, Math.min(100, Number(mpRaw?.anticipo_pct) || 0));
        const anticipoEur = Math.round((totalePag * anticipoPct) / 100);
        const finanziatoEur = Math.max(0, totalePag - anticipoEur);
        const rataScalata = Math.round(
          finanziamento.rata_mensile * (finanziatoEur / totalePag),
        );
        modalitaPagamento = {
          tipo: "finanziato",
          anticipo_pct: anticipoPct,
          anticipo_eur: anticipoEur,
          finanziato_eur: finanziatoEur,
          rata_mensile: rataScalata,
          durata_mesi: finanziamento.durata_mesi,
          tasso_zero: scenarioFinMode === "zero",
          note: noteMp,
        };
        // Stessa rata e stesso capitale in tutte le pagine: prima l'investimento
        // mostrava la rata ridotta dall'anticipo, piano economico e firma quella intera.
        finanziamento = { ...finanziamento, rata_mensile: rataScalata, importo_finanziato: finanziatoEur };
      } else {
        // Pagamento diretto (cash) o fallback senza dati finanziamento.
        const tr = Array.isArray(mpRaw?.tranche) ? mpRaw!.tranche! : [];
        if (tr.length > 0 && totalePag > 0) {
          const somma = tr.reduce((s, t) => s + (Number(t?.pct) || 0), 0);
          const sumOk = Math.abs(somma - 100) < 0.01;
          const importi = tr.map((t) => Math.round((totalePag * (Number(t?.pct) || 0)) / 100));
          if (sumOk && importi.length > 0) {
            importi[importi.length - 1] += totalePag - importi.reduce((s, v) => s + v, 0);
          }
          modalitaPagamento = {
            tipo: "diretto",
            tranche: tr.map((t, i) => ({
              label: String(t?.label ?? `Rata ${i + 1}`),
              pct: Number(t?.pct) || 0,
              importo_eur: importi[i] ?? 0,
            })),
            note: noteMp,
          };
        }
      }
    }

    // ── Estrazione cliente da titolo (in W1 cliente_id non sempre popolato) ─
    const titoloParts = (prog.titolo ?? "").trim().split(/\s+/);
    const clienteNome = titoloParts[0] ?? "";
    const clienteCognome = titoloParts.slice(1).join(" ") || "";

    // ── Costruzione data context ──────────────────────────────────────────
    const data: FvPdfTemplateData = {
      azienda: {
        name: company.name ?? "Edilizia in Cloud",
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
      map_images: mapImages,
      cantieri_foto: cantieriFotoB64.filter((s): s is string => Boolean(s)),
      // Il kit com'era quando è stato scelto: nome e taglia salvati sul progetto.
      // Prima il PDF leggeva il kit di oggi, e se era stato cancellato la
      // pagina del kit spariva.
      bundle: bundleData || (prog.kit_bundle_id && prog.kit_nome) ? {
        nome: firstString(prog.kit_nome, bundleData?.nome) ?? "Kit fotovoltaico",
        descrizione: bundleData?.descrizione ?? null,
        fv_kwp: Number(prog.potenza_kwp) > 0 ? Number(prog.potenza_kwp) : (bundleData?.fv_kwp ?? null),
        fv_accumulo_kwh: prog.con_accumulo && Number(prog.capacita_accumulo_kwh) > 0
          ? Number(prog.capacita_accumulo_kwh)
          : null,
        cover_b64: bundleCoverB64 ?? null,
        voci: bundleVoci.map((v) => {
          const u = fotoDellaVoce(v);
          return {
            descrizione: (v.article_templates as Record<string,string> | null)?.name
              ?? (v.article_families as Record<string,string> | null)?.nome
              ?? (v.tariffe_aziendali as Record<string,string> | null)?.nome
              ?? "Componente",
            quantita: Number(v.quantita) || 1,
            foto: u ? (bundleVociImgB64.get(u) ?? u) : null,
          };
        }),
      } : null,
      costi: {
        prezzo_vendita_iva_inclusa: Number(prog.prezzo_vendita_iva_inclusa) || 0,
        iva_perc: aliquotaIva(prog.iva_aliquota),
        // Prezzo a corpo (scritto a mano o del kit) o scontato: i prezzi delle
        // singole pratiche e della posa non tornerebbero col totale.
        prezzo_a_corpo: Number(prog.prezzo_vendita_manuale) > 0 || Boolean(prog.kit_bundle_id),
        sconto_applicato: Number(prog.sconto_valore) > 0,
        detrazione_eur: Math.round(detrazioneTotale),
        detrazione_perc: detrazionePerc,
        costo_netto_dopo_detrazione: Math.round(costoNetto),
      },
      finanziamento,
      modalita_pagamento: modalitaPagamento,
      scenario: {
        risparmio_mensile_eur: risparmioMensile,
        risparmio_anno1_eur: Math.round(risparmioAnno1),
        risparmio_25_anni_eur: Math.round(risparmio25),
        payback_anni: Number(prog.payback_anni) || null,
        npv_25_anni: Number(prog.npv_25_anni) || 0,
        cassa_anno_per_anno: cassaAnni,
      },
      flows,
      flows_senza_accumulo: flowsSenzaAccumulo,
      blocchi_foto: blocchiFoto,
      foto_di_serie: {
        alberi: fotoAlberi, voli: fotoVoli, auto: fotoAuto,
        bosco: fotoBosco, installatori: fotoInstallatori, impianto: fotoImpianto,
      },
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
          image_url: (() => {
            const u = firstString(articolo?.immagine_url, articolo?.image_url, articolo?.foto_url);
            return u ? (componentImgB64.get(u) ?? u) : undefined;
          })(),
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
        // Il modello rimasto al blu di fabbrica prende il colore scelto in «Brand &
        // Azienda»: le aziende vere non hanno mai aperto il modello del Fotovoltaico.
        colore_primario: coloreDelDocumento(
          (template as { colore_primario?: string | null }).colore_primario,
          (company as { brand_primary_color?: string | null }).brand_primary_color,
          "#1E3A5F",
        ),
        colore_accento: (template as { colore_accento?: string | null }).colore_accento ?? null,
        pdf_cover_text_align: template.pdf_cover_text_align ?? null,
        pdf_cover_logo_position: template.pdf_cover_logo_position ?? null,
        pdf_cover_show_client_card: template.pdf_cover_show_client_card ?? null,
        presentazione_impresa_html: template.presentazione_impresa_html ?? null,
        foto_team_url: fotoTeamB64 ?? template.foto_team_url ?? null,
        chi_siamo_titolo: template.chi_siamo_titolo ?? null,
        recensioni: recensioniB64,
        certificazioni: Array.isArray(template.certificazioni) ? template.certificazioni : [],
        render_disclaimer: template.render_disclaimer ?? null,
        percorso_cliente_intro: template.percorso_cliente_intro ?? null,
        consulente_descrizione_default: template.consulente_descrizione_default ?? null,
        pdf_cta_finale_titolo: template.pdf_cta_finale_titolo ?? null,
        pdf_cta_finale_testo: template.pdf_cta_finale_testo ?? null,
        pdf_pages_order: Array.isArray(template.pdf_pages_order) ? template.pdf_pages_order : null,
        pdf_blocchi: template.pdf_blocchi && typeof template.pdf_blocchi === "object" ? template.pdf_blocchi : null,
        valore_proposta_html: template.valore_proposta_html ?? null,
        garanzie_conversione: Array.isArray(template.garanzie_conversione)
          ? template.garanzie_conversione
          : [],
        faq_items: Array.isArray(template.faq_items) ? template.faq_items : [],
        usp: Array.isArray(template.usp) ? template.usp : [],
        cronoprogramma: Array.isArray(template.cronoprogramma) ? template.cronoprogramma : [],
        // Acceso di suo: il preventivo si firma, e senza condizioni quel contratto
        // non dice niente su tempi, varianti, garanzie e recesso.
        condizioni_legali_attivo: template.condizioni_legali_attivo !== false,
        // Il modulo di recesso: lo accende l'azienda nel modello, spento di serie.
        modulo_recesso_attivo: template.modulo_recesso_attivo === true,
        // Merge tag dei blocchi importati dalla libreria Template offerte → dati del progetto
        condizioni_legali_testo: substituteMergeTags(
          // Senza condizioni scritte dall'azienda valgono quelle di base del settore.
          String(template.condizioni_legali_testo ?? "").trim() || condizioniStandard("fotovoltaico"),
          buildMergeContext({
              quote: {
                quote_number: (prog as { numero?: string | number | null }).numero != null ? String((prog as { numero?: string | number | null }).numero) : "",
                client_name: [prog.cliente_nome, prog.cliente_cognome].filter(Boolean).join(" ").trim() || undefined,
                client_email: prog.cliente_email ?? "",
                client_phone: prog.cliente_telefono ?? "",
                client_address: prog.indirizzo ?? "",
                total: prog.costo_totale_netto ?? null,
                created_at: prog.created_at,
              },
              company: {
                name: (template as { ragione_sociale?: string | null }).ragione_sociale ?? (company as { name?: string | null }).name ?? "",
                vat_number: (template as { partita_iva?: string | null }).partita_iva ?? (company as { vat_number?: string | null }).vat_number ?? "",
                address: (template as { indirizzo_completo?: string | null }).indirizzo_completo ?? "",
                email: (template as { email?: string | null }).email ?? (company as { email?: string | null }).email ?? "",
                phone: (template as { telefono?: string | null }).telefono ?? (company as { phone?: string | null }).phone ?? "",
              },
              cantiere: { indirizzo: prog.indirizzo ?? "" },
              template: { payment_terms_text: (template as { condizioni_pagamento_testo?: string | null }).condizioni_pagamento_testo ?? "" },
          }),
        ),
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
      .upload(path, htmlBytes, { contentType: "text/html", upsert: true });
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
