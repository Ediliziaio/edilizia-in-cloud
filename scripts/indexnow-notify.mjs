#!/usr/bin/env node
/**
 * IndexNow Notifier — notifica Bing/Yandex degli aggiornamenti al deploy
 * Uso: node scripts/indexnow-notify.mjs
 * Da aggiungere agli script di CI/CD post-deploy
 */

const HOST = "ediliziaincloud.com";
const KEY = "62ac6a799ade356135bf527565c13e17";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

const URLS = [
  `https://${HOST}/`,
  `https://${HOST}/funzionalita`,
  `https://${HOST}/prezzi`,
  `https://${HOST}/confronto`,
  `https://${HOST}/chi-siamo`,
  `https://${HOST}/demo`,
  `https://${HOST}/blog`,
  `https://${HOST}/casi-studio`,
  `https://${HOST}/formazione`,
  `https://${HOST}/per/imprese-costruzione`,
  `https://${HOST}/per/impiantisti`,
  `https://${HOST}/per/ristrutturatori`,
  `https://${HOST}/per/fotovoltaico`,
  `https://${HOST}/per/serramentisti`,
  `https://${HOST}/per/piccole-imprese`,
];

async function notifyIndexNow() {
  const body = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: URLS,
  };

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      console.log(`✅ IndexNow: ${URLS.length} URL notificati (status ${res.status})`);
    } else {
      console.warn(`⚠️ IndexNow: risposta ${res.status} — ${await res.text()}`);
    }
  } catch (err) {
    console.error("❌ IndexNow: errore di rete —", err.message);
  }
}

notifyIndexNow();
