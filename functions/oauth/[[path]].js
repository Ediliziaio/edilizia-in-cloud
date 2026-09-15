/**
 * /oauth/* — il ritorno da Google su un dominio nostro.
 *
 * Calendario, Google Ads e Business Profile tornavano da Google su
 * rsbrguhkodgnqfomrevo.supabase.co. Per verificare l'app OAuth, Google chiede
 * che ogni indirizzo di ritorno stia su un dominio di cui dimostriamo la
 * proprietà: supabase.co non lo è, e il dominio personalizzato di Supabase non
 * è compreso nel piano attuale. Questo passaggio riceve il ritorno su
 * app.ediliziaincloud.com e lo inoltra alla funzione vera.
 *
 * Il middleware non tocca questi indirizzi: la normalizzazione della barra
 * finale vale solo per www e per il dominio nudo.
 *
 * Solo GET e solo le funzioni elencate: non è un inoltro aperto verso Supabase.
 * La risposta è la pagina HTML che chiude la finestra e avvisa l'app. Servita
 * da *.supabase.co verrebbe riscritta in text/plain (vedi functions/f.js): qui
 * torna text/html.
 */
const DEFAULT_SUPABASE_URL = "https://rsbrguhkodgnqfomrevo.supabase.co";
const FUNZIONI_AMMESSE = new Set(["google-calendar-auth", "google-ads-oauth", "gbp-oauth"]);

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
  if (!FUNZIONI_AMMESSE.has(funzione)) return testo("Indirizzo non valido.", 404);
  if (request.method !== "GET" && request.method !== "HEAD") return testo("Metodo non ammesso.", 405);

  const base = ((env && (env.SUPABASE_URL || env.VITE_SUPABASE_URL)) || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const destinazione = `${base}/functions/v1/${funzione}${url.search}`;

  let upstream;
  try {
    upstream = await fetch(destinazione, {
      method: "GET",
      headers: {
        "user-agent": request.headers.get("user-agent") || "",
        "x-forwarded-for": request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "",
        accept: request.headers.get("accept") || "text/html",
      },
      redirect: "manual",
    });
  } catch {
    return testo("Collegamento momentaneamente non disponibile. Riprova tra poco.", 502);
  }

  const out = new Headers({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" });
  const location = upstream.headers.get("location");
  if (location) out.set("location", location);

  const corpo = await upstream.text();
  const sembraHtml = /^\s*(<!doctype html|<html|<script|<body)/i.test(corpo);
  out.set("content-type", sembraHtml ? "text/html; charset=utf-8" : upstream.headers.get("content-type") || "text/plain; charset=utf-8");

  return new Response(request.method === "HEAD" ? null : corpo, { status: upstream.status, headers: out });
}
