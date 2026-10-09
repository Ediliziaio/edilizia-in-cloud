/**
 * importa-fattura-attiva-xml
 *
 * Registra una fattura EMESSA a partire dal suo XML FatturaPA, per le aziende
 * che fatturano su un provider esterno (Aruba, ...) senza collegare le API.
 * Le ricevute hanno gia' la loro strada (ricevi-sdi): qui si trattano solo le
 * emesse, che finiscono su invoices + invoice_lines — la stessa tabella in cui
 * scrive billing-import, cosi' ricavi e registro IVA restano una cosa sola.
 *
 * Due paletti, perche' qui si tocca il fatturato:
 *
 *   1. La direzione viene RICONTROLLATA dal server. Il browser propone, ma se
 *      la partita IVA del cedente non e' quella dell'azienda la richiesta viene
 *      respinta: una fattura di un fornitore non deve poter diventare un ricavo.
 *
 *   2. Non si sovrascrive MAI una fattura di altra provenienza. Se esiste gia'
 *      lo stesso numero emesso nativamente dalla piattaforma, si segnala il
 *      conflitto e non si tocca nulla: la numerazione e' materia fiscale.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { LettoreXmlMinimo } from "../_shared/xmlMinimo.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { ruoliNellAzienda } from "../_shared/amministraAzienda.ts";
import { isSuperAdminEmailAllowed } from "../_shared/auth.ts";
// Il lettore e' condiviso e testato: quello che gira qui e' esattamente il
// codice verificato dai test, non una copia parallela.
import { leggiFatturaPA, normalizzaPiva } from "../_shared/fatturapaReader.ts";
import { base64ToBytes } from "../_shared/base64.ts";
import { fileOriginale, xmlDaFile } from "../_shared/ricevuteOpenapi.ts";
import { archiviaOriginaleEmessa, originaleCorrispondeAllaFattura, scartaOriginaleNonCollegato } from "../_shared/originaleFatturaEmessa.ts";

const PROVIDER = "xml_import";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = { ...getCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    if (!token) return json({ error: "Autenticazione richiesta" }, 401);

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anon.auth.getUser(token);
    if (!user) return json({ error: "Non autorizzato" }, 401);

    const corpo = await req.json();
    const company_id = typeof corpo.company_id === "string" ? corpo.company_id : "";
    let xml_content = typeof corpo.xml_content === "string" ? corpo.xml_content : "";
    const base64 = typeof corpo.originale_base64 === "string" ? corpo.originale_base64 : "";
    if ((!xml_content && !base64) || !company_id) return json({ error: "XML o file originale e company_id richiesti" }, 400);
    if (xml_content.length > 20 * 1024 * 1024 || base64.length > 28 * 1024 * 1024) return json({ error: "File originale troppo grande (massimo 20 MB)." }, 413);

    // L'utente deve avere accesso all'azienda: qui si scrive sul fatturato.
    // Si usa l'helper condiviso perche' i modi legittimi sono piu' d'uno
    // (super_admin, azienda primaria, impersonation attiva).
    if (!(await canAccessCompany(supabase, user.id, company_id))) {
      return json({ error: "Accesso negato a questa azienda" }, 403);
    }
    const ruoliQui = await ruoliNellAzienda(supabase,user.id,company_id);
    const amministratore = ruoliQui.includes("company_admin") || (ruoliQui.includes("super_admin") && isSuperAdminEmailAllowed(user.email));
    if (!amministratore) {
      const { data: permessi } = await supabase.from("staff_permissions").select("can_view_billing")
        .eq("company_id",company_id).eq("user_id",user.id).maybeSingle();
      if (!ruoliQui.some(r => ["company_staff","salesperson"].includes(r)) || !permessi?.can_view_billing) {
        return json({ error:"Non hai il permesso di importare fatture per questa azienda." },403);
      }
    }

    // Il contenuto si ricava dal file, non si crede al testo dichiarato dal browser.
    let originale: Uint8Array;
    if (base64) {
      let dati: Uint8Array;
      try { dati = base64ToBytes(base64); } catch { return json({ error: "File originale non leggibile." }, 422); }
      if (dati.length > 20 * 1024 * 1024) return json({ error: "File originale troppo grande (massimo 20 MB)." }, 413);
      const xml = xmlDaFile(dati);
      if (!xml) return json({ error: "Il file originale non contiene una fattura elettronica leggibile." }, 422);
      xml_content = xml;
      originale = fileOriginale(dati);
    } else {
      const encoding = xml_content.match(/<\?xml[^?]*encoding\s*=\s*["']([^"']+)["']/i)?.[1];
      if (encoding && !/^(UTF-?8|US-ASCII)$/i.test(encoding)) {
        return json({ error: "Per conservare correttamente questa codifica, carica il file XML originale dalla pagina Importa XML, non il solo testo." }, 422);
      }
      originale = new TextEncoder().encode(xml_content);
      if (originale.length > 20 * 1024 * 1024) return json({ error: "File originale troppo grande (massimo 20 MB)." }, 413);
    }

    // deno_dom soddisfa l'interfaccia strutturalmente; il cast serve solo a
    // togliere di mezzo la differenza fra i tipi delle due implementazioni.
    const fattura = leggiFatturaPA(String(xml_content), new LettoreXmlMinimo());
    if (!fattura) return json({ error: "XML non leggibile come fattura elettronica." }, 422);

    // PALETTO 1 — la direzione la stabilisce il server.
    const { data: azienda } = await supabase
      .from("companies").select("vat_number, name").eq("id", company_id).maybeSingle();
    const pivaAzienda = normalizzaPiva(azienda?.vat_number);
    if (!pivaAzienda) {
      return json({ error: "Partita IVA dell'azienda non configurata: impossibile stabilire se la fattura e' emessa o ricevuta." }, 422);
    }
    if (fattura.cedentePiva !== pivaAzienda) {
      return json({
        error: `Non e' una fattura emessa da ${azienda?.name ?? "questa azienda"}: il cedente e' ${fattura.cedentePiva}. Se l'hai ricevuta importala tra le fatture ricevute.`,
      }, 422);
    }

    const externalId = `${fattura.numero}|${fattura.data}`;

    // Gia' importata da qui: e' un duplicato, non un errore.
    const { data: gia, error: errCerca } = await supabase
      .from("invoices").select("*")
      .eq("company_id", company_id)
      .eq("external_provider", PROVIDER)
      .eq("external_id", externalId)
      .maybeSingle();
    if (errCerca) return json({ error: "Impossibile verificare se la fattura è già importata. Riprova: nessun documento è stato creato." }, 500);
    if (gia) {
      if (gia.deleted_at) return json({ error: "La fattura è nel cestino. Non ho modificato né duplicato il documento." }, 409);
      if (gia.external_xml_url) return json({ success: true, duplicate: true, id: gia.id });
      const { data: righe, error: errRighe } = await supabase.from("invoice_lines").select("*").eq("invoice_id", gia.id);
      if (errRighe) return json({ error: "Impossibile verificare le righe della fattura già importata. Non ho modificato nulla." }, 500);
      if (!originaleCorrispondeAllaFattura(gia, fattura, righe ?? [])) {
        return json({ error: "Lo stesso numero è già importato, ma i dati o le righe non corrispondono all'XML. Non ho modificato né duplicato la fattura." }, 409);
      }
      const ref = await archiviaOriginaleEmessa(supabase, company_id, originale);
      const { data: completata, error: errCompleta } = await supabase.from("invoices")
        .update({ external_xml_url: ref }).eq("id", gia.id).eq("company_id", company_id)
        .eq("external_provider", PROVIDER).is("external_xml_url", null).select("id").maybeSingle();
      if (errCompleta || !completata) {
        await scartaOriginaleNonCollegato(supabase, ref);
        return json({ error: "Collegamento dell'originale non riuscito o completato da un'altra richiesta. Ricarica e riprova: i dati contabili non sono stati modificati." }, 409);
      }
      return json({ success: true, duplicate: true, completed: true, id: gia.id });
    }

    // PALETTO 2 — stesso numero ma altra provenienza: non si tocca.
    const { data: conflitto, error: errConflitto } = await supabase
      .from("invoices").select("id, external_provider")
      .eq("company_id", company_id)
      .eq("invoice_number", fattura.numero)
      .maybeSingle();
    if (errConflitto) return json({ error: "Impossibile verificare la numerazione esistente. Nessun documento è stato creato." }, 500);
    if (conflitto) {
      return json({
        error: `Il numero ${fattura.numero} esiste gia' in piattaforma${conflitto.external_provider ? ` (da ${conflitto.external_provider})` : " (emessa nativamente)"}. Non l'ho toccata: verifica quale delle due e' quella buona.`,
      }, 409);
    }

    // Lo storico non genera nuovi lead/automazioni contact_created. La RPC
    // recupera la rubrica fiscale e riusa solo contatti univoci già esistenti.

    // Se il file non si conserva, la nuova fattura non viene registrata solo a metà.
    const riferimentoOriginale = await archiviaOriginaleEmessa(supabase, company_id, originale);
    const { data: nuova, error: errIns } = await supabase.from("invoices").insert({
      company_id,
      document_type: fattura.documentType,
      // Emessa: e' gia' passata dal provider esterno. Mai "draft", che
      // rimetterebbe in gioco un invio allo SDI gia' avvenuto.
      status: "issued",
      invoice_number: fattura.numero,
      client_id: null,
      client_company_name: fattura.cliente.nome,
      client_vat_number: fattura.cliente.piva,
      client_fiscal_code: fattura.cliente.cf,
      client_address: fattura.cliente.indirizzo,
      client_city: fattura.cliente.citta,
      client_zip: fattura.cliente.cap,
      client_country: fattura.cliente.paese,
      client_pec: fattura.cliente.pec,
      client_sdi_code: fattura.cliente.sdi,
      issue_date: fattura.data,
      due_date: fattura.scadenza,
      subtotal: fattura.imponibile,
      tax_amount: fattura.imposta,
      total: fattura.totale,
      paid_amount: 0,
      payment_method: fattura.modalitaPagamento,
      bank_iban: fattura.iban,
      notes: "Importata da XML del provider esterno.",
      external_provider: PROVIDER,
      external_id: externalId,
      external_xml_url: riferimentoOriginale,
      last_synced_at: new Date().toISOString(),
      created_by: user.id,
    }).select("id").single();

    if (errIns || !nuova) {
      await scartaOriginaleNonCollegato(supabase, riferimentoOriginale);
      return json({ error: errIns?.message ?? "Inserimento non riuscito." }, 500);
    }

    if (fattura.righe.length > 0) {
      // Controllare SEMPRE l'errore: una testata senza righe e' una fattura
      // muta, e il silenzio qui l'ha gia' prodotta in passato.
      const { error: errRighe } = await supabase.from("invoice_lines").insert(
        fattura.righe.map((r) => ({ ...r, invoice_id: nuova.id })),
      );
      if (errRighe) {
        return json({
          success: true,
          id: nuova.id,
          warning: `Fattura importata ma senza dettaglio righe: ${errRighe.message}`,
        });
      }
    }

    const { data: cliente, error: clienteError } = await supabase.rpc("riconcilia_cliente_emessa_importata", {
      p_company_id: company_id, p_invoice_id: nuova.id, p_apply: true,
    });
    return json({ success: true, id: nuova.id, numero: fattura.numero, totale: fattura.totale,
      anagrafica_id: cliente?.anagrafica_id ?? null,
      cliente_operativo_mancante: cliente?.cliente_operativo_mancante ?? true,
      ...(clienteError || cliente?.status !== "ok" ? { warning: "Fattura importata. Anagrafica cliente da verificare dal dettaglio: " + (cliente?.motivo || "recupero non riuscito") } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("[importa-fattura-attiva-xml]", message);
    return json({ error: message }, 500);
  }
});
