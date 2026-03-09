import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function renderField(f: any): string {
  const req = f.required ? "required" : "";
  const fieldKey = f.id || f.name;
  const label = f.label || f.name;
  const ph = f.placeholder || "";

  switch (f.type) {
    case "heading":
      return `<h2 class="heading">${label}</h2>`;
    case "paragraph":
      return `<p class="paragraph">${label}</p>`;
    case "divider":
      return `<hr class="divider">`;
    case "hidden":
      return `<input type="hidden" name="${fieldKey}" value="${f.defaultValue || ''}">`;
    case "textarea":
      return `<div class="field"><label>${label}${f.required ? ' *' : ''}</label><textarea name="${fieldKey}" ${req} rows="4" placeholder="${ph}"></textarea></div>`;
    case "select": {
      const opts = ((f.options || []) as string[]).map((o: string) => `<option value="${o}">${o}</option>`).join("");
      return `<div class="field"><label>${label}${f.required ? ' *' : ''}</label><select name="${fieldKey}" ${req}><option value="">Seleziona...</option>${opts}</select></div>`;
    }
    case "radio": {
      const radios = ((f.options || []) as string[]).map((o: string) =>
        `<label class="radio-opt"><input type="radio" name="${fieldKey}" value="${o}" ${req}> ${o}</label>`
      ).join("");
      return `<div class="field"><label>${label}${f.required ? ' *' : ''}</label><div class="radio-group">${radios}</div></div>`;
    }
    case "checkbox":
      return `<div class="field checkbox"><label><input type="checkbox" name="${fieldKey}" ${req}> ${label}</label></div>`;
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
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const companyId = url.searchParams.get("company_id") || url.searchParams.get("company");

  if (!slug || !companyId) {
    return new Response("Missing slug or company_id", {
      status: 400,
      headers: { "Content-Type": "text/plain", ...corsHeaders },
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
      headers: { "Content-Type": "text/plain", ...corsHeaders },
    });
  }

  const fields = (form.fields as any[]) || [];
  const theme = (form.theme as any) || {};
  const settings = (form.settings as any) || {};

  const bgColor = theme.background_color || "#ffffff";
  const textColor = theme.text_color || "#1a1a1a";
  const accentColor = theme.accent_color || "#2563eb";
  const fontFamily = theme.font_family || "system-ui, sans-serif";
  const formTitle = settings.title || form.name;
  const successTitle = theme.success_title || settings.success_title || "✓";
  const successMessage = settings.success_message || "Grazie! La tua richiesta è stata inviata.";
  const submitLabel = settings.submit_label || "Invia";
  const redirectUrl = settings.redirectUrl || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const fieldsHTML = fields.map(renderField).join("\n");

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${formTitle}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:${fontFamily};background:${bgColor};color:${textColor};min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .container{max-width:520px;width:100%;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08);padding:32px}
    h1{font-size:1.5rem;margin-bottom:8px}
    .desc{font-size:0.9rem;color:#666;margin-bottom:24px}
    .heading{font-size:1.15rem;font-weight:600;margin:20px 0 8px}
    .paragraph{font-size:0.85rem;color:#666;margin:8px 0 16px}
    .divider{border:none;border-top:1px solid #e5e7eb;margin:16px 0}
    .field{margin-bottom:16px}
    .field.checkbox{display:flex;align-items:center;gap:8px}
    .field.checkbox label{display:flex;align-items:center;gap:6px;font-size:0.85rem}
    .radio-group{display:flex;flex-direction:column;gap:6px;margin-top:4px}
    .radio-opt{display:flex;align-items:center;gap:6px;font-size:0.85rem;cursor:pointer}
    label{display:block;font-size:0.85rem;font-weight:500;margin-bottom:4px}
    input,textarea,select{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;font-family:inherit;outline:none;transition:border-color 0.2s}
    input:focus,textarea:focus,select:focus{border-color:${accentColor}}
    input[type=checkbox],input[type=radio]{width:auto}
    input[type=date]{color-scheme:light}
    button{width:100%;padding:12px;background:${accentColor};color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;transition:opacity 0.2s}
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
      <h1>${formTitle}</h1>
      ${form.description ? `<p class="desc">${form.description}</p>` : ""}
      <form id="leadForm">
        ${fieldsHTML}
        <button type="submit" id="submitBtn">${submitLabel}</button>
        <div id="errorMsg" class="error hidden"></div>
      </form>
    </div>
    <div id="successSection" class="success hidden">
      <h2 id="successTitle">${successTitle}</h2>
      <p id="successMsg">${successMessage}</p>
    </div>
  </div>
  <script>
  (function(){
    var CID='${companyId}';
    var BASE='${supabaseUrl}';

    function uuid(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16)});}

    // V4: localStorage/sessionStorage instead of cookies
    var vid=localStorage.getItem('_attr_vid');
    if(!vid){vid=uuid();localStorage.setItem('_attr_vid',vid);}
    var sid=sessionStorage.getItem('_attr_sid');
    var isNew=!sid;
    if(!sid){sid=uuid();sessionStorage.setItem('_attr_sid',sid);}
    window._attrSessionId=sid;
    window._attrVisitorId=vid;

    var p=new URLSearchParams(window.location.search);

    // Persist UTMs in localStorage
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){
      var v=p.get(k);if(v)localStorage.setItem('_attr_'+k,v);
    });
    function getUtm(k){return p.get(k)||localStorage.getItem('_attr_'+k)||null;}

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
      gclid:p.get('gclid'),fbclid:p.get('fbclid'),
      ttclid:p.get('ttclid'),msclkid:p.get('msclkid'),
      li_fat_id:p.get('li_fat_id')
    };
    var hasAttr=payload.utm_source||payload.gclid||payload.fbclid||payload.ttclid||payload.msclkid||payload.li_fat_id;
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
          form_id:'${form.id}',
          data:data,
          session_id:window._attrSessionId||null,
          visitor_id:window._attrVisitorId||null,
          utm_source:getUtm('utm_source'),
          utm_medium:getUtm('utm_medium'),
          utm_campaign:getUtm('utm_campaign'),
          utm_content:getUtm('utm_content'),
          utm_term:getUtm('utm_term'),
          gclid:p.get('gclid')||null,
          fbclid:p.get('fbclid')||null,
          ttclid:p.get('ttclid')||null,
          msclkid:p.get('msclkid')||null,
          li_fat_id:p.get('li_fat_id')||null
        })
      }).then(function(r){return r.json()}).then(function(r){
        if(r.ok){
          if(r.redirect_url){window.location.href=r.redirect_url;return;}
          if(r.success_title)document.getElementById('successTitle').textContent=r.success_title;
          if(r.success_message)document.getElementById('successMsg').textContent=r.success_message;
          document.getElementById('formSection').classList.add('hidden');
          document.getElementById('successSection').classList.remove('hidden');
        }else{
          throw new Error(r.error||'Errore');
        }
      }).catch(function(err){
        document.getElementById('errorMsg').textContent=err.message;
        document.getElementById('errorMsg').classList.remove('hidden');
        btn.disabled=false;btn.textContent='${submitLabel}';
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
    headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
  });
});
