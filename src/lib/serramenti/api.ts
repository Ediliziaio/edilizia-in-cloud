/**
 * src/lib/serramenti/api.ts — API client modulo Preventivatore Serramenti
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
} from "@/types/serramenti";
import { sinonimiVerticale } from "@/lib/listino/areeStandard";

// ─── PROGETTI ───────────────────────────────────────────────────────────────

/**
 * Input creazione progetto: accetta TUTTI i campi del progetto, non solo i 4
 * essenziali. Bug fix: prima i campi cliente_indirizzo, cliente_telefono,
 * cliente_email, cap, provincia, ecc. inseriti nello Step 1 venivano persi
 * perché non passati a createProgetto.
 */
export type SrCreateProgettoInput = Partial<SrProgettoRow>;

export async function createProgetto(
  input: SrCreateProgettoInput,
  /** L'azienda in cui si sta lavorando (useEffectiveCompanyId). */
  companyIdEffettiva?: string | null,
): Promise<SrProgettoRow> {
  // L'azienda è quella aperta, non quella del profilo: un super admin entrato in
  // un'azienda non ne ha nessuna («Profilo senza azienda associata») e chi lavora
  // su più aziende creava il preventivo in quella di casa. Il profilo resta il
  // ripiego per chi chiama senza passarla.
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  let companyId = companyIdEffettiva ?? null;
  if (!companyId) {
    const { data: profile } = await supabase
      .from("profiles" as never)
      .select("company_id")
      .eq("id", userId ?? "")
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    companyId = (profile as any)?.company_id ?? null;
  }
  if (!companyId) throw new Error("Nessuna azienda aperta: entra in un'azienda per creare il preventivo");

  // FIX integrazione · Leggi i default dal template aziendale (se esiste)
  // e pre-popola i campi `iva_percentuale`, `valido_fino_giorni`,
  // `fin_anticipo_pct` del nuovo progetto. Prima erano hardcoded a 10/15/40
  // ignorando le configurazioni dell'admin nel template editor.
  // L'utente può sempre sovrascrivere in StepEconomia. Se template assente
  // o errore di lettura, fallback ai valori storici (10/15/40).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: templateRow } = await (supabase as any)
    .from("sr_template_pdf")
    .select("iva_percentuale_default, valido_giorni_default, anticipo_pct_default")
    .eq("company_id", companyId)
    .maybeSingle();
  const ivaDefault = Number(templateRow?.iva_percentuale_default ?? 10);
  const validoGiorniDefault = Number(templateRow?.valido_giorni_default ?? 15);
  const anticipoPctDefault = Number(templateRow?.anticipo_pct_default ?? 40);

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
    // Consulente di default = utente che crea il preventivo. Permette di
    // pre-popolare il PDF con nome + foto profilo + ruolo senza richiedere
    // un secondo step "scegli consulente". Override possibile dopo via update.
    consulente_id: input.consulente_id ?? userId ?? null,
    // IVA dal template (default editor) o fallback 10% (aliquota ristrutturazione
    // edilizia, caso più comune per serramenti).
    iva_percentuale: ivaDefault,
    valido_fino_giorni: validoGiorniDefault,
    fin_anticipo_pct: anticipoPctDefault,
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

export async function listProgetti(opts?: { stato?: SrStatoProgetto; limit?: number; companyId?: string | null }) {
  // SELECT esteso: aggiunge campi usati dai filtri avanzati della lista
  // (commerciale, provincia, m², bonus, pagamento, link CRM/ordini).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("sr_progetti")
    .select([
      "id, code, stato",
      "cliente_id, cliente_nome, cliente_cognome",
      "cantiere_citta, cantiere_provincia, cantiere_zona_climatica, cantiere_condominio",
      "totale_min, totale_max, totale_serramenti, metri_quadri_totali",
      "tipo_intervento, materiale_principale",
      "consulente_id, consulenza_at",
      "detrazione_aliquota, schema_pagamento, fin_anticipo_pct",
      "opportunita_id, ordine_id, sopralluogo_id",
      "firmato_il",
      "created_at, updated_at",
      "pdf_url, pdf_generated_at",
    ].join(", "))
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
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

  // Re-sign delle signed URL dei media: garantisce che le foto cantiere
  // caricate >7gg fa restino visibili (le signed URL scadono con
  // SR_MEDIA_TTL_SEC=7gg). Per i record con `url` NON-http (es. path
  // di storage salvato erroneamente in passato — segnalato dall'utente
  // per la foto "PRIMA" del render) firmiamo qui.
  //
  // Due categorie:
  //   A) Media bucket sr-progetti (kind=situazione/render con storage_path
  //      "company_id/progetto_id/photos/..."): firma batch in 1 round-trip.
  //   B) Media legacy render-session (kind=situazione con storage_path
  //      "render-session:<id>:original" e url=path del bucket render-originals
  //      non firmato): firma individualmente via createRenderOriginalSignedUrl.
  const mediaList = (media ?? []) as SrMediaRow[];
  const mediaSrProgetti = mediaList.filter((m) =>
    m.storage_path && !m.storage_path.startsWith("render-session:"),
  );
  const mediaRenderLegacy = mediaList.filter((m) =>
    m.kind === "situazione"
    && m.storage_path?.startsWith("render-session:")
    && m.url
    && !m.url.startsWith("http"),
  );

  // A) Batch sign media bucket sr-progetti
  if (mediaSrProgetti.length > 0) {
    try {
      const paths = mediaSrProgetti.map((m) => m.storage_path as string);
      const { data: signedList, error: signErr } = await supabase.storage
        .from("sr-progetti")
        .createSignedUrls(paths, SR_MEDIA_TTL_SEC);
      if (!signErr && signedList) {
        const urlByPath = new Map<string, string>();
        signedList.forEach((s, i) => {
          if (s.signedUrl && !s.error) urlByPath.set(paths[i], s.signedUrl);
        });
        // Sostituisce l'url in memoria (NON salvato in DB: la signed URL
        // resta valida per 7gg dal page load; al prossimo getProgetto si
        // rigenera). Lasciamo il DB pulito.
        mediaList.forEach((m) => {
          if (m.storage_path) {
            const fresh = urlByPath.get(m.storage_path);
            if (fresh) m.url = fresh;
          }
        });
      } else if (signErr) {
        console.warn("[serramenti] getProgetto batch sign media failed", signErr);
      }
    } catch (err) {
      console.warn("[serramenti] getProgetto media re-sign exception", err);
    }
  }

  // B) Re-sign legacy render-originals (foto PRIMA importate prima del
  // fix 3e7c4216 dove il `url` salvato era il path raw, non l'URL).
  // Una signed URL per ogni record (no batch API cross-bucket).
  if (mediaRenderLegacy.length > 0) {
    try {
      const { createRenderOriginalSignedUrl } = await import("@/lib/render/renderStorage");
      await Promise.all(mediaRenderLegacy.map(async (m) => {
        if (!m.url) return;
        try {
          const fresh = await createRenderOriginalSignedUrl(
            "render-originals", m.url, SR_MEDIA_TTL_SEC,
          );
          if (fresh) m.url = fresh;
        } catch (e) {
          console.warn("[serramenti] getProgetto legacy render orig sign failed", m.id, e);
        }
      }));
    } catch (err) {
      console.warn("[serramenti] getProgetto legacy render orig import failed", err);
    }
  }

  const serviziList = (manodopera ?? []) as import("@/types/serramenti").SrServizioRow[];
  return {
    progetto: progetto as SrProgettoRow,
    serramenti: (serramenti ?? []) as SrSerramentoRow[],
    accessori: (accessori ?? []) as SrAccessorioRow[],
    media: mediaList,
    risparmio: (risparmio ?? null) as SrCalcoloRisparmioRow | null,
    servizi: serviziList,
    manodopera: serviziList, // alias retrocompat
  };
}

// Allowlist colonne `sr_progetti` aggiornabili da `updateProgetto`.
// Esclude id/company_id/created_by/created_at/code (read-only o gestiti
// dal sistema). Protegge contro write accidentali su campi virtuali o
// non-DB passati dal client.
const SR_PROGETTO_UPDATABLE_KEYS: ReadonlySet<keyof SrProgettoRow> = new Set([
  // Stato
  "stato", "updated_at",
  // Cliente
  "cliente_id", "cliente_nome", "cliente_cognome", "cliente_indirizzo",
  "cliente_citta", "cliente_cap", "cliente_provincia", "cliente_telefono",
  "cliente_email", "cliente_codice_fiscale",
  // Cantiere
  "cantiere_indirizzo", "cantiere_citta", "cantiere_cap", "cantiere_provincia",
  "cantiere_lat", "cantiere_lng", "cantiere_zona_climatica", "cantiere_piano",
  "cantiere_condominio", "cantiere_vincoli",
  // Intervento
  "tipo_intervento", "intervento_titolo", "intervento_sintesi",
  "materiale_principale", "totale_serramenti", "totale_accessori",
  "metri_quadri_totali",
  // Copy preventivo
  "esigenze", "soluzione", "perche_noi", "incluso_investimento",
  "testimonianze", "prossimi_passi",
  // Economia
  "totale_min", "totale_max", "iva_inclusa", "iva_percentuale",
  "sconto_percentuale", "sconto_importo", "fin_anticipo_pct", "fin_piani",
  "fin_tabella_id", "fin_tabella_riga_id", "discount_rule_id",
  "pagamento_milestones", "schema_pagamento",
  // Varianti
  "varianti_attive", "varianti", "variante_selezionata",
  // ROI
  "risparmio_calcolato", "risparmio_eur_anno", "detrazione_aliquota",
  "detrazione_eur_totale", "detrazione_eur_anno", "payback_anni",
  "co2_risparmiata_t_anno",
  // Consulenza
  "consulente_id", "consulenza_at", "consulenza_luogo",
  // Cronoprogramma
  "crono_giorni_produzione", "crono_giorni_posa", "crono_giorni_collaudo",
  // Validità
  "valido_fino_giorni", "valido_fino_data",
  // Microsito pubblico
  "public_token", "public_url", "allow_self_signing", "firmato_il",
  "firma_cliente_url",
  // Referral
  "referral_amount_eur",
  // Link
  "sopralluogo_id", "sopralluogo_eseguito_il", "opportunita_id", "ordine_id",
  // Output
  "pdf_url", "pdf_generated_at", "pdf_html_url",
  // Note
  "note_interne",
]);

export async function updateProgetto(id: string, patch: Partial<SrProgettoRow>): Promise<void> {
  // Allowlist: scarta silenziosamente le chiavi non in whitelist.
  // Protegge da:
  //   - campi virtuali (calcolati lato client, non esistono in DB)
  //   - typo di developer ("intervento_descr" vs "intervento_descrizione")
  //   - regressioni future (nuova prop UI propagata erroneamente al DB)
  //
  // Prima: `update(patch)` su tutto -> errore Supabase 42703 (column does
  // not exist) ad ogni save con un campo invalido, oppure scrittura di
  // colonne sensibili da bug client (es. id, company_id).
  const safePatch: Record<string, unknown> = {};
  for (const k of Object.keys(patch) as Array<keyof SrProgettoRow>) {
    if (SR_PROGETTO_UPDATABLE_KEYS.has(k)) {
      safePatch[k] = patch[k];
    }
  }
  if (Object.keys(safePatch).length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("sr_progetti").update(safePatch).eq("id", id);
  if (error) {
    console.error("[serramenti] updateProgetto failed", error);
    throw new Error("Salvataggio progetto fallito");
  }
}

export async function deleteProgetto(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Soft delete → Cestino (30 giorni, poi purge notturno definitivo)
  const { error } = await (supabase as any).from("sr_progetti").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("Eliminazione progetto fallita");
}

// ─── SERRAMENTI (BOM) ───────────────────────────────────────────────────────

/**
 * Duplica un progetto come nuova revisione: clona riga progetto + serramenti +
 * accessori + servizi sotto un nuovo id.
 *
 * Strategia:
 *  - parent_id = id originale → la nuova riga sa di essere figlia
 *  - revision_number = max(child.revision_number) + 1
 *  - stato = "bozza" (la revisione parte sempre da bozza per editing)
 *  - code = ${original.code}-r${revision_number} (es. SR-2026-001-r2)
 *  - PDF urls + ordine_id NON copiati (sono output, vanno rigenerati)
 *  - consulenza_at + valido_fino_data resetati (nuovo ciclo offerta)
 *
 * Le righe figlie (serramenti/accessori/servizi) sono insertate via copia
 * delle colonne dati eccetto id/progetto_id/created_at.
 */
export async function duplicaProgetto(originalId: string): Promise<{ newId: string; newCode: string; revision_number: number }> {
  // 1. Carica originale + childen
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orig, error: origErr } = await (supabase as any)
    .from("sr_progetti")
    .select("*")
    .eq("id", originalId)
    .maybeSingle();
  if (origErr || !orig) throw new Error("Progetto originale non trovato");

  // 2. Compute revision_number: max(children) + 1 (parent stesso conta come r1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingRevs } = await (supabase as any)
    .from("sr_progetti")
    .select("revision_number")
    .or(`parent_id.eq.${originalId},id.eq.${originalId}`);
  const revs = (existingRevs ?? []) as Array<{ revision_number: number }>;
  const nextRev = Math.max(...revs.map((r) => r.revision_number ?? 1), 1) + 1;

  // 3. Insert nuovo progetto: copia tutti i campi rilevanti, override id e
  //    metadata. Lasciamo che il DB generi created_at / updated_at.
   
  const {
    id: _origId,
    code: _origCode,
    created_at: _ca,
    updated_at: _ua,
    pdf_url: _pdf,
    pdf_generated_at: _pdfAt,
    pdf_html_url: _pdfHtml,
    ordine_id: _ordId,
    consulenza_at: _ca2,
    valido_fino_data: _vfd,
    ...copyableFields
  } = orig as Record<string, unknown>;
   

  const newCode = `${orig.code}-r${nextRev}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nuovo, error: nuovoErr } = await (supabase as any)
    .from("sr_progetti")
    .insert({
      ...copyableFields,
      code: newCode,
      stato: "bozza",
      parent_id: originalId,
      revision_number: nextRev,
    })
    .select("id, code, revision_number")
    .single();
  if (nuovoErr || !nuovo) throw new Error(`Creazione revisione fallita: ${nuovoErr?.message}`);
  const newId = nuovo.id as string;

  // 4. Clona righe figlie. Helper interno per copia generica (skip id/keys server-managed).
  const cloneRows = async (tableName: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: children } = await (supabase as any)
      .from(tableName)
      .select("*")
      .eq("progetto_id", originalId);
    if (!children || children.length === 0) return;
    const rowsToInsert = (children as Array<Record<string, unknown>>).map((r) => {
       
      const { id: _id, progetto_id: _pid, created_at: _ca, updated_at: _ua, ...rest } = r;
       
      return { ...rest, progetto_id: newId };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: cloneErr } = await (supabase as any).from(tableName).insert(rowsToInsert);
    if (cloneErr) {
      console.warn(`[duplicaProgetto] clone ${tableName} fallito:`, cloneErr.message);
    }
  };
  await Promise.all([
    cloneRows("sr_serramenti_progetto"),
    cloneRows("sr_accessori_progetto"),
    cloneRows("sr_servizi_progetto"),
  ]);

  return { newId, newCode, revision_number: nextRev };
}

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
      colore_interno: serramento.colore_interno ?? null,
      colore_esterno: serramento.colore_esterno ?? null,
      larghezza_mm: serramento.larghezza_mm ?? null,
      altezza_mm: serramento.altezza_mm ?? null,
      quantita: serramento.quantita ?? 1,
      metri_quadri: serramento.metri_quadri ?? null,
      prezzo_unitario: serramento.prezzo_unitario ?? null,
      prezzo_totale: serramento.prezzo_totale ?? null,
      // BUG FIX (segnalato dall'utente): aggiungendo dal listino il
      // family_id veniva passato ma NON salvato qui -> la riga era
      // persistita con family_id=null -> StepBom non riconosceva
      // "isFromListino" -> mostrava i campi Materiale/Serie/Vetro/Colore
      // e nascondeva la scheda tecnica della macrocategoria.
      family_id: serramento.family_id ?? null,
      listino_voce_id: serramento.listino_voce_id ?? null,
      supplier_catalog_id: serramento.supplier_catalog_id ?? null,
      supplier_product_line_id: serramento.supplier_product_line_id ?? null,
      macrocategoria_override_id: serramento.macrocategoria_override_id ?? null,
      // Snapshot scelte assi (variabili prodotto) della family al momento
      // del preventivo. Mappa { axis_codice -> axis_value_id }. Default {}.
      valori_assi: serramento.valori_assi ?? {},
      note: serramento.note ?? null,
      // Default FALSE = posa inclusa (comportamento di default per articoli
      // del listino che hanno manodopera configurata). Il commerciale puo'
      // disattivarla in StepBom per casi "solo fornitura". Vedi migration
      // 20270513000000_sr_posa_esclusa.sql.
      posa_esclusa: serramento.posa_esclusa ?? false,
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
      // Misure: stessa logica del fix su sr_serramenti_progetto.
      // Le colonne larghezza_mm/altezza_mm esistono (mig 20270312000000)
      // ma erano omesse dall'INSERT -> dialog "Copia misure dai serramenti"
      // creava accessori senza misure.
      larghezza_mm: accessorio.larghezza_mm ?? null,
      altezza_mm: accessorio.altezza_mm ?? null,
      prezzo_unitario: accessorio.prezzo_unitario ?? null,
      prezzo_totale: accessorio.prezzo_totale ?? null,
      listino_voce_id: accessorio.listino_voce_id ?? null,
      serramento_id: accessorio.serramento_id ?? null,
      note: accessorio.note ?? null,
      // Default FALSE = posa inclusa (vedi sr_serramenti_progetto).
      posa_esclusa: accessorio.posa_esclusa ?? false,
      // Collegamento listino (migration 20270513220000).
      // Quando family_id valorizzato, l'accessorio è clonato da un articolo
      // del listino → prezzo/modalita/variabili snapshottati per stabilità
      // del preventivo anche se il listino cambia in seguito.
      family_id: accessorio.family_id ?? null,
      valori_assi: accessorio.valori_assi ?? null,
      modalita_prezzo: accessorio.modalita_prezzo ?? null,
      supplier_catalog_id: accessorio.supplier_catalog_id ?? null,
      supplier_product_line_id: accessorio.supplier_product_line_id ?? null,
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

export async function getTemplatePdf(companyId?: string): Promise<SrTemplatePdfRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any).from("sr_template_pdf").select("*");
  // Filtra esplicitamente per company: senza questo il super_admin (che bypassa
  // il RLS) vedrebbe tutte le righe e maybeSingle() restituirebbe quella di EiC.
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q.maybeSingle();
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
  /** Enum CHECK su tariffe_aziendali.tipo. Usato dal quick-add ServiziSection
   *  per mappare chip → tariffa configurata dall'azienda. */
  tipo: string | null;
}

export async function listTariffeManodopera(searchQuery?: string, companyId?: string | null): Promise<TariffaMinimal[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("tariffe_aziendali")
    .select("id, nome, descrizione, unita, prezzo_costo, prezzo_vendita, categoria_prodotto, vertical_associato, tipo, attiva")
    .eq("attiva", true)
    .order("nome", { ascending: true })
    // La posa inclusa su una family puo' puntare a una tariffa oltre le prime
    // 100 alfabetiche. Aumentiamo il cap per evitare ricalcoli a 0.
    .limit(1000);
  if (companyId) q = q.eq("company_id", companyId);
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
  /** Filtro tipo macrocategoria (migration 20270513230000).
   *  Default: nessun filtro = restituisce tutte (principale + accessorio).
   *  Pass 'principale' per il picker preventivo principale,
   *  'accessorio' per la sezione "Accessori e complementi". */
  tipo?: "principale" | "accessorio" | null;
  /** L'azienda aperta (useEffectiveCompanyId): a un super admin le regole del
   *  database restituiscono le tipologie di tutte le aziende. */
  companyId?: string | null;
}): Promise<ListinoMacrocategoria[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("listino_macrocategorie")
    .select("id, nome, descrizione, icona, colore, immagine_url, verticali_abilitati, categoria_tipo")
    .eq("attivo", true)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });
  // Filtro vertical lato server via PostgREST `or`:
  // verticali_abilitati = '{}' (vuoto → generica) OR contiene il vertical in
  // uno dei modi in cui è scritto («serramentista» e «serramenti» sono la
  // stessa area: una tipologia etichettata nell'altro modo spariva dal picker).
  if (opts?.vertical) {
    const contiene = sinonimiVerticale(opts.vertical).map((v) => `verticali_abilitati.cs.{${v}}`);
    q = q.or(["verticali_abilitati.eq.{}", ...contiene].join(","));
  }
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  if (opts?.tipo) {
    q = q.eq("categoria_tipo", opts.tipo);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[serramenti] listMacrocategorie failed", error);
    throw new Error("Errore caricamento macrocategorie listino");
  }
  const macros = (data ?? []) as ListinoMacrocategoria[];
  if (!opts?.onlyWithFamilies || macros.length === 0) return macros;

  // Filtro lato client: per ogni macro conta le famiglie esistenti.
  // Post-refactor 20270513200000: article_families.macrocategoria_id è FK
  // diretto → niente più indirection via listino_categorie.
  // Fallback al vecchio path per articoli pre-refactor (categoria_id legacy).
  // Contano solo i prodotti che il preventivatore propone davvero: attivi e non
  // «Fuori dai preventivi». Una tipologia con soli prodotti nascosti non si mostra.
  // Anche qui l'azienda: senza, i prodotti di tutte le aziende superano le mille
  // righe che il database restituisce e alcune tipologie sparivano a caso.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let famQ = (supabase as any)
    .from("article_families")
    .select("macrocategoria_id, categoria_id")
    .eq("attivo", true)
    .eq("mostra_preventivo", true)
    .is("deleted_at", null);
  if (opts.companyId) famQ = famQ.eq("company_id", opts.companyId);
  const { data: famRows } = await famQ;
  const macrosWithFam = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let catQ = (supabase as any)
    .from("listino_categorie")
    .select("id, macrocategoria_id");
  if (opts.companyId) catQ = catQ.eq("company_id", opts.companyId);
  const { data: catRows } = await catQ;
  const catToMacro = new Map<string, string>();
  (catRows ?? []).forEach((c: { id: string; macrocategoria_id: string | null }) => {
    if (c.macrocategoria_id) catToMacro.set(c.id, c.macrocategoria_id);
  });
  (famRows ?? []).forEach((f: { macrocategoria_id: string | null; categoria_id: string | null }) => {
    if (f.macrocategoria_id) {
      macrosWithFam.add(f.macrocategoria_id);
    } else if (f.categoria_id) {
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
  opts?: { onlyWithFamilies?: boolean; companyId?: string | null },
): Promise<ListinoCategoria[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("listino_categorie")
    .select("id, nome, descrizione, icona, colore, immagine_url, macrocategoria_id")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
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
  macrocategoria_id?: string | null;
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
  // ─── Prezzo da acquisto + ricarico (prezzo_base_mode = "acquisto_markup") ─
  prezzo_base_mode?: string | null;
  prezzo_base_acquisto?: number | null;
  sconto_fornitore_1?: number | null;
  sconto_fornitore_2?: number | null;
  markup_tipo?: string | null;
  markup_valore?: number | null;
}

export interface ListinoGrigliaItem {
  id: string;
  family_id: string;
  valore_x: number | null;
  valore_y: number | null;
  prezzo_vendita: number | null;
  prezzo_acquisto: number | null;
  supplier_catalog_id: string | null;
  supplier_product_line_id: string | null;
  note: string | null;
}

/**
 * Recupera famiglie listino per IDs noti (es. quelle referenziate dai
 * serramenti di un preventivo). Indipendente dal LIMIT 100 di
 * listListinoFamilies(): se l'utente ha 200 articoli nel listino e il
 * preventivo referenzia una famiglia oltre i primi 100 ordine alfabetico,
 * va recuperata esplicitamente. Senza questo, family resta undefined e
 * la riga appare come "off-listino" mostrando campi che non dovrebbe.
 */
export async function listListinoFamiliesByIds(ids: string[]): Promise<ListinoFamily[]> {
  if (!ids || ids.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("article_families")
    .select(`
      id, nome, descrizione, immagine_url, vertical, prezzo_base_vendita, vat_rate,
      modalita_prezzo_base, macrocategoria_id, categoria_id, custom_field_values,
      manodopera_modalita, posa_tariffa_default_id, posa_quantita_default, posa_linked,
      manodopera_unita, manodopera_costo_acquisto, manodopera_prezzo_vendita,
      prezzo_base_mode, prezzo_base_acquisto, sconto_fornitore_1, sconto_fornitore_2, markup_tipo, markup_valore
    `)
    .in("id", ids);
  if (error) {
    console.error("[serramenti] listListinoFamiliesByIds failed", error);
    throw new Error("Errore caricamento famiglie listino");
  }
  return (data ?? []) as ListinoFamily[];
}

export async function listListinoFamilies(opts?: {
  searchQuery?: string;
  /** Post-refactor 20270513200000: filtro per macrocategoria diretta. */
  macroId?: string | null;
  /** @deprecated usa macroId. Mantenuto per backward compat caller pre-refactor. */
  categoriaId?: string | null;
  /** L'azienda aperta (useEffectiveCompanyId). */
  companyId?: string | null;
}): Promise<ListinoFamily[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("article_families")
    .select(`
      id, nome, descrizione, immagine_url, vertical, prezzo_base_vendita, vat_rate,
      modalita_prezzo_base, macrocategoria_id, categoria_id, custom_field_values,
      manodopera_modalita, posa_tariffa_default_id, posa_quantita_default, posa_linked,
      manodopera_unita, manodopera_costo_acquisto, manodopera_prezzo_vendita,
      prezzo_base_mode, prezzo_base_acquisto, sconto_fornitore_1, sconto_fornitore_2, markup_tipo, markup_valore
    `)
    .eq("attivo", true)
    // «Fuori dai preventivi» nel listino vale anche qui: prima il preventivatore
    // serramenti lo ignorava e proponeva prodotti nascosti, anche a 0 €.
    .eq("mostra_preventivo", true)
    .is("deleted_at", null)
    .order("nome", { ascending: true })
    .limit(100);
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  const search = opts?.searchQuery?.trim();
  if (search && search.length >= 2) {
    q = q.ilike("nome", `%${search}%`);
  }
  if (opts?.macroId) {
    q = q.eq("macrocategoria_id", opts.macroId);
  } else if (opts?.categoriaId) {
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
    .select("id, family_id, valore_x, valore_y, prezzo_vendita, prezzo_acquisto, supplier_catalog_id, supplier_product_line_id, note")
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

export async function listCrmContacts(
  searchQuery?: string,
  limit: number = 50,
  companyId?: string | null,
): Promise<CrmContactMinimal[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("marketing_contacts")
    .select("id, first_name, last_name, email, phone, address, city, province, postal_code, company_name")
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (companyId) q = q.eq("company_id", companyId);
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

export async function listRenderSessions(opts?: { limit?: number; companyId?: string | null }): Promise<RenderSessionMinimal[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("render_sessions")
    .select("id, status, result_urls, original_photo_url, config, created_at")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 30);
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  const { data, error } = await q;
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

  // Carico la session completa: serve `original_photo_url` per il "PRIMA".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rs, error: rsErr } = await (supabase as any)
    .from("render_sessions")
    .select("id, company_id, result_urls, original_photo_url, status")
    .eq("id", input.render_session_id)
    .maybeSingle();
  if (rsErr || !rs) throw new Error("Render non trovato");
  if (rs.company_id !== companyId) throw new Error("Render appartiene ad altra azienda");
  if (!Array.isArray(rs.result_urls) || rs.result_urls.length === 0) {
    throw new Error("Render senza immagini disponibili");
  }
  const idx = input.result_index ?? 0;
  const renderUrl = rs.result_urls[idx] ?? rs.result_urls[0];
  // BUG FIX (segnalato dall'utente: "il PRIMA non si vede"):
  // `render_sessions.original_photo_url` salva un STORAGE PATH del bucket
  // render-originals, NON un URL firmato. Se lo salvavamo direttamente
  // come `m.url`, il browser cercava di GET-arlo come URL HTTPS -> 404 ->
  // immagine rotta nel preventivo.
  //
  // Fix: firmiamo qui (TTL 7 giorni allineato con gli altri media). Se il
  // valore e' gia' un URL HTTPS (legacy/migrazione) lo lasciamo invariato.
  const originalPath: string | null = rs.original_photo_url ?? null;
  let originalUrl: string | null = null;
  if (originalPath) {
    if (originalPath.startsWith("http")) {
      originalUrl = originalPath;
    } else {
      try {
        const { createRenderOriginalSignedUrl } = await import("@/lib/render/renderStorage");
        originalUrl = await createRenderOriginalSignedUrl(
          "render-originals",
          originalPath,
          60 * 60 * 24 * 7, // 7 giorni
        );
      } catch (e) {
        console.warn("[serramenti] importRender: signed URL foto originale fallita", e);
        originalUrl = null;
      }
    }
  }

  // Insert del RENDER (dopo). Storage path = "render-session:<id>:<idx>"
  // (sentinel: l'edge function PDF saprà che è un riferimento esterno e
  // non tenterà di rinfrescare la signed URL sul bucket sr-progetti).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_progetti_media")
    .insert({
      progetto_id: input.progetto_id,
      company_id: companyId,
      kind: "render",
      storage_path: `render-session:${rs.id}:${idx}`,
      url: renderUrl,
      caption: input.caption ?? null,
      posizione_pdf: "pag3_render",
      position: 0,
    })
    .select("*")
    .single();
  if (error) throw new Error("Aggiunta render al progetto fallita");

  // Insert anche della FOTO ORIGINALE (prima) come kind='situazione' se
  // presente. Il PDF la accoppia con il render via `hasPrimaDopo`
  // (vedi SerramentoPDF.tsx:1250-1252). Senza, viene mostrato solo il
  // "dopo" e l'utente non vede l'effetto "prima/dopo".
  // Idempotente: se la stessa session_id e' gia' stata importata, non
  // duplichiamo (check via storage_path sentinel).
  if (originalUrl) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from("sr_progetti_media")
      .select("id")
      .eq("progetto_id", input.progetto_id)
      .eq("storage_path", `render-session:${rs.id}:original`)
      .maybeSingle();
    if (!existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: errOrig } = await (supabase as any)
        .from("sr_progetti_media")
        .insert({
          progetto_id: input.progetto_id,
          company_id: companyId,
          kind: "situazione",
          storage_path: `render-session:${rs.id}:original`,
          url: originalUrl,
          caption: input.caption ? `${input.caption} (prima)` : "Foto situazione attuale",
          posizione_pdf: "pag3_situazione",
          position: 0,
        });
      if (errOrig) {
        // Non-fatale: il render principale e' stato salvato. Loggo soltanto.
        console.warn("[serramenti] importRender: salvataggio foto originale fallito", errOrig);
      }
    }
  }

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

export async function generaPdf(
  progetto_id: string,
): Promise<{ html_url: string; public_url: string | null; duration_ms: number; pages_count: number | null }> {
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
  return {
    html_url: r.html_url,
    public_url: r.public_url ?? null,
    duration_ms: r.duration_ms,
    pages_count: r.pages_count ?? null,
  };
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

export async function upsertTemplatePdf(patch: Partial<SrTemplatePdfRow>, companyId: string): Promise<void> {
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
