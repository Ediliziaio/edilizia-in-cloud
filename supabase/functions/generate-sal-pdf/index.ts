import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { logoDiRiserva } from "../_shared/logoAzienda.ts";

import {buildSalHtml,type ContrattoSal,type SalRecord} from "./render.ts";
import {maturatoPrecedente} from "../_shared/salNetto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if(req.method!=="POST")return new Response(JSON.stringify({error:"Metodo non consentito"}),{status:405,headers:{...getCorsHeaders(req),"Content-Type":"application/json"}});

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { sal_id, company_id, prepare_signature=false } = await req.json();
    if (!sal_id || !company_id) {
      return new Response(JSON.stringify({ error: "sal_id e company_id obbligatori" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify access
    try {
      await verifyCompanyAccess(supabase, userId, company_id);
    } catch {
      return new Response(JSON.stringify({ error: "Non autorizzato: accesso negato" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const {data:permitted,error:permissionError}=await supabase.rpc("has_permission_for_company",{_user_id:userId,_permission:"can_view_order_amounts",_company_id:company_id});
    if(permissionError || permitted!==true)return new Response(JSON.stringify({error:"Non hai il permesso di gestire questo documento SAL"}),{status:403,headers:{...getCorsHeaders(req),"Content-Type":"application/json"}});
    if(prepare_signature===true){
      const edit=await supabase.rpc("has_permission_for_company",{_user_id:userId,_permission:"can_edit_orders",_company_id:company_id});
      if(edit.error || edit.data!==true)return new Response(JSON.stringify({error:"Non hai il permesso di preparare il link SAL"}),{status:403,headers:{...getCorsHeaders(req),"Content-Type":"application/json"}});
    }

    // Fetch SAL with voci
    const { data: sal, error: salErr } = await supabase
      .from("sal_records")
      .select("*, sal_voci(id, descrizione, importo_contrattuale, percentuale_avanzamento, importo_sal, note)")
      .eq("id", sal_id)
      .eq("company_id", company_id)
      .single();

    if (salErr || !sal) {
      return new Response(JSON.stringify({ error: "SAL non trovato" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch order
    const { data: order } = await supabase
      .from("orders")
      .select("description, order_code, total_amount, company_id, indirizzo_lavori, work_address, customer:profiles!orders_customer_id_fkey(first_name,last_name,address)")
      .eq("id", sal.order_id)
      .eq("company_id",company_id)
      .single();
    if(!order)throw new Error("Commessa non disponibile o non coerente con il SAL");
    const {data:prior,error:priorError}=await supabase.from("sal_records").select("id,numero_sal,stato,importo_totale").eq("order_id",sal.order_id).eq("company_id",company_id).lt("numero_sal",sal.numero_sal).in("stato",["emesso","approvato","firmato"]).order("numero_sal",{ascending:false}).limit(2);
    if(priorError || (prior?.length===2 && prior[0].numero_sal===prior[1].numero_sal))throw new Error("Storico SAL non verificabile o numerazione duplicata");
    const previous=maturatoPrecedente(sal,prior??[]);
    // SAL di contratto di una commessa generale: periodo, ritenuta, anticipazione e netto.
    // Per i SAL di commessa non c'è la riga e il documento resta com'era.
    const {data:contrattoSal,error:contrattoError}=await supabase.from("generale_sal").select("periodo_dal,periodo_al,lordo,ritenuta_pct,ritenuta,recupero_pct,recupero_anticipazione,netto,riferimento_contratto,cig,cup,split_payment,reverse_charge").eq("sal_id",sal_id).eq("company_id",company_id).maybeSingle();
    // Tabella non ancora creata (funzione pubblicata prima della migrazione): come un SAL di commessa.
    if(contrattoError && !["42P01","PGRST205"].includes(contrattoError.code ?? ""))throw new Error("Dati del contratto del SAL non verificabili");
    const contratto=(contrattoSal ?? null) as ContrattoSal|null;

    // Fetch azienda
    const { data: azienda } = await supabase
      .from("anagrafica_azienda")
      .select("ragione_sociale, partita_iva, colore_primario, logo_url, indirizzo, citta, cap, telefono, email")
      .eq("company_id", company_id)
      .single();

    if (!azienda) {
      return new Response(JSON.stringify({ error: "Anagrafica azienda non configurata" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Il logo dell'anagrafica vince; vuoto vale quello aziendale (_shared/logoAzienda.ts).
    const { data: profiloAzienda } = await supabase
      .from("companies")
      .select("logo_url")
      .eq("id", company_id)
      .maybeSingle();
    azienda.logo_url = logoDiRiserva(azienda.logo_url, profiloAzienda?.logo_url);

    const salWithVoci: SalRecord = {
      ...sal,
      sal_voci: Array.isArray(sal.sal_voci) ? sal.sal_voci : [],
    };
    // Validate before granting a public signature link.
    buildSalHtml(salWithVoci,order,azienda,null,undefined,previous,contratto);

    // Token di firma per il committente: RIUSA quello ancora valido e non
    // firmato — prima ogni export ne inseriva uno nuovo, lasciando righe
    // orfane a ogni click e invalidando di fatto i PDF già inviati.
    let signToken:{token:string}|null=null;
    if(prepare_signature===true){
    if(!["emesso","approvato"].includes(sal.stato))return new Response(JSON.stringify({error:"Emetti e verifica il SAL prima di preparare il link cliente"}),{status:409,headers:{...getCorsHeaders(req),"Content-Type":"application/json"}});
    const { data: tokenEsistente,error:tokenReadError } = await supabase
      .from("sal_signature_tokens")
      .select("token")
      .eq("sal_id", sal_id)
      .eq("company_id",company_id)
      .is("signed_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if(tokenReadError)throw new Error("Link SAL non verificabile");
    if(tokenEsistente)signToken=tokenEsistente;
    else{
    const created=await supabase
      .from("sal_signature_tokens")
      .insert({
        sal_id,
        company_id,
        token: crypto.randomUUID(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      .select("token")
      .single();
    if(created.error || !created.data?.token)throw new Error("Creazione link SAL non confermata");
    signToken=created.data;
    }
    }

    // Branding dinamico
    const branding = await getBrandingForCompany(supabase, company_id);
    const brandFooter = branding.hidePoweredBy
      ? branding.platformName
      : `${branding.platformName} — ${branding.siteUrl.replace("https://", "")}`;

    const signatureUrl = signToken?.token
      ? `${branding.siteUrl}/firma-sal/${signToken.token}`
      : null;

    const html = buildSalHtml(salWithVoci, order, azienda, signatureUrl, brandFooter,previous,contratto);
    const filename = `sal-${sal.numero_sal}-${sal.data_emissione}.html`;

    return new Response(JSON.stringify({ html, filename, signature_url: signatureUrl, signature_token: signToken?.token }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-sal-pdf error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
