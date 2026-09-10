/**
 * /l/* — i link delle email a freddo su un dominio del brand.
 *
 * Il dispatcher dell'outreach costruisce i link di tracciamento e di
 * disiscrizione (anche quello nell'intestazione List-Unsubscribe) a partire da
 * una base configurabile. Senza questa, la base era
 * rsbrguhkodgnqfomrevo.supabase.co: un dominio estraneo al mittente in ogni
 * email, che i filtri contano. Con un dominio del brand agganciato a questo
 * progetto Pages (CNAME → edilizia-in-cloud.pages.dev) e la base impostata a
 * https://link.<brand>/l, il link resta sul dominio di chi scrive e finisce
 * qui, che lo inoltra alla funzione vera.
 *
 * Accetta GET (apertura, clic, pagina di disiscrizione) e POST (disiscrizione
 * one-click, RFC 8058). Inoltra solo alle funzioni elencate: non è un relay
 * aperto verso Supabase.
 */
const DEFAULT_SUPABASE_URL = "https://rsbrguhkodgnqfomrevo.supabase.co";
const FUNZIONI_AMMESSE = new Set(["email-tracking", "outreach-track-open"]);

function testo(messaggio, status) {
  return new Response(messaggio, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const pezzi = Array.isArray(params.path) ? params.path : String(params.path ?? "").split("/");
  const funzione = (pezzi[0] ?? "").trim();
  if (!FUNZIONI_AMMESSE.has(funzione)) return testo("Link non valido.", 404);
  if (request.method !== "GET" && request.method !== "POST" && request.method !== "HEAD") {
    return testo("Metodo non ammesso.", 405);
  }

  const base = ((env && (env.SUPABASE_URL || env.VITE_SUPABASE_URL)) || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const destinazione = `${base}/functions/v1/${funzione}${url.search}`;

  const headers = {
    "user-agent": request.headers.get("user-agent") || "",
    "x-forwarded-for": request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "",
    referer: request.headers.get("referer") || "",
    accept: request.headers.get("accept") || "*/*",
  };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  let upstream;
  try {
    upstream = await fetch(destinazione, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });
  } catch {
    return testo("Servizio momentaneamente non disponibile. Riprova tra poco.", 502);
  }

  // Si passano solo gli header che servono al browser: il reindirizzamento
  // dei clic, il tipo di contenuto, e il niente-cache dei pixel.
  const out = new Headers();
  for (const nome of ["content-type", "location", "cache-control", "content-disposition"]) {
    const v = upstream.headers.get(nome);
    if (v) out.set(nome, v);
  }
  if (!out.has("cache-control")) out.set("cache-control", "no-store");
  out.set("x-robots-tag", "noindex, nofollow");
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: out });
}
