type FormFieldDraft = {
  id?: string;
  name?: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  mapping?: string;
  defaultValue?: string;
  linkUrl?: string;
  linkText?: string;
};

type LeadFormDraft = {
  name?: string | null;
  slug?: string | null;
  fields?: FormFieldDraft[] | null;
  settings?: Record<string, unknown> | null;
};

const STRUCTURAL_TYPES = new Set(["heading", "paragraph", "divider"]);
const DATALESS_TYPES = new Set(["heading", "paragraph", "divider"]);
const OPTION_TYPES = new Set(["select", "radio"]);
const CONTACT_CAPTURE_MAPPINGS = new Set(["email", "phone", "telefono"]);

export function sanitizeLeadFormSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function sanitizeLeadFormFieldName(value: string, fallback = "campo") {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  return normalized || fallback;
}

export function buildUniqueFieldName(baseName: string, existingNames: readonly string[]) {
  const used = new Set(existingNames.map((name) => sanitizeLeadFormFieldName(name)));
  const base = sanitizeLeadFormFieldName(baseName);
  let nextName = base;
  let suffix = 2;

  while (used.has(nextName)) {
    nextName = `${base}_${suffix}`;
    suffix += 1;
  }

  return nextName;
}

export function normalizeLeadFormOptions(options: readonly string[] | undefined) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const option of options ?? []) {
    const value = String(option ?? "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

export function normalizeLeadFormFields(fields: readonly FormFieldDraft[] | undefined | null) {
  const usedNames: string[] = [];

  return (fields ?? []).map((field, index) => {
    const type = field.type || "text";
    const isDataless = DATALESS_TYPES.has(type);
    const baseLabel = String(field.label ?? "").trim() || (type === "divider" ? "Separatore" : `Campo ${index + 1}`);
    const normalizedName = isDataless
      ? (field.name || `${type}_${index + 1}`)
      : buildUniqueFieldName(field.name || baseLabel, usedNames);

    if (!isDataless) usedNames.push(normalizedName);

    return {
      ...field,
      id: field.id || crypto.randomUUID(),
      name: normalizedName,
      label: baseLabel,
      type,
      required: !STRUCTURAL_TYPES.has(type) && type !== "hidden" ? Boolean(field.required) : false,
      placeholder: field.placeholder?.trim() || "",
      mapping: field.mapping?.trim() || undefined,
      defaultValue: field.defaultValue?.trim() || undefined,
      options: OPTION_TYPES.has(type) ? normalizeLeadFormOptions(field.options) : undefined,
      // Solo per i campi "consent": link all'informativa privacy.
      linkUrl: type === "consent" ? (field.linkUrl?.trim() || undefined) : undefined,
      linkText: type === "consent" ? (field.linkText?.trim() || undefined) : undefined,
    };
  });
}

export function validateLeadFormDraft(form: LeadFormDraft, options: { publishing?: boolean } = {}) {
  const errors: string[] = [];
  const name = String(form.name ?? "").trim();
  const slug = sanitizeLeadFormSlug(String(form.slug ?? ""));
  const fields = form.fields ?? [];
  const settings = form.settings ?? {};

  if (!name) errors.push("Inserisci un nome form.");
  if (!slug) errors.push("Inserisci uno slug URL valido.");

  const fieldNames = new Set<string>();
  let hasContactCaptureField = false;

  fields.forEach((field, index) => {
    const type = field.type || "text";
    const isDataless = DATALESS_TYPES.has(type);
    const label = String(field.label ?? "").trim();
    const name = sanitizeLeadFormFieldName(field.name || label);

    if (type !== "divider" && !label) {
      errors.push(`Il campo ${index + 1} deve avere una label.`);
    }

    if (!isDataless) {
      if (!name) errors.push(`Il campo ${label || index + 1} deve avere un nome tecnico.`);
      if (fieldNames.has(name)) errors.push(`Il nome campo "${name}" è duplicato.`);
      fieldNames.add(name);
    }

    if (OPTION_TYPES.has(type) && normalizeLeadFormOptions(field.options).length === 0) {
      errors.push(`Il campo "${label || name}" deve avere almeno un'opzione.`);
    }

    const mapping = String(field.mapping || field.name || "").toLowerCase();
    if (type === "email" || type === "phone" || CONTACT_CAPTURE_MAPPINGS.has(mapping)) {
      hasContactCaptureField = true;
    }
  });

  if (options.publishing) {
    if (fields.length === 0) errors.push("Aggiungi almeno un campo prima di pubblicare.");
    if (!hasContactCaptureField) {
      errors.push("Per pubblicare serve almeno un campo email o telefono mappato al contatto.");
    }
  }

  const redirectUrl = String(settings.redirectUrl ?? "").trim();
  if (redirectUrl && !/^https?:\/\//i.test(redirectUrl)) {
    errors.push("L'URL redirect deve iniziare con http:// o https://.");
  }

  const notificationEmail = String(settings.notification_email ?? "").trim();
  if (notificationEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)) {
    errors.push("L'email di notifica non è valida.");
  }

  return {
    ok: errors.length === 0,
    errors,
    normalizedSlug: slug,
  };
}

/**
 * Base URL pubblica su cui è servito il proxy /f del form (dominio app, NON
 * *.supabase.co: lì l'HTML verrebbe riscritto a text/plain e l'iframe mostra
 * il sorgente). Configurabile via env, con fallback all'origin corrente in dev
 * e al dominio app in produzione.
 */
export function getLeadFormBaseUrl(): string {
  const configured =
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ||
    (import.meta.env.VITE_APP_URL as string | undefined);
  if (configured) return String(configured).trim().replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return window.location.origin.replace(/\/+$/, "");
    }
  }
  return "https://app.ediliziaincloud.com";
}

/**
 * URL pubblico del form da aprire/incorporare. Punta al proxy Cloudflare Pages
 * /f (vedi functions/f.js) sul dominio app, che ri-serve l'HTML dell'edge
 * form-render come text/html framebile.
 *
 * @param baseUrl base URL del dominio app (usa getLeadFormBaseUrl()).
 */
export function buildLeadFormPublicUrl(baseUrl: string | undefined, slug: string, companyId: string) {
  const appBase = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!appBase || !slug || !companyId) return null;
  const params = new URLSearchParams({ slug, company_id: companyId });
  return `${appBase}/f?${params.toString()}`;
}

type LeadFormEmbedOptions = {
  slug: string;
  title?: string;
  minHeight?: number;
  maxWidth?: number;
};

function clampEmbedNumber(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(Number(value))));
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeInlineJs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
}

export function normalizeEmbedDimension(value: unknown, fallback: number, min: number, max: number) {
  if (value === null || value === undefined) return fallback;
  const rawValue = typeof value === "number" ? value : String(value).trim();
  if (rawValue === "") return fallback;
  const numeric = typeof rawValue === "number" ? rawValue : Number(rawValue);
  return clampEmbedNumber(numeric, fallback, min, max);
}

export function buildLeadFormIframeSnippet(publicUrl: string, options: LeadFormEmbedOptions) {
  const minHeight = clampEmbedNumber(options.minHeight, 620, 360, 1600);
  const maxWidth = clampEmbedNumber(options.maxWidth, 640, 320, 1200);
  const title = escapeHtmlAttribute(options.title?.trim() || "Form di contatto");

  return `<iframe src="${escapeHtmlAttribute(publicUrl)}" title="${title}" width="100%" height="${minHeight}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="width:100%;min-height:${minHeight}px;border:0;max-width:${maxWidth}px;margin:0 auto;display:block;border-radius:12px;overflow:hidden;"></iframe>`;
}

export function buildLeadFormAutoResizeEmbedSnippet(publicUrl: string, options: LeadFormEmbedOptions) {
  const slug = sanitizeLeadFormSlug(options.slug);
  const mountId = `eic-form-${slug}`;
  const minHeight = clampEmbedNumber(options.minHeight, 620, 360, 1600);
  const maxWidth = clampEmbedNumber(options.maxWidth, 640, 320, 1200);
  const title = options.title?.trim() || "Form di contatto";
  let allowedOrigin = "";

  try {
    allowedOrigin = new URL(publicUrl).origin;
  } catch {
    allowedOrigin = "";
  }

  return `<div id="${escapeHtmlAttribute(mountId)}"></div>
<script>
(function(){
  var mount=document.getElementById('${escapeInlineJs(mountId)}');
  if(!mount)return;
  // Porta nel form i parametri di campagna della pagina che lo ospita
  // (il proxy /f li inoltra all'edge): senza, ogni lead resta senza campagna.
  var src='${escapeInlineJs(publicUrl)}';
  try{
    var here=new URLSearchParams(window.location.search);
    var extra=[];
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','wbraid','gbraid','fbclid','ttclid','msclkid','li_fat_id'].forEach(function(k){
      var v=here.get(k);
      if(v)extra.push(encodeURIComponent(k)+'='+encodeURIComponent(v));
    });
    if(extra.length)src+=(src.indexOf('?')===-1?'?':'&')+extra.join('&');
  }catch(e){}
  var iframe=document.createElement('iframe');
  iframe.src=src;
  iframe.title='${escapeInlineJs(title)}';
  iframe.loading='lazy';
  iframe.referrerPolicy='strict-origin-when-cross-origin';
  iframe.style.cssText='width:100%;min-height:${minHeight}px;border:0;max-width:${maxWidth}px;margin:0 auto;display:block;border-radius:12px;overflow:hidden;';
  mount.innerHTML='';
  mount.appendChild(iframe);
  window.addEventListener('message',function(event){
    if(event.source!==iframe.contentWindow)return;
    if('${escapeInlineJs(allowedOrigin)}'&&event.origin!=='${escapeInlineJs(allowedOrigin)}')return;
    var data=event.data||{};
    if(data.type!=='eic-lead-form-height'||data.slug!=='${escapeInlineJs(slug)}')return;
    var height=Math.max(${minHeight},Math.min(2600,Number(data.height||0)+16));
    if(height)iframe.style.height=height+'px';
  });
})();
</script>`;
}

export async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) throw new Error("Clipboard non disponibile");
}
