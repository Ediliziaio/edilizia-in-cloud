import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const companyId = url.searchParams.get("company_id");

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
  const successMessage = settings.success_message || "Grazie! La tua richiesta è stata inviata.";
  const submitLabel = settings.submit_label || "Invia";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const fieldsHTML = fields
    .map((f: any) => {
      const req = f.required ? "required" : "";
      const inputType = f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "number" ? "number" : "text";

      if (f.type === "textarea") {
        return `<div class="field"><label>${f.label || f.name}${f.required ? ' *' : ''}</label><textarea name="${f.name}" ${req} rows="4"></textarea></div>`;
      }
      if (f.type === "select" && f.options) {
        const opts = (f.options as string[]).map((o: string) => `<option value="${o}">${o}</option>`).join("");
        return `<div class="field"><label>${f.label || f.name}${f.required ? ' *' : ''}</label><select name="${f.name}" ${req}><option value="">Seleziona...</option>${opts}</select></div>`;
      }
      if (f.type === "checkbox") {
        return `<div class="field checkbox"><label><input type="checkbox" name="${f.name}" ${req}> ${f.label || f.name}</label></div>`;
      }
      return `<div class="field"><label>${f.label || f.name}${f.required ? ' *' : ''}</label><input type="${inputType}" name="${f.name}" ${req} placeholder="${f.placeholder || ''}"></div>`;
    })
    .join("\n");

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
    .field{margin-bottom:16px}
    .field.checkbox{display:flex;align-items:center;gap:8px}
    .field.checkbox label{display:flex;align-items:center;gap:6px;font-size:0.85rem}
    label{display:block;font-size:0.85rem;font-weight:500;margin-bottom:4px}
    input,textarea,select{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;font-family:inherit;outline:none;transition:border-color 0.2s}
    input:focus,textarea:focus,select:focus{border-color:${accentColor}}
    input[type=checkbox]{width:auto}
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
      <h2>✓</h2>
      <p>${successMessage}</p>
    </div>
  </div>
  <script>
  (function(){
    var params=new URLSearchParams(window.location.search);
    document.getElementById('leadForm').addEventListener('submit',function(e){
      e.preventDefault();
      var btn=document.getElementById('submitBtn');
      btn.disabled=true;btn.textContent='Invio...';
      document.getElementById('errorMsg').classList.add('hidden');
      var fd=new FormData(e.target);
      var data={};fd.forEach(function(v,k){data[k]=v;});
      fetch('${supabaseUrl}/functions/v1/form-submit',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          form_id:'${form.id}',
          data:data,
          session_id:getCookie('_attr_sid')||null,
          utm_source:params.get('utm_source'),
          utm_medium:params.get('utm_medium'),
          utm_campaign:params.get('utm_campaign'),
          utm_content:params.get('utm_content'),
          utm_term:params.get('utm_term')
        })
      }).then(function(r){return r.json()}).then(function(r){
        if(r.ok){
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
    function getCookie(n){var m=document.cookie.match(new RegExp('(^| )'+n+'=([^;]+)'));return m?m[2]:null;}
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
