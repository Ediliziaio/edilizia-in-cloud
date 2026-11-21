// 10/11/2026: le sottofasi sotto ogni fase (sal_voci_sottofasi), con la % del SAL precedente per sottofase; «dettaglio_sottofasi: false» per il verbale breve.
// 10/11/2026: stile unico dei documenti (_shared/stileDocumenti.ts): testata col logo a sinistra e il titolo a destra, filetto d'accento, tabelle e riquadri tenui, dati societari nel piè; accento dal colore della veste o del marchio (_shared/coloreMarchioAzienda.ts).
// 10/11/2026: veste propria dell'azienda nel verbale (logo grande, piè proprio: _shared/vesteHtml.ts) e colonna «Voce» che non spezza le parole (render.ts).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { leggiAziendaDocumento } from "../_shared/aziendaDocumento.ts";
import { leggiColoreMarchio } from "../_shared/coloreMarchioAzienda.ts";

import {buildSalHtml,chiaveVoce,type ContrattoSal,type SalExtra,type SalRecord} from "./render.ts";
import {maturatoPrecedente} from "../_shared/salNetto.ts";
import {valoreContrattoSal,variantiAlVerbale} from "./contract.ts";

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

    const { sal_id, company_id, prepare_signature=false, foto_ids, allegati, dettaglio_sottofasi, formato } = await req.json();
    if (formato != null && formato !== "completo" && formato !== "periodo" && formato !== "sintetico") {
      return new Response(JSON.stringify({ error: "Versione del verbale non valida" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
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

    const { data: riferimentoSal, error: salErr } = await supabase
      .from("sal_records")
      .select("order_id,company_id")
      .eq("id", sal_id)
      .eq("company_id", company_id)
      .single();

    if (salErr || !riferimentoSal) {
      return new Response(JSON.stringify({ error: "SAL non trovato" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader, "x-azienda-scheda": riferimentoSal.company_id } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: visibile, error: visibilityError } = await caller
      .from("orders_visibili")
      .select("id")
      .eq("id", riferimentoSal.order_id)
      .eq("company_id", riferimentoSal.company_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (visibilityError || !visibile) {
      return new Response(JSON.stringify({ error: "Non hai accesso alla commessa di questo SAL" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (prepare_signature === true) {
      const { data: modificabile, error: editError } = await caller.rpc("puo_modificare_commessa", { p_order_id: riferimentoSal.order_id });
      if (editError || modificabile !== true) {
        return new Response(JSON.stringify({ error: "Non hai il permesso di preparare il link per questa commessa" }), {
          status: 403,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    const { data: sal, error: letturaSalError } = await supabase
      .from("sal_records")
      .select("*, sal_voci(id, fase_id, descrizione, importo_contrattuale, percentuale_avanzamento, importo_sal, note, sal_voci_sottofasi(sottofase_id, posizione, descrizione, unita, quantita_contratto, quantita_a_oggi, importo_contrattuale, percentuale_avanzamento, importo_sal))")
      .eq("id", sal_id)
      .eq("company_id", riferimentoSal.company_id)
      .eq("order_id", riferimentoSal.order_id)
      .single();
    if (letturaSalError || !sal) throw new Error("Non è stato possibile leggere il SAL. Aggiorna la commessa e riprova.");

    // Fetch order
    const { data: order } = await supabase
      .from("orders")
      .select("description, order_code, total_amount, vat_rate, company_id, indirizzo_lavori, work_address, customer:profiles!orders_customer_id_fkey(first_name,last_name,address)")
      .eq("id", sal.order_id)
      .eq("company_id",company_id)
      .single();
    if(!order)throw new Error("Commessa non disponibile o non coerente con il SAL");
    const orderForPrint = { ...order, customer: Array.isArray(order.customer) ? order.customer[0] ?? null : order.customer };
    const {data:prior,error:priorError}=await supabase.from("sal_records").select("id,numero_sal,stato,importo_totale").eq("order_id",sal.order_id).eq("company_id",company_id).lt("numero_sal",sal.numero_sal).in("stato",["emesso","approvato","firmato"]).order("numero_sal",{ascending:false}).limit(2);
    if(priorError || (prior?.length===2 && prior[0].numero_sal===prior[1].numero_sal))throw new Error("Storico SAL non verificabile o numerazione duplicata");
    const previous=maturatoPrecedente(sal,prior??[]);
    // Voci dell'ultimo SAL emesso: nel verbale, voce per voce, il già maturato e la quota di questo SAL.
    // Se non si leggono il verbale resta completo, col solo cumulativo.
    const ultimoPrecedente=(prior??[]).find(p=>p.id!==sal.id);
    const { data: contrattoEmesso, error: contrattoEmessoError } = await supabase.from("sal_contratto_emesso")
      .select("importo_base,aliquota_iva,varianti").eq("sal_id",sal.id).eq("company_id",company_id).maybeSingle();
    if (contrattoEmessoError) throw new Error("Contratto del verbale non leggibile: riprova");
    let valoreContratto;
    if (contrattoEmesso) {
      valoreContratto = valoreContrattoSal(contrattoEmesso.importo_base, contrattoEmesso.varianti);
    } else {
      const { data: variazioni, error: variantiError, count: variantiCount } = await supabase.from("ordini_variazione")
        .select("status,impatto_economico,approval_recorded_at,firmato_il,offline_signed_on",{count:"exact"})
        .eq("order_id",sal.order_id).eq("company_id",company_id).eq("status","approvato");
      if (variantiError || variantiCount == null || variantiCount !== (variazioni?.length ?? 0))
        throw new Error("Varianti approvate non verificabili: riprova prima di stampare il verbale");
      valoreContratto = valoreContrattoSal(order.total_amount, variantiAlVerbale(variazioni ?? [], sal));
    }
    const extra: SalExtra = {
      aliquotaIva: contrattoEmesso ? contrattoEmesso.aliquota_iva : order.vat_rate ?? null,
      importoContratto: valoreContratto.totale,
      importoVariantiApprovate: valoreContratto.varianti,
      dettaglioSottofasi: dettaglio_sottofasi !== false,
      formato: prepare_signature === true ? "completo" : formato ?? "completo",
      esisteSalPrecedente: !!ultimoPrecedente,
    };
    // Il certificato di pagamento (15/11/2026): con il certificato il verbale dice il netto da pagare, come la fattura.
    const {data:certificato,error:certificatoError}=await supabase.from("sal_certificati").select("lavori_contrattuali,varianti,ritenuta_pct,ritenuta,recupero_anticipazione,altre_detrazioni,altre_detrazioni_nota,acconti_precedenti,rinviato,netto").eq("sal_id",sal.id).eq("company_id",company_id).maybeSingle();
    if(certificatoError)throw new Error("Certificato di pagamento non leggibile: riprova");
    extra.certificato=(certificato ?? null) as SalExtra["certificato"];
    if(ultimoPrecedente){
      const { data: vociPrec, error: vociPrecError, count: numeroVoci } = await supabase.from("sal_voci")
        .select("fase_id,descrizione,importo_sal,sal_voci_sottofasi(sottofase_id,percentuale_avanzamento,quantita_a_oggi,unita,importo_sal)", { count: "exact" })
        .eq("sal_id", ultimoPrecedente.id);
      if (!vociPrecError && Array.isArray(vociPrec) && numeroVoci === vociPrec.length && vociPrec.length > 0) {
        const perNome = new Map<string, number>();
        const perFase = new Map<string, number>();
        const sotto: NonNullable<SalExtra["sottofasiPrecedenti"]> = {};
        const misure: NonNullable<SalExtra["misurePrecedenti"]> = {};
        for (const v of vociPrec) {
          const chiave = chiaveVoce(v.descrizione);
          perNome.set(chiave, (perNome.get(chiave) ?? 0) + Number(v.importo_sal));
          if (v.fase_id) perFase.set(v.fase_id, (perFase.get(v.fase_id) ?? 0) + Number(v.importo_sal));
          for (const d of v.sal_voci_sottofasi ?? []) {
            if (!d.sottofase_id) continue;
            sotto[d.sottofase_id] = Number(d.percentuale_avanzamento) || 0;
            misure[d.sottofase_id] = { quantita: d.quantita_a_oggi, unita: d.unita, importo: d.importo_sal };
          }
        }
        extra.vociPrecedenti = Object.fromEntries(perNome);
        extra.fasiPrecedenti = Object.fromEntries(perFase);
        extra.sottofasiPrecedenti = sotto;
        extra.misurePrecedenti = misure;
      }
    }
    // Le foto scelte per il verbale: solo di questa commessa, firmate per il tempo di stampare.
    const idFoto=Array.isArray(foto_ids) ? foto_ids.filter((x:unknown):x is string=>typeof x==="string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0,12) : [];
    if(idFoto.length){
      const {data:righeFoto,error:fotoError}=await supabase.from("foto_cantiere").select("id,storage_path,taken_at,descrizione").in("id",idFoto).eq("order_id",sal.order_id).eq("company_id",company_id);
      if(fotoError)throw new Error("Foto del verbale non disponibili");
      const inOrdine=idFoto.map(id=>(righeFoto??[]).find(f=>f.id===id)).filter((f):f is NonNullable<typeof f>=>!!f);
      const {data:firmate,error:firmaError}=await supabase.storage.from("foto-cantiere").createSignedUrls(inOrdine.map(f=>f.storage_path),3600);
      if(firmaError)throw new Error("Foto del verbale non disponibili");
      extra.foto=inOrdine.flatMap((f,i)=>{const url=firmate?.[i]?.signedUrl;return url ? [{url,data:f.taken_at,didascalia:f.descrizione}] : [];});
    }
    if(Array.isArray(allegati))extra.allegati=allegati.filter((x:unknown):x is string=>typeof x==="string" && !!x.trim()).map((x:string)=>x.trim().slice(0,200)).slice(0,20);
    // SAL di contratto di una commessa generale: periodo, ritenuta, anticipazione e netto.
    // Per i SAL di commessa non c'è la riga e il documento resta com'era.
    const {data:contrattoSal,error:contrattoError}=await supabase.from("generale_sal").select("periodo_dal,periodo_al,lordo,ritenuta_pct,ritenuta,recupero_pct,recupero_anticipazione,netto,riferimento_contratto,cig,cup,split_payment,reverse_charge").eq("sal_id",sal_id).eq("company_id",company_id).maybeSingle();
    // Tabella non ancora creata (funzione pubblicata prima della migrazione): come un SAL di commessa.
    if(contrattoError && !["42P01","PGRST205"].includes(contrattoError.code ?? ""))throw new Error("Dati del contratto del SAL non verificabili");
    const contratto=(contrattoSal ?? null) as ContrattoSal|null;

    // Fetch azienda (e il colore del marchio, per l'accento se l'anagrafica non ne ha uno)
    const [anagrafica, coloreMarchio] = await Promise.all([leggiAziendaDocumento(supabase, company_id), leggiColoreMarchio(supabase, company_id)]);
    const azienda = anagrafica ? { ...anagrafica, colore_marchio: coloreMarchio } : null;

    if (!azienda) {
      return new Response(JSON.stringify({ error: "Dati dell'azienda non trovati" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const salWithVoci: SalRecord = {
      ...sal,
      sal_voci: Array.isArray(sal.sal_voci) ? sal.sal_voci : [],
    };
    // Validate before granting a public signature link.
    buildSalHtml(salWithVoci,orderForPrint,azienda,null,undefined,previous,contratto,extra);

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

    const html = buildSalHtml(salWithVoci, orderForPrint, azienda, signatureUrl, brandFooter,previous,contratto,extra);
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
