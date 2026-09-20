import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { corsHeaders } from "../_shared/headers.ts";
import { aggiornaStatoDaNotifica } from "../_shared/sdiInvioGuard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Require webhook secret
    const secret = Deno.env.get("BILLING_WEBHOOK_SECRET");
    if (!secret) {
      console.error("BILLING_WEBHOOK_SECRET not configured — rejecting webhook");
      return new Response("Server configuration error", { status: 500 });
    }

    // Verify signature
    const signature = req.headers.get("x-webhook-signature") || req.headers.get("x-signature");
    if (!signature) {
      // Log rejected attempt
      await supabase.from("sdi_log").insert({
        company_id: null as unknown as string,
        evento: "webhook_rejected",
        messaggio: "Missing signature header",
      }).then(() => {}, () => {});
      return new Response("Unauthorized: missing signature", { status: 401 });
    }

    const body = await req.text();

    // HMAC verification
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const expectedSig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");

    if (signature !== expectedSig) {
      await supabase.from("sdi_log").insert({
        company_id: null as unknown as string,
        evento: "webhook_rejected",
        messaggio: "Invalid signature",
      }).then(() => {}, () => {});
      return new Response("Unauthorized: invalid signature", { status: 401 });
    }

    // Parse notification from XML body using DOMParser (deno-dom WASM)
    const xmlDoc = new DOMParser().parseFromString(body, "text/xml");
    if (!xmlDoc) {
      await supabase.from("sdi_log").insert({
        company_id: null as unknown as string,
        evento: "webhook_parse_failed",
        messaggio: "XML body non parsabile",
        xml_content: body.slice(0, 5000),
      }).then(() => {}, () => {});
      return new Response("Bad request: invalid XML", { status: 400 });
    }
    const getTag = (tag: string): string | null => {
      // getElementsByTagName, con fallback che ignora il prefisso namespace
      // (ns:TipoNotifica). `localName` è una proprietà DOM, NON un attributo,
      // quindi il vecchio selettore [localName="..."] non matchava mai.
      let el = xmlDoc.getElementsByTagName(tag)[0];
      if (!el) {
        const all = xmlDoc.getElementsByTagName("*");
        for (let i = 0; i < all.length; i++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((all[i] as any).localName === tag) { el = all[i]; break; }
        }
      }
      return el?.textContent?.trim() || null;
    };

    const tipoNotifica = getTag("TipoNotifica") || getTag("tipo_notifica") || "";
    const idTrasmissione = getTag("IdentificativoSdI") || getTag("sdi_id") || "";
    const erroriRaw = getTag("Errore") || getTag("ListaErrori");

    if (!idTrasmissione) {
      return new Response("Missing IdentificativoSdI", { status: 400 });
    }

    // Il documento si cerca su DUE colonne. `sdi_id_trasmissione` contiene
    // l'identificativo INTERNO del provider (quello che openapi restituisce
    // all'invio), mentre la notifica porta l'IdentificativoSdI, che è un altro
    // numero: cercando solo sulla prima colonna ogni notifica finiva in
    // «webhook_unknown» con HTTP 200 e lo stato non cambiava mai.
    // sdi_identificativo lo riempie sdi-stato-tick quando il provider lo dà.
    // L'identificativo finisce dentro un filtro `or`, dove virgole e parentesi
    // hanno un significato: si tiene solo quello che un identificativo può
    // contenere davvero.
    const idPulito = String(idTrasmissione).replace(/[^A-Za-z0-9._-]/g, "");
    const { data: doc } = idPulito
      ? await supabase
        .from("documenti_fiscali")
        .select("id, company_id, stato")
        .or(`sdi_id_trasmissione.eq.${idPulito},sdi_identificativo.eq.${idPulito}`)
        .limit(1)
        .maybeSingle()
      : { data: null };

    if (!doc) {
      // Log unknown SDI ID
      await supabase.from("sdi_log").insert({
        company_id: null as unknown as string,
        evento: "webhook_unknown",
        sdi_id: idTrasmissione,
        messaggio: `Documento non trovato per SDI ID: ${idTrasmissione}`,
        xml_content: body.slice(0, 5000),
      }).then(() => {}, () => {});
      return new Response("OK", { status: 200 });
    }

    // Map notification type to new stato
    let newStato: string | null = null;
    const tipo = tipoNotifica.toUpperCase();

    switch (tipo) {
      case "RC":
        newStato = "consegnata";
        break;
      case "NS":
        newStato = "rifiutata";
        break;
      case "MC":
        // Mancata consegna — SDI deposits in cassetto fiscale, keep current stato
        newStato = null;
        break;
      case "EC": {
        // Notifica Esito Committente: l'esito reale è nell'elemento <Esito>
        // (EC01 = accettazione, EC02 = rifiuto). Leggerlo via getTag/parser è
        // robusto; il vecchio body.includes("EC01"/"EC02") su tutto l'XML poteva
        // matchare la stringa ovunque (es. dentro un id o un riferimento).
        const esito = (getTag("Esito") || "").toUpperCase();
        if (esito === "EC01") {
          newStato = "accettata";
        } else if (esito === "EC02") {
          newStato = "rifiutata";
        }
        break;
      }
      case "DT":
        newStato = "accettata"; // Tacit acceptance
        break;
      default:
        // Unknown type, just log
        break;
    }

    // Se il documento è in trasmissione (claim atomico 'in_invio' di invia-sdi),
    // NON sovrascrivere lo stato: l'esito sarà impostato da invia-sdi al termine
    // dell'invio. Registriamo comunque sdi_stato e la notifica per non perderla.
    // (Fast-path: la vera guardia è atomica, nell'update dello stato più sotto.)
    if (doc.stato === "in_invio") {
      newStato = null;
    }

    // Update metadati SDI (sempre, anche durante un invio in corso)
    const updateData: Record<string, any> = {
      sdi_stato: tipo || tipoNotifica,
      sdi_notifica_tipo: tipoNotifica,
    };
    if (tipo === "RC") updateData.sdi_data_consegna = new Date().toISOString();
    if (erroriRaw) updateData.sdi_errori = [{ tipo: tipoNotifica, messaggio: erroriRaw }];

    await supabase.from("documenti_fiscali")
      .update(updateData)
      .eq("id", doc.id);

    // Update stato con guardia ATOMICA anti-TOCTOU: se tra la lettura di
    // doc.stato e questo punto invia-sdi ha fatto il claim ('in_invio'),
    // il .neq() a livello DB impedisce la sovrascrittura.
    if (newStato) {
      await aggiornaStatoDaNotifica(supabase, doc.id, newStato);
    }

    // Log
    await supabase.from("sdi_log").insert({
      company_id: doc.company_id,
      documento_id: doc.id,
      evento: "notifica_sdi",
      sdi_id: idTrasmissione,
      tipo_notifica: tipoNotifica,
      messaggio: `Notifica ${tipoNotifica}${newStato ? ` → stato: ${newStato}` : ""}`,
      xml_content: body.slice(0, 5000),
    });

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("sdi-webhook error:", e);
    return new Response("Internal error", { status: 500 });
  }
});

// extractTag rimossa — sostituita con DOMParser inline (supporta CDATA, namespace, whitespace)
