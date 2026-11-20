import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { errorResponse, getCorsHeaders, jsonResponse } from "../_shared/headers.ts";
import { serveConMetriche } from "../_shared/withMetrics.ts";
import { giornoCassa, intervalliCassa } from "../../../shared/cassaInCloud.ts";
import { ClientCassaInCloud, ErroreCassa } from "./client.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const azioni = new Set(["stato", "verifica", "collega", "scollega", "importa"]);

serveConMetriche("cassa-in-cloud", async (req) => {
  const cors = { ...getCorsHeaders(req), "Cache-Control": "no-store" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("Metodo non consentito.", 405, cors);

  const token = req.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return errorResponse("Sessione non valida.", 401, cors);

  let azione: unknown;
  try {
    const { data: { user }, error: erroreAuth } = await admin.auth.getUser(token);
    if (erroreAuth || !user) return errorResponse("Sessione non valida.", 401, cors);
    const body = await req.json().catch(() => null);
    azione = body?.action;
    const companyId = body?.company_id;
    if (typeof companyId !== "string" || !UUID.test(companyId) ||
        typeof azione !== "string" || !azioni.has(azione)) {
      return errorResponse("Azienda o operazione non valida.", 400, cors);
    }

    const { data: profilo, error: erroreProfilo } = await admin.from("profiles").select("is_blocked,deleted_at")
      .eq("id", user.id).maybeSingle();
    if (erroreProfilo || !profilo || profilo.is_blocked || profilo.deleted_at ||
        !await canAccessCompany(admin, user.id, companyId)) {
      return errorResponse("Accesso negato a questa azienda.", 403, cors);
    }

    const permesso = (nome: string) => admin.rpc("has_permission_for_company", {
      _user_id: user.id, _company_id: companyId, _permission: nome,
    });
    const fatture = await permesso("can_view_billing");
    if (fatture.error || fatture.data !== true) return errorResponse("Serve il permesso Fatturazione.", 403, cors);
    const { data: azienda, error: erroreAzienda } = await admin.from("companies").select("vat_number")
      .eq("id", companyId).is("deleted_at", null).maybeSingle();
    if (erroreAzienda || !azienda) return errorResponse("Azienda non disponibile.", 404, cors);

    const punti = () => admin.from("cassa_in_cloud_punti_vendita").select("punto_vendita_id,nome,ultimo_import")
      .eq("company_id", companyId).order("nome");
    if (azione === "stato") {
      const { data, error } = await punti();
      if (error) throw error;
      return jsonResponse({ collegamenti: data }, 200, cors);
    }

    const utente = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const [gestione, solaLettura] = await Promise.all([
      permesso("can_edit_settings_integrations"),
      utente.rpc("utente_sola_lettura", { p_company_id: companyId }),
    ]);
    if (gestione.error || gestione.data !== true || solaLettura.error || solaLettura.data !== false) {
      return errorResponse("Serve il permesso di modifica delle integrazioni.", 403, cors);
    }

    const puntoId = body.punto_vendita_id;
    if (azione !== "verifica" &&
        (typeof puntoId !== "string" || !/^(0|[1-9]\d{0,15})$/.test(puntoId) || !Number.isSafeInteger(Number(puntoId)))) {
      return errorResponse("Seleziona un punto vendita valido.", 400, cors);
    }
    const chiavePunto = { p_company_id: companyId, p_punto_vendita_id: puntoId };

    if (azione === "scollega") {
      const { error } = await admin.from("cassa_in_cloud_punti_vendita").delete()
        .eq("company_id", companyId).eq("punto_vendita_id", puntoId);
      if (error) throw error;
      return jsonResponse({ ok: true }, 200, cors);
    }

    const { data: anagrafica, error: erroreAnagrafica } = await admin.from("anagrafica_azienda")
      .select("partita_iva").eq("company_id", companyId).maybeSingle();
    if (erroreAnagrafica) throw erroreAnagrafica;
    const partiteIva = [azienda.vat_number, anagrafica?.partita_iva ?? null];

    if (azione === "verifica" || azione === "collega") {
      const chiave = typeof body.api_key === "string" ? body.api_key.trim() : "";
      if (!chiave || chiave.length > 512 || /\s/.test(chiave)) {
        return errorResponse("Inserisci una chiave API valida.", 400, cors);
      }
      const cassa = new ClientCassaInCloud(chiave);
      const disponibili = await cassa.puntiVendita(partiteIva);
      if (azione === "verifica") return jsonResponse({ punti: disponibili }, 200, cors);
      const punto = disponibili.find((p) => p.id === puntoId);
      if (!punto?.compatibile) return errorResponse("Punto vendita non disponibile per la partita IVA dell’azienda.", 422, cors);
      await cassa.verificaScontrini(puntoId, giornoCassa());
      const { error } = await admin.rpc("cassa_in_cloud_collega", {
        ...chiavePunto, p_nome: punto.nome, p_valuta: punto.valuta, p_chiave: chiave,
      });
      if (error) throw error;
      return jsonResponse({ ok: true }, 200, cors);
    }

    const { dal, al } = body;
    if (typeof dal !== "string" || typeof al !== "string" || al > giornoCassa() ||
        intervalliCassa(dal, al, 2).length !== 1) {
      return errorResponse("Indica uno o due giorni, fino a oggi, per ogni richiesta di importazione.", 400, cors);
    }
    const { data: prenotazione, error: erroreImport } = await admin.rpc("cassa_in_cloud_inizia_import", chiavePunto).maybeSingle();
    if (erroreImport) throw erroreImport;
    const importazione = prenotazione as { import_id: string; chiave: string | null } | null;
    if (!importazione) return errorResponse("Il punto vendita è scollegato o ha già un’importazione in corso.", 409, cors);

    let completato = false;
    try {
      if (!importazione.chiave) throw new ErroreCassa("Ricollega il punto vendita con una chiave valida.", 422);
      const cassa = new ClientCassaInCloud(importazione.chiave);
      const disponibili = await cassa.puntiVendita(partiteIva);
      if (!disponibili.some((p) => p.id === puntoId && p.compatibile)) {
        throw new ErroreCassa("La chiave non consente più di importare da questo punto vendita per l’azienda.", 422);
      }
      const righe = await cassa.scontrini(puntoId, dal, al);
      const { data, error } = await admin.rpc("cassa_in_cloud_salva_import", {
        ...chiavePunto, p_import_id: importazione.import_id, p_dal: dal, p_al: al, p_righe: righe,
      }).maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse("Il collegamento è cambiato durante l’importazione. Riprova.", 409, cors);
      completato = true;
      return jsonResponse(data, 200, cors);
    } finally {
      if (!completato) {
        await admin.from("cassa_in_cloud_punti_vendita").update({ import_id: null, import_scade: null })
          .eq("company_id", companyId).eq("punto_vendita_id", puntoId).eq("import_id", importazione.import_id);
      }
    }
  } catch (error) {
    if (error instanceof ErroreCassa) return errorResponse(error.message, error.status, cors);
    // Errori PostgREST e risposte del fornitore possono contenere dati della richiesta.
    console.error("[cassa-in-cloud] Operazione fallita", typeof azione === "string" && azioni.has(azione) ? azione : "");
    return errorResponse("Operazione Cassa in Cloud non riuscita. Riprova tra poco.", 500, cors);
  }
});
