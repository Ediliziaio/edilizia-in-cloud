/**
 * Cloudflare Pages Function — proxy pubblico del form lead (/f).
 *
 * I form (lead_forms) sono renderizzati dall'edge Supabase `form-render`. Ma
 * servita direttamente da *.supabase.co, la risposta HTML viene riscritta dal
 * dominio condiviso a `content-type: text/plain` + CSP `sandbox` (anti-phishing):
 * l'iframe/link mostra il SORGENTE invece del form → embed inutilizzabile.
 *
 * Questo proxy, servito dal dominio dell'app (Cloudflare Pages, es.
 * app.ediliziaincloud.com), rifetcha l'HTML e lo ri-serve come `text/html`
 * framebile. Il body prodotto da Supabase è integro: la riscrittura tocca solo
 * l'header content-type, che qui sovrascriviamo. Le fetch interne del form
 * (form-submit / attribution-capture) puntano in modo assoluto a Supabase con
 * CORS aperto, quindi continuano a funzionare cross-origin dall'iframe.
 *
 * URL:  /f?slug=<slug>&company_id=<uuid>   (alias: company)
 * Embed: <iframe src="https://app.ediliziaincloud.com/f?slug=..&company_id=..">
 */

const DEFAULT_SUPABASE_URL = "https://rsbrguhkodgnqfomrevo.supabase.co";

function plain(message, status) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const slug = url.searchParams.get("slug");
  const companyId = url.searchParams.get("company_id") || url.searchParams.get("company");

  if (!slug || !companyId) {
    return plain("Parametri mancanti: slug e company_id sono obbligatori.", 400);
  }

  const supabaseBase = (
    (env && (env.SUPABASE_URL || env.VITE_SUPABASE_URL)) || DEFAULT_SUPABASE_URL
  ).replace(/\/+$/, "");

  const renderUrl =
    `${supabaseBase}/functions/v1/form-render` +
    `?slug=${encodeURIComponent(slug)}&company_id=${encodeURIComponent(companyId)}`;

  let upstream;
  try {
    upstream = await fetch(renderUrl, {
      method: "GET",
      // Inoltra IP/UA/referer reali: l'edge li usa per il tracking view.
      headers: {
        "user-agent": request.headers.get("user-agent") || "",
        "x-forwarded-for":
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for") ||
          "",
        referer: request.headers.get("referer") || "",
      },
    });
  } catch {
    return plain("Form temporaneamente non disponibile. Riprova tra poco.", 502);
  }

  const body = await upstream.text();

  // Ri-serve l'HTML dal dominio app: niente X-Frame-Options né CSP restrittiva
  // → il form è incorporabile su qualsiasi sito del cliente. noindex perché è
  // una pagina tecnica, non deve finire su Google.
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
