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
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
// Il lettore e' condiviso e testato: quello che gira qui e' esattamente il
// codice verificato dai test, non una copia parallela.
import { leggiFatturaPA, normalizzaPiva, type LettoreXml } from "../_shared/fatturapaReader.ts";

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

    const { xml_content, company_id } = await req.json();
    if (!xml_content || !company_id) return json({ error: "xml_content e company_id richiesti" }, 400);

    // L'utente deve avere accesso all'azienda: qui si scrive sul fatturato.
    // Si usa l'helper condiviso perche' i modi legittimi sono piu' d'uno
    // (super_admin, azienda primaria, impersonation attiva).
    if (!(await canAccessCompany(supabase, user.id, company_id))) {
      return json({ error: "Accesso negato a questa azienda" }, 403);
    }

    // deno_dom soddisfa l'interfaccia strutturalmente; il cast serve solo a
    // togliere di mezzo la differenza fra i tipi delle due implementazioni.
    const fattura = leggiFatturaPA(String(xml_content), new DOMParser() as unknown as LettoreXml);
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
    const { data: gia } = await supabase
      .from("invoices").select("id")
      .eq("company_id", company_id)
      .eq("external_provider", PROVIDER)
      .eq("external_id", externalId)
      .maybeSingle();
    if (gia) return json({ success: true, duplicate: true, id: gia.id });

    // PALETTO 2 — stesso numero ma altra provenienza: non si tocca.
    const { data: conflitto } = await supabase
      .from("invoices").select("id, external_provider")
      .eq("company_id", company_id)
      .eq("invoice_number", fattura.numero)
      .maybeSingle();
    if (conflitto) {
      return json({
        error: `Il numero ${fattura.numero} esiste gia' in piattaforma${conflitto.external_provider ? ` (da ${conflitto.external_provider})` : " (emessa nativamente)"}. Non l'ho toccata: verifica quale delle due e' quella buona.`,
      }, 409);
    }

    // Cliente: si riusa il contatto esistente, altrimenti si crea. Best-effort:
    // se non riesce la fattura entra comunque, con i dati anagrafici in chiaro.
    let clientId: string | null = null;
    const chiave = fattura.cliente.piva || fattura.cliente.cf;
    if (chiave) {
      try {
        let q = supabase.from("marketing_contacts").select("id")
          .eq("company_id", company_id).is("deleted_at", null).limit(1);
        q = fattura.cliente.piva
          ? q.eq("vat_number", fattura.cliente.piva)
          : q.eq("fiscal_code", fattura.cliente.cf!);
        const { data: trovato } = await q.maybeSingle();
        if (trovato?.id) {
          clientId = trovato.id;
        } else {
          const { data: creato } = await supabase.from("marketing_contacts").insert({
            company_id,
            first_name: fattura.cliente.nome,
            company_name: fattura.cliente.nome,
            vat_number: fattura.cliente.piva,
            fiscal_code: fattura.cliente.cf,
            address: fattura.cliente.indirizzo,
            city: fattura.cliente.citta,
            postal_code: fattura.cliente.cap,
            country: fattura.cliente.paese,
            contact_type: "company",
            source: "fatturazione",
            tags: ["fatturazione"],
            unsubscribed: false,
            score: 0,
          }).select("id").single();
          clientId = creato?.id ?? null;
        }
      } catch { /* best-effort: l'anagrafica non deve bloccare la fattura */ }
    }

    const { data: nuova, error: errIns } = await supabase.from("invoices").insert({
      company_id,
      document_type: fattura.documentType,
      // Emessa: e' gia' passata dal provider esterno. Mai "draft", che
      // rimetterebbe in gioco un invio allo SDI gia' avvenuto.
      status: "issued",
      invoice_number: fattura.numero,
      client_id: clientId,
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
      last_synced_at: new Date().toISOString(),
      created_by: user.id,
    }).select("id").single();

    if (errIns || !nuova) {
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

    return json({ success: true, id: nuova.id, numero: fattura.numero, totale: fattura.totale });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("[importa-fattura-attiva-xml]", message);
    return json({ error: message }, 500);
  }
});
