import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

// HTML entity escape for any user-controlled value rendered into the markup.
// Prevents XSS via labels, placeholders, options, theme strings, etc.
function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Whitelist for CSS values inserted in <style> (color/family) — strip anything
// that could break out of the rule (quotes, braces, parens, semicolons, <, >).
function cssSafe(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  const v = String(value).replace(/[<>"'`{}();\\\n\r]/g, "").trim();
  return v.length > 0 ? v : fallback;
}

// Intero clampato in un range (per larghezza/arrotondamento del layout).
function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Safe insertion of a string inside a JS single-quoted literal.
function jsStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
}

// JSON da inserire dentro un <script>: oltre alle virgolette vanno neutralizzati
// `<` e `>` (altrimenti un `</script>` dentro un nome di campo chiude il blocco)
// e i due separatori di riga che JSON ammette ma JavaScript no.
function jsonSicuro(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Quali campi del modulo contengono email, telefono, nome e cognome. Servono
// alla pagina che ci ospita per le conversioni avanzate di Google, che vogliono
// il dato della persona e non solo l'evento. La regola e' la STESSA di
// form-submit (prima la mappatura dichiarata, poi il tipo, poi i nomi comuni):
// se le due divergono, l'opportunita' nel CRM e la conversione mandata a Google
// finirebbero su persone diverse.
function chiaviContatto(fields: any[]): Record<string, string[]> {
  const out: Record<string, string[]> = { email: [], first_name: [], last_name: [], phone: [] };

  for (const f of fields) {
    const chiave = String(f?.id || f?.name || "");
    if (!chiave) continue;
    const m = String(f?.mapping || f?.name || "").toLowerCase();
    const t = String(f?.type || "").toLowerCase();
    if (m === "email" || t === "email") out.email.push(chiave);
    else if (m === "first_name" || m === "nome") out.first_name.push(chiave);
    else if (m === "last_name" || m === "cognome") out.last_name.push(chiave);
    else if (m === "phone" || m === "telefono" || t === "phone") out.phone.push(chiave);
  }

  // Ripiego sui nomi comuni, identico a quello di form-submit.
  out.email.push("email", "Email", "EMAIL");
  out.first_name.push("first_name", "nome", "name", "Nome");
  out.last_name.push("last_name", "cognome", "surname", "Cognome");
  out.phone.push("phone", "telefono", "Phone", "Telefono");

  return out;
}

function renderField(f: any): string {
  const req = f.required ? "required" : "";
  const fieldKey = esc(f.id || f.name);
  const label = esc(f.label || f.name);
  const ph = esc(f.placeholder || "");

  switch (f.type) {
    case "heading":
      return `<h2 class="heading">${label}</h2>`;
    case "paragraph":
      return `<p class="paragraph">${label}</p>`;
    case "divider":
      return `<hr class="divider">`;
    case "hidden":
      return `<input type="hidden" name="${fieldKey}" value="${esc(f.defaultValue || '')}" data-default-value="${esc(f.defaultValue || '')}">`;
    case "textarea":
      return `<div class="field"><label>${label}${f.required ? ' *' : ''}</label><textarea name="${fieldKey}" ${req} rows="4" placeholder="${ph}"></textarea></div>`;
    case "select": {
      const opts = ((f.options || []) as string[]).map((o: string) => `<option value="${esc(o)}">${esc(o)}</option>`).join("");
      return `<div class="field"><label>${label}${f.required ? ' *' : ''}</label><select name="${fieldKey}" ${req}><option value="">Seleziona...</option>${opts}</select></div>`;
    }
    case "radio": {
      const radios = ((f.options || []) as string[]).map((o: string) =>
        `<label class="radio-opt"><input type="radio" name="${fieldKey}" value="${esc(o)}" ${req}> ${esc(o)}</label>`
      ).join("");
      return `<div class="field"><label>${label}${f.required ? ' *' : ''}</label><div class="radio-group">${radios}</div></div>`;
    }
    case "checkbox":
      return `<div class="field checkbox"><label><input type="checkbox" name="${fieldKey}" ${req}> ${label}</label></div>`;
    case "consent": {
      // Consenso privacy/marketing: checkbox + link cliccabile all'informativa.
      // Solo URL http/https (blocca javascript:/data: → XSS). Il valore spuntato
      // ("1") viene salvato nella submission come prova del consenso.
      const rawUrl = String(f.linkUrl ?? "");
      const safeUrl = /^https?:\/\//i.test(rawUrl) ? esc(rawUrl) : "";
      const linkText = esc(f.linkText || "Informativa privacy");
      const linkHtml = safeUrl
        ? ` <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`
        : "";
      return `<div class="field checkbox"><label><input type="checkbox" name="${fieldKey}" value="1" ${req}> <span>${label}${linkHtml}</span></label></div>`;
    }
    case "date":
      return `<div class="field"><label>${label}${f.required ? ' *' : ''}</label><input type="date" name="${fieldKey}" ${req}></div>`;
    default: {
      const inputType = f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "number" ? "number" : "text";
      return `<div class="field"><label>${label}${f.required ? ' *' : ''}</label><input type="${inputType}" name="${fieldKey}" ${req} placeholder="${ph}"></div>`;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const companyId = url.searchParams.get("company_id") || url.searchParams.get("company");

  if (!slug || !companyId) {
    return new Response("Missing slug or company_id", {
      status: 400,
      headers: { "Content-Type": "text/plain", ...getCorsHeaders(req) },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: form, error } = await supabase
    .from("lead_forms")
    .select("*")
    .eq("company_id", companyId)
    .eq("slug", slug)
    .eq("is_published", true)
    .eq("is_active", true)
    .single();

  if (error || !form) {
    return new Response("Form not found", {
      status: 404,
      headers: { "Content-Type": "text/plain", ...getCorsHeaders(req) },
    });
  }

  const fields = (form.fields as any[]) || [];
  const theme = (form.theme as any) || {};
  const settings = (form.settings as any) || {};

  const bgColor = cssSafe(theme.background_color, "#ffffff");
  const textColor = cssSafe(theme.text_color, "#1a1a1a");
  const accentColor = cssSafe(theme.accent_color, "#2563eb");
  const fontFamily = cssSafe(theme.font_family, "system-ui, sans-serif");
  // Layout configurabile: larghezza contenitore e arrotondamento angoli.
  const containerWidth = clampInt(theme.container_width, 520, 320, 900);
  const radius = clampInt(theme.border_radius, 8, 0, 28);
  const containerRadius = clampInt(theme.border_radius, 8, 0, 28) + 4;
  const formTitle = settings.title || form.name;
  const successTitle = theme.success_title || settings.success_title || "✓";
  const successMessage = settings.success_message || "Grazie! La tua richiesta è stata inviata.";
  const submitLabel = settings.submit_label || "Invia";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const fieldsHTML = fields.map(renderField).join("\n");

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(formTitle)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:${fontFamily};background:${bgColor};color:${textColor};min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .container{max-width:${containerWidth}px;width:100%;background:#fff;border-radius:${containerRadius}px;box-shadow:0 4px 24px rgba(0,0,0,0.08);padding:32px}
    h1{font-size:1.5rem;margin-bottom:8px}
    .desc{font-size:0.9rem;color:#666;margin-bottom:24px}
    .heading{font-size:1.15rem;font-weight:600;margin:20px 0 8px}
    .paragraph{font-size:0.85rem;color:#666;margin:8px 0 16px}
    .divider{border:none;border-top:1px solid #e5e7eb;margin:16px 0}
    .field{margin-bottom:16px}
    .field.checkbox{display:flex;align-items:flex-start;gap:8px}
    .field.checkbox label{display:flex;align-items:flex-start;gap:6px;font-size:0.85rem;font-weight:400;margin-bottom:0}
    .field.checkbox a{color:${accentColor};text-decoration:underline}
    .radio-group{display:flex;flex-direction:column;gap:6px;margin-top:4px}
    .radio-opt{display:flex;align-items:center;gap:6px;font-size:0.85rem;cursor:pointer}
    label{display:block;font-size:0.85rem;font-weight:500;margin-bottom:4px}
    input,textarea,select{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:${radius}px;font-size:0.9rem;font-family:inherit;outline:none;transition:border-color 0.2s}
    input:focus,textarea:focus,select:focus{border-color:${accentColor}}
    input[type=checkbox],input[type=radio]{width:auto;margin-top:2px}
    input[type=date]{color-scheme:light}
    button{width:100%;padding:12px;background:${accentColor};color:#fff;border:none;border-radius:${radius}px;font-size:1rem;font-weight:600;cursor:pointer;transition:opacity 0.2s}
    button:hover{opacity:0.9}
    button:disabled{opacity:0.5;cursor:not-allowed}
    .success{text-align:center;padding:40px 20px}
    .success h2{color:${accentColor};margin-bottom:8px}
    .error{color:#dc2626;font-size:0.85rem;margin-top:8px}
    .hidden{display:none}
  </style>
</head>
<body>
  <div class="container">
    <div id="formSection">
      <h1>${esc(formTitle)}</h1>
      ${form.description ? `<p class="desc">${esc(form.description)}</p>` : ""}
      <form id="leadForm">
        ${fieldsHTML}
        <button type="submit" id="submitBtn">${esc(submitLabel)}</button>
        <div id="errorMsg" class="error hidden"></div>
      </form>
    </div>
    <div id="successSection" class="success hidden">
      <h2 id="successTitle">${esc(successTitle)}</h2>
      <p id="successMsg">${esc(successMessage)}</p>
    </div>
  </div>
  <script>
  (function(){
    var CID='${jsStr(companyId)}';
    var BASE='${jsStr(supabaseUrl)}';

    function uuid(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16)});}

    // V4: localStorage/sessionStorage instead of cookies
    var vid=localStorage.getItem('_attr_vid');
    if(!vid){vid=uuid();localStorage.setItem('_attr_vid',vid);}
    var sid=sessionStorage.getItem('_attr_sid');
    var isNew=!sid;
    if(!sid){sid=uuid();sessionStorage.setItem('_attr_sid',sid);}
    window._attrSessionId=sid;
    window._attrVisitorId=vid;

    // L'origine della pagina che ci ospita. Dentro un iframe document.referrer
    // e' proprio quella, e il codice da incorporare fissa
    // referrerpolicy="strict-origin-when-cross-origin" apposta perche' ci arrivi
    // sempre. Email e telefono si mandano SOLO a un'origine precisa: con '*' li
    // leggerebbe qualunque sito che incorpora questo modulo, e oggi un sito
    // ospite il contenuto dell'iframe non lo puo' leggere.
    var ORIGINE_PADRE=(function(){
      try{return document.referrer?new URL(document.referrer).origin:null;}catch(e){return null;}
    })();

    // Quali chiavi del modulo contengono email/telefono/nome/cognome, nello
    // stesso ordine di priorita' che usa form-submit per il CRM.
    var CHIAVI_CONTATTO=${jsonSicuro(chiaviContatto(fields))};
    function valoreDi(dati,chiavi){
      for(var i=0;i<chiavi.length;i++){
        var v=dati[chiavi[i]];
        if(typeof v==='string'&&v.trim())return v.trim();
      }
      return null;
    }

    // Le conversioni avanzate di Google vogliono il telefono in E.164 (+39…).
    // Si normalizza solo quando il numero e' riconoscibile: meglio niente che un
    // prefisso inventato, che accoppierebbe la conversione alla persona
    // sbagliata. Il numero come l'ha scritto la persona viaggia comunque a parte.
    function e164(v){
      if(!v)return null;
      var s=String(v).replace(/[^\\d+]/g,'');
      if(!s)return null;
      if(s.indexOf('00')===0)s='+'+s.slice(2);
      if(s.charAt(0)==='+')return s.length>=9?s:null;
      // Prima i numeri nazionali, poi quelli che hanno gia' il 39 davanti:
      // 3931234567 e' un cellulare (prefisso 393), non «39 + 31234567».
      // In Italia lo zero dei fissi fa parte del numero anche in E.164:
      // 02 1234567 diventa +39021234567, non +3921234567.
      if(/^3[0-9]{8,9}$/.test(s))return '+39'+s;
      if(/^0[0-9]{5,10}$/.test(s))return '+39'+s;
      if(/^39[0-9]{8,11}$/.test(s))return '+'+s;
      return null;
    }

    // Dentro un iframe il body non deve seguire la viewport: con
    // min-height:100vh la scrollHeight del body vale SEMPRE almeno quanto
    // l'iframe, il genitore la riceve, aggiunge il proprio margine e
    // riallarga l'iframe — un ricorsivo che gonfiava il form fino al tetto
    // dei 2600px, con la card centrata in un mare di spazio vuoto.
    if(window.parent&&window.parent!==window){
      try{
        document.body.style.minHeight='0';
        document.body.style.alignItems='flex-start';
      }catch(e){}
    }
    function reportHeight(){
      if(!window.parent||window.parent===window)return;
      try{
        // L'altezza vera e' quella della card (.container) piu' i padding del
        // body: e' identica qualunque sia l'altezza dell'iframe, quindi il
        // dialogo col genitore converge invece di rincorrersi.
        var h=0;
        var c=document.querySelector('.container');
        if(c){
          var cs=window.getComputedStyle(document.body);
          h=Math.ceil(c.getBoundingClientRect().height
            +(parseFloat(cs.paddingTop)||0)
            +(parseFloat(cs.paddingBottom)||0));
        }
        if(!h){
          h=Math.max(
            document.documentElement.scrollHeight||0,
            document.body.scrollHeight||0,
            document.documentElement.offsetHeight||0,
            document.body.offsetHeight||0
          );
        }
        window.parent.postMessage({type:'eic-lead-form-height',slug:'${jsStr(form.slug)}',height:h},'*');
      }catch(e){}
    }
    if('ResizeObserver'in window){
      try{
        new ResizeObserver(reportHeight).observe(document.body);
        var _c=document.querySelector('.container');
        if(_c)new ResizeObserver(reportHeight).observe(_c);
      }catch(e){}
    }
    window.addEventListener('load',reportHeight);
    setTimeout(reportHeight,50);
    setTimeout(reportHeight,350);

    var p=new URLSearchParams(window.location.search);

    // Persist UTMs in localStorage
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){
      var v=p.get(k);if(v)localStorage.setItem('_attr_'+k,v);
    });
    ['gclid','wbraid','gbraid','fbclid','ttclid','msclkid','li_fat_id'].forEach(function(k){
      var v=p.get(k);if(v)localStorage.setItem('_attr_'+k,v);
    });
    function getUtm(k){return p.get(k)||localStorage.getItem('_attr_'+k)||null;}
    function getParamOrStored(k){return p.get(k)||localStorage.getItem('_attr_'+k)||null;}

    document.querySelectorAll('input[type="hidden"][data-default-value]').forEach(function(el){
      var key=el.getAttribute('data-default-value')||'';
      if(/^utm_/.test(key)){el.value=getUtm(key)||'';return;}
      if(['gclid','wbraid','gbraid','fbclid','ttclid','msclkid','li_fat_id'].indexOf(key)>=0){el.value=getParamOrStored(key)||'';return;}
      var fromUrl=p.get(key);
      if(fromUrl)el.value=fromUrl;
    });

    // Send attribution capture
    var payload={
      company_id:CID,session_id:sid,visitor_id:vid,
      landing_url:window.location.href,
      landing_page:window.location.pathname,
      referrer:document.referrer||null,
      user_agent:navigator.userAgent||null,
      utm_source:getUtm('utm_source'),utm_medium:getUtm('utm_medium'),
      utm_campaign:getUtm('utm_campaign'),utm_content:getUtm('utm_content'),
      utm_term:getUtm('utm_term'),
      gclid:getParamOrStored('gclid'),fbclid:getParamOrStored('fbclid'),
      wbraid:getParamOrStored('wbraid'),gbraid:getParamOrStored('gbraid'),
      ttclid:getParamOrStored('ttclid'),msclkid:getParamOrStored('msclkid'),
      li_fat_id:getParamOrStored('li_fat_id')
    };
    var hasAttr=payload.utm_source||payload.gclid||payload.wbraid||payload.gbraid||payload.fbclid||payload.ttclid||payload.msclkid||payload.li_fat_id;
    if(hasAttr||isNew){
      fetch(BASE+'/functions/v1/attribution-capture',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),keepalive:true
      }).catch(function(){});
    }

    // Form submit handler
    document.getElementById('leadForm').addEventListener('submit',function(e){
      e.preventDefault();
      var btn=document.getElementById('submitBtn');
      btn.disabled=true;btn.textContent='Invio...';
      document.getElementById('errorMsg').classList.add('hidden');
      var fd=new FormData(e.target);
      var data={};fd.forEach(function(v,k){data[k]=v;});
      fetch(BASE+'/functions/v1/form-submit',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          form_id:'${jsStr(form.id)}',
          data:data,
          session_id:window._attrSessionId||null,
          visitor_id:window._attrVisitorId||null,
          utm_source:getUtm('utm_source'),
          utm_medium:getUtm('utm_medium'),
          utm_campaign:getUtm('utm_campaign'),
          utm_content:getUtm('utm_content'),
          utm_term:getUtm('utm_term'),
          gclid:getParamOrStored('gclid'),
          wbraid:getParamOrStored('wbraid'),
          gbraid:getParamOrStored('gbraid'),
          fbclid:getParamOrStored('fbclid'),
          ttclid:getParamOrStored('ttclid'),
          msclkid:getParamOrStored('msclkid'),
          li_fat_id:getParamOrStored('li_fat_id')
        })
      }).then(function(r){return r.json()}).then(function(r){
        if(r.ok){
          // L'invio riuscito viene annunciato alla pagina che ci ospita. Dentro
          // un iframe il sito non puo' vedere il nostro submit: senza questo
          // messaggio Google Tag Manager non ha nessun evento da agganciare, ed
          // e' il motivo per cui le conversioni dai moduli incorporati non si
          // tracciavano. Va mandato PRIMA del redirect, altrimenti la pagina
          // cambia e il messaggio non parte.
          try{
            var messaggio={
              type:'eic-lead-form-submit',
              slug:'${jsStr(form.slug)}',
              form_id:'${jsStr(form.id)}',
              contact_id:r.contact_id||null,
              redirect_url:r.redirect_url||null
            };
            // I dati della persona viaggiano solo verso un'origine nota (vedi
            // ORIGINE_PADRE). Se non si riesce a stabilirla, l'evento parte
            // lo stesso — il tracciamento non si ferma — ma senza di essi.
            if(ORIGINE_PADRE){
              var tel=valoreDi(data,CHIAVI_CONTATTO.phone);
              messaggio.email=(function(e){return e?e.toLowerCase():null;})(valoreDi(data,CHIAVI_CONTATTO.email));
              messaggio.phone=tel;
              messaggio.phone_e164=e164(tel);
              messaggio.first_name=valoreDi(data,CHIAVI_CONTATTO.first_name);
              messaggio.last_name=valoreDi(data,CHIAVI_CONTATTO.last_name);
            }
            window.parent.postMessage(messaggio,ORIGINE_PADRE||'*');
          }catch(e){}
          if(r.redirect_url){
            // Redirect a livello di PAGINA INTERA (non solo dell'iframe): così sul
            // sito del cliente il visitatore atterra davvero su /grazie e il
            // tracking conversioni (GA/pixel) parte come una vera navigazione.
            // Fallback all'iframe se il top è inaccessibile (contesto sandboxed).
            // Un quarto di secondo di respiro prima di cambiare pagina: il
            // messaggio qui sopra e' appena stato messo in coda, e i tag di
            // Google Tag Manager sul sito devono fare in tempo a partire. Senza
            // questa pausa la navigazione puo' annullare la chiamata di
            // conversione, e il lead risulta arrivato ma non tracciato.
            setTimeout(function(){
              try{ window.top.location.href=r.redirect_url; }
              catch(e){ window.location.href=r.redirect_url; }
            },250);
            return;
          }
          if(r.success_title)document.getElementById('successTitle').textContent=r.success_title;
          if(r.success_message)document.getElementById('successMsg').textContent=r.success_message;
          document.getElementById('formSection').classList.add('hidden');
          document.getElementById('successSection').classList.remove('hidden');
          reportHeight();
        }else{
          throw new Error(r.error||'Errore');
        }
      }).catch(function(err){
        document.getElementById('errorMsg').textContent=err.message;
        document.getElementById('errorMsg').classList.remove('hidden');
        btn.disabled=false;btn.textContent='${jsStr(submitLabel)}';
        reportHeight();
      });
    });
  })();
  </script>
</body>
</html>`;

  // Track view
  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const encoder = new TextEncoder();
  const hashData = encoder.encode(clientIP + "view-salt");
  const hashBuf = await crypto.subtle.digest("SHA-256", hashData);
  const ipHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");

  await supabase.from("form_views").insert({
    form_id: form.id,
    company_id: companyId,
    ip_hash: ipHash,
    referrer: req.headers.get("referer") || null,
    user_agent: req.headers.get("user-agent") || null,
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", ...getCorsHeaders(req) },
  });
});
