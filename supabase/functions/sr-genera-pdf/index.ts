/**
 * Edge Function: sr-genera-pdf
 *
 * Genera l'HTML del preventivo Serramenti (4+ pagine A4) e lo salva su
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
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { renderSrPdfHtml, countSrPdfPages, type SrPdfData } from "../_shared/srHtmlTemplate.ts";
import { buildMergeContext, substituteMergeTags } from "../_shared/quoteTemplateComposer.ts";

interface Payload {
  progetto_id: string;
}

// ─── Sintesi intervento auto-generata (duplicata da src/lib/serramenti/sintesiIntervento.ts).
// Tenuta inline qui perché le edge function Deno non importano da src/.
// Se cambi una mappa, aggiorna entrambe le copie.
// Mappe ALLINEATE 1:1 con src/lib/serramenti/sintesiIntervento.ts.
// Includono tutte le 14 tipologie del client (anche bow_window, tonda_ovale).
const SR_TIPO_GROUPS: Record<string, { singular: string; plural: string }> = {
  finestra_1anta: { singular: "finestra", plural: "finestre" },
  finestra_2ante: { singular: "finestra", plural: "finestre" },
  finestra_3ante: { singular: "finestra", plural: "finestre" },
  finestra_4ante: { singular: "finestra", plural: "finestre" },
  portafinestra_1anta: { singular: "porta-finestra", plural: "porte-finestre" },
  portafinestra_2ante: { singular: "porta-finestra", plural: "porte-finestre" },
  portafinestra_3ante: { singular: "porta-finestra", plural: "porte-finestre" },
  alzante_scorrevole: { singular: "alzante-scorrevole", plural: "alzanti-scorrevoli" },
  scorrevole: { singular: "scorrevole", plural: "scorrevoli" },
  a_libro: { singular: "pieghevole", plural: "pieghevoli" },
  bow_window: { singular: "bow-window", plural: "bow-window" },
  fisso: { singular: "vetrata fissa", plural: "vetrate fisse" },
  lucernario: { singular: "lucernario", plural: "lucernari" },
  tonda_ovale: { singular: "finestra tonda", plural: "finestre tonde" },
};
const SR_ACC_GROUPS: Record<string, { singular: string; plural: string }> = {
  avvolgibile: { singular: "avvolgibile", plural: "avvolgibili" },
  tapparella: { singular: "tapparella", plural: "tapparelle" },
  cassonetto: { singular: "cassonetto", plural: "cassonetti" },
  zanzariera: { singular: "zanzariera", plural: "zanzariere" },
  persiana: { singular: "persiana", plural: "persiane" },
  scuro: { singular: "scuro", plural: "scuri" },
  inferriata: { singular: "inferriata", plural: "inferriate" },
  davanzale: { singular: "davanzale", plural: "davanzali" },
  controtelaio: { singular: "controtelaio", plural: "controtelai" },
};
function joinIt(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}
// Allineato a generateInterventoSintesi() client: stessa firma, stesso output
// (stringa, mai null). PDF template gestisce "" come "non mostrare sezione".
function autoGenerateInterventoSintesi(
  serr: Array<{ tipologia?: string; quantita?: number | null }>,
  acc: Array<{ tipo?: string; quantita?: number | null }>,
): string {
  const sCount = new Map<string, number>();
  for (const s of serr) {
    const g = s.tipologia ? SR_TIPO_GROUPS[s.tipologia] : undefined;
    const key = g ? `${g.singular}|${g.plural}` : "serramento|serramenti";
    sCount.set(key, (sCount.get(key) ?? 0) + (s.quantita ?? 1));
  }
  const sParts: string[] = [];
  for (const [k, v] of sCount) {
    const [sing, plural] = k.split("|");
    sParts.push(v === 1 ? `1 ${sing}` : `${v} ${plural ?? sing}`);
  }
  const aCount = new Map<string, number>();
  for (const a of acc) {
    if (!a.tipo) continue;
    aCount.set(a.tipo, (aCount.get(a.tipo) ?? 0) + (a.quantita ?? 1));
  }
  const aParts: string[] = [];
  for (const [tipo, v] of aCount) {
    const g = SR_ACC_GROUPS[tipo];
    if (g) aParts.push(v === 1 ? `1 ${g.singular}` : `${v} ${g.plural}`);
  }
  if (sParts.length === 0 && aParts.length === 0) return "";
  const out: string[] = [];
  if (sParts.length > 0) out.push(`Sostituzione di ${joinIt(sParts)}`);
  if (aParts.length > 0) {
    out.push(`${sParts.length > 0 ? "più" : "Fornitura di"} ${joinIt(aParts)}`);
  }
  return out.join(", ") + ".";
}

// ─── Cronoprogramma (duplicato server-side per non dipendere dal client) ────

interface FaseCrono { label: string; giorno_inizio: number; giorno_fine: number; emoji: string }

function generaCrono(
  numSerramenti: number,
  giorniProduzione: number,
  giorniCollaudo: number,
  giorniPosaOverride: number | null = null,
): FaseCrono[] {
  // Posa: priorità al valore esplicito impostato dal consulente; fallback al
  // suggerimento ≈0,8 g/pezzo solo se il campo non è valorizzato.
  const giorniPosa = giorniPosaOverride && giorniPosaOverride > 0
    ? giorniPosaOverride
    : Math.max(1, Math.ceil((numSerramenti || 1) * 0.8));
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

    // Authz: l'utente lavora nell'azienda del preventivo (azienda principale,
    // accesso multi-azienda o impersonificazione) oppure è super admin. Prima chi
    // non aveva un'azienda nel profilo passava senza controlli e riceveva il link
    // firmato di qualunque preventivo; chi lavora su più aziende prendeva 403.
    try {
      await verifyCompanyAccess(supabaseAdmin, auth.userId, prog.company_id);
    } catch {
      const { data: superRoles } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", auth.userId).eq("role", "super_admin");
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
        supabaseAdmin.from("companies").select("name, business_name, legal_address, legal_city, legal_postal_code, legal_province, phone, email, vat_number, logo_url").eq("id", prog.company_id).maybeSingle(),
      ]);

    // 2b. Scheda tecnica dinamica: per ogni serramento → family_id →
    // article_families. Usiamo macrocategoria_id diretto quando presente;
    // categoria_id rimane fallback legacy.
    // Tutto best-effort: se un lookup fallisce, il serramento appare senza specs.
    //
    // deno-lint-ignore no-explicit-any
    type FamilyRow = {
      id: string;
      categoria_id: string | null;
      macrocategoria_id: string | null;
      custom_field_values: Record<string, any> | null;
    };
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
        .select("id, categoria_id, macrocategoria_id, custom_field_values")
        .in("id", familyIds);
      ((famRows ?? []) as FamilyRow[]).forEach((f) => familyById.set(f.id, f));

      const categoriaIds = Array.from(new Set(
        ((famRows ?? []) as FamilyRow[])
          .filter((f) => !f.macrocategoria_id)
          .map((f) => f.categoria_id)
          .filter((v): v is string => !!v),
      ));
      if (categoriaIds.length > 0) {
        const { data: catRows } = await supabaseAdmin
          .from("listino_categorie")
          .select("id, macrocategoria_id")
          .in("id", categoriaIds);
        ((catRows ?? []) as Array<{ id: string; macrocategoria_id: string | null }>).forEach((c) => {
          if (c.macrocategoria_id) categoriaToMacro.set(c.id, c.macrocategoria_id);
        });

      }

      const macroIds = Array.from(new Set(
        ((famRows ?? []) as FamilyRow[])
          .map((f) => f.macrocategoria_id ?? (f.categoria_id ? categoriaToMacro.get(f.categoria_id) : null))
          .filter((v): v is string => !!v),
      ));
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
      const macroId = fam.macrocategoria_id ?? (fam.categoria_id ? categoriaToMacro.get(fam.categoria_id) : undefined);
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
      const macroId = fam?.macrocategoria_id ?? (fam?.categoria_id ? categoriaToMacro.get(fam.categoria_id) : undefined);
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
        .select("first_name, last_name, email, phone, role_interno, avatar_url")
        .eq("id", prog.consulente_id)
        .maybeSingle();
      if (cons) {
        consulente = {
          nome: [cons.first_name, cons.last_name].filter(Boolean).join(" ") || "Consulente",
          ruolo: cons.role_interno || "Consulente tecnico",
          telefono: cons.phone,
          email: cons.email,
          foto: cons.avatar_url,
        };
      }
    }

    // 4. Cronoprogramma
    const numSerr = (serramenti ?? []).reduce((acc: number, s: { quantita?: number }) => acc + (s.quantita ?? 1), 0);
    const cronoFasi = generaCrono(
      numSerr,
      prog.crono_giorni_produzione ?? 90,
      prog.crono_giorni_collaudo ?? 1,
      prog.crono_giorni_posa ?? null,
    );
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

    const refreshSrProgettiUrl = async (
      rawUrl: string | null,
      expiresIn = 60 * 60 * 24 * 7,
    ): Promise<string | null> => {
      if (!rawUrl) return null;
      try {
        const url = new URL(rawUrl);
        const match = url.pathname.match(/sr-progetti\/(.+)/);
        if (!match) return rawUrl;
        const storagePath = decodeURIComponent(match[1]).split("?")[0];
        const { data: signed, error: e } = await supabaseAdmin.storage
          .from("sr-progetti")
          .createSignedUrl(storagePath, expiresIn);
        if (e) {
          console.warn("[sr-genera-pdf] signed url refresh failed", storagePath, e.message);
          return rawUrl;
        }
        return signed?.signedUrl ?? rawUrl;
      } catch {
        return rawUrl;
      }
    };

    const mediaRows = (media ?? []) as MediaRow[];

    // Render foto-realistici (max 4 nel PDF)
    const renderRows = mediaRows.filter((m) => m.kind === "render");
    const renders = await Promise.all(renderRows.slice(0, 4).map(async (m) => ({
      url: await refreshMediaUrl(m),
      caption: m.caption,
    })));

    // Anche le immagini configurate a livello macrocategoria possono essere
    // signed URL Supabase scaduti: le rinfreschiamo qui, altrimenti le pagine
    // dedicate prodotto mostrano box vuoti proprio nel PDF cliente.
    macroPagineDedicate = await Promise.all(macroPagineDedicate.map(async (mp) => ({
      ...mp,
      immagine_url: await refreshSrProgettiUrl(mp.immagine_url),
    })));

    // 4c. Public URL per firma online: il documento mostra solo il link testuale.
    const appOrigin = (Deno.env.get("APP_PUBLIC_URL") ?? Deno.env.get("SITE_URL") ?? "https://app.ediliziaincloud.com").replace(/\/+$/, "");
    const storedPublicUrl = typeof prog.public_url === "string" ? prog.public_url.trim() : "";
    const publicUrl = prog.public_token
      ? `${appOrigin}/stima/${prog.public_token}`
      : storedPublicUrl
        ? (/^https?:\/\//i.test(storedPublicUrl)
            ? storedPublicUrl
            : `${appOrigin}${storedPublicUrl.startsWith("/") ? "" : "/"}${storedPublicUrl}`)
        : null;

    // 5. Costruisci payload template
    // deno-lint-ignore no-explicit-any
    const tpl = (template ?? {}) as any;
    // deno-lint-ignore no-explicit-any
    const com = (company ?? {}) as any;
    const companyAddress = [
      com.legal_address,
      [com.legal_postal_code, com.legal_city].filter(Boolean).join(" "),
      com.legal_province,
    ].filter(Boolean).join(", ");

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
      // Merge tag ({{cliente.nome_completo}}, {{azienda.ragione_sociale}}…) sostituiti coi dati del progetto
      condizioni_legali_testo: tpl?.condizioni_legali_testo
        ? substituteMergeTags(String(tpl.condizioni_legali_testo), buildMergeContext({
            quote: {
              quote_number: prog.code,
              client_name: [prog.cliente_nome, prog.cliente_cognome].filter(Boolean).join(" ").trim() || undefined,
              client_email: prog.cliente_email ?? "",
              client_phone: prog.cliente_telefono ?? "",
              client_address: prog.cliente_indirizzo ?? "",
              created_at: prog.created_at,
            },
            company: { name: tpl?.ragione_sociale ?? "", vat_number: tpl?.partita_iva ?? "", address: tpl?.indirizzo_completo ?? "", email: tpl?.email ?? "", phone: tpl?.telefono ?? "" },
            cantiere: { indirizzo: prog.cliente_indirizzo ?? "", citta: prog.cantiere_citta ?? prog.cliente_citta ?? "" },
          }))
        : null,
      condizioni_legali_attivo: tpl?.condizioni_legali_attivo ?? true,
      intervento_titolo: prog.intervento_titolo || `Per ${prog.cliente_nome ?? ""}`,
      // Sintesi: usa quella esplicitamente inserita; se vuota, auto-genera dal BOM
      // così il PDF non resta mai senza sezione "L'intervento in sintesi".
      intervento_sintesi: (prog.intervento_sintesi && String(prog.intervento_sintesi).trim())
        || autoGenerateInterventoSintesi(serramenti ?? [], accessori ?? []),
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
      renders,
      valido_fino_giorni: prog.valido_fino_giorni ?? 15,
      azienda_nome: tpl.ragione_sociale || com.business_name || com.name || "Azienda",
      azienda_indirizzo: tpl.indirizzo_completo || companyAddress || null,
      azienda_telefono: tpl.telefono || com.phone,
      azienda_email: tpl.email || com.email,
      azienda_partita_iva: tpl.partita_iva || com.vat_number,
      azienda_logo_url: tpl.logo_url || com.logo_url,
      colore_primario: tpl.colore_primario || "#2D7D5C",
    };

    // 6b. Rigenera signed URL del logo/foto se provengono dal bucket sr-progetti.
    data.azienda_logo_url = await refreshSrProgettiUrl(data.azienda_logo_url, 60 * 60 * 24 * 365);
    data.consulente_foto_url = await refreshSrProgettiUrl(data.consulente_foto_url);

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
    const pagesCount = countSrPdfPages(data);
    await supabaseAdmin.from("sr_pdf_generation_log").insert({
      progetto_id: prog.id,
      company_id: prog.company_id,
      user_id: userId,
      variant: "vendita",
      status: "success",
      html_url: htmlUrl,
      duration_ms,
      pages_count: pagesCount,
    });

    return jsonResponse(
      { ok: true, html_url: htmlUrl, public_url: publicUrl, duration_ms, pages_count: pagesCount },
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
