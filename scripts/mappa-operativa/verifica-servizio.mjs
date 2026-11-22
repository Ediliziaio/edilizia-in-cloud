/** Edge Function reale, Postgres locale in WASM e provider cartografici sintetici. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const qui = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(qui, "../..");
const db = new PGlite();
const az = "10000000-0000-4000-a000-000000000001";
const altro = "10000000-0000-4000-a000-000000000002";
const uid = "10000000-0000-4000-a000-000000000003";
const serviceKey = "local-test-service-role";
const giorno = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const token = (u) => {
  const e = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iniz = e({ alg: "HS256", typ: "JWT" }) + "." + e({ sub: u, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 });
  return iniz + "." + createHmac("sha256", "fixture-map-not-a-real-secret").update(iniz).digest("base64url");
};
const auth = token(uid);
const rpc = {
  mappa_calendario_accesso: ["p_company", "p_tipo"],
  mappa_conta: ["p_company", "p_provider", "p_voce", "p_unita", "p_minuto", "p_mese"],
  mappa_candidati: ["p_company", "p_tipo", "p_giorno", "p_inizio", "p_fine", "p_qualifica", "p_escludi"],
  mappa_richiesta_inizia: ["p_company", "p_chiave", "p_token"],
  mappa_richiesta_chiudi: ["p_company", "p_chiave", "p_token", "p_risposta", "p_secondi"],
};
const chiamate = [];
let fallisciMatrice = false;
const app = createServer(async (req, res) => {
  const json = (status, val) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(val));
  };
  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (url.pathname === "/auth/v1/user") return req.headers.authorization === `Bearer ${auth}`
      ? json(200, { id: uid, role: "authenticated", aud: "authenticated" }) : json(401, { message: "Denied" });
    const azione = url.pathname.split("/").at(-1);
    if (url.pathname.startsWith("/rest/v1/rpc/") && azione in rpc) {
      const raw = [];
      for await (const parte of req) raw.push(parte);
      const args = JSON.parse(Buffer.concat(raw).toString());
      const privilegiato = req.headers.authorization === `Bearer ${serviceKey}`;
      if (!privilegiato && req.headers.authorization !== `Bearer ${auth}`) return json(401, { message: "Denied" });
      return await db.transaction(async tx => {
        await tx.exec(`set local role ${privilegiato ? "service_role" : "authenticated"}`);
        await tx.query("select set_config('mappa.uid',$1,true)", [privilegiato ? "" : uid]);
        const result = await tx.query(`select public.${azione}(${rpc[azione].map((_, i) => "$" + (i + 1)).join(",")}) as out`,
          rpc[azione].map(a => args[a] === undefined ? null : typeof args[a] === "object" && args[a] !== null ? JSON.stringify(args[a]) : args[a]));
        return json(200, result.rows[0].out);
      });
    }
    if (url.pathname.startsWith("/table/")) {
      assert.equal(req.headers.authorization, "Bearer routing-fixture");
      const n = url.searchParams.get("sources").split(";").length;
      chiamate.push({ tipo: "matrice", elementi: n });
      if (fallisciMatrice) return json(503, {});
      const durata = [900, 300, 450, 1000, 1200];
      return json(200, { code: "Ok", durations: Array.from({ length: n }, (_, i) => [durata[i]]),
        distances: Array.from({ length: n }, (_, i) => [i * 1000 + 3000]) });
    }
    if (url.pathname.startsWith("/route/")) {
      assert.equal(req.headers.authorization, "Bearer routing-fixture");
      chiamate.push({ tipo: "percorso" });
      assert.equal(url.searchParams.get("steps"), "true");
      assert.equal(url.searchParams.get("radiuses"), "500;500;500");
      if (url.pathname.includes("9.7,45.9")) return json(400, {
        code: "NoSegment", message: "Could not find a matching segment for coordinate 1",
      });
      const partenza = [9.1, 45.41], tappa = [9.18, 45.42], curva = [9.14, 45.43];
      return json(200, { code: "Ok", routes: [{
        legs: [
          { duration: 450, distance: 6000, steps: [{ geometry: { coordinates: [partenza, tappa] } }] },
          { duration: 540, distance: 7200, steps: [{ geometry: { coordinates: [tappa, curva, partenza] } }] },
        ],
        geometry: { coordinates: [partenza, tappa, curva, partenza] },
      }] });
    }
    if (url.pathname === "/search") {
      assert.equal(req.headers.authorization, "Bearer geocoding-fixture");
      chiamate.push({ tipo: "geocodifica" });
      await new Promise(r => setTimeout(r, 500));
      return json(200, [{ lat: "45.41", lon: "9.18", display_name: "Indirizzo sintetico 4", address: { house_number: "4" } }]);
    }
    return json(404, { message: "Fixture sconosciuta" });
  } catch (e) { return json(400, { code: e.code, message: e.message }); }
});
let edge;
let edgeLog = "";
try {
  await db.exec(await readFile(path.join(root, "src/test/fixtures/mappaOperativaDatabase.sql"), "utf8"));
  await db.exec(await readFile(path.join(root, "supabase/migrations/20290507115000_mappa_operativa_calendari.sql"), "utf8"));
  await db.exec(`
    insert into companies values ('${az}'),('${altro}');
    insert into profiles values ('${uid}','${az}','Titolare','QA',false,null);
    insert into fixture_perms values ('${uid}','${az}','can_view_marketing_appointments'),
     ('${uid}','${az}','can_view_orders'),('${uid}','${az}','can_view_calendar'),('${uid}','${az}','amministratore');
    insert into profiles
     select ('10000000-0000-4000-a000-'||lpad((g+100)::text,12,'0'))::uuid,'${az}',
       'Commerciale',lpad(g::text,2,'0'),false,null from generate_series(1,20) g;
    insert into fixture_perms select id,company_id,'can_view_marketing_appointments' from profiles where first_name='Commerciale';
    insert into marketing_calendars
     select gen_random_uuid(),company_id,id,'personal',true,45.40+last_name::int*0.001,9.18,null,0,0
     from profiles where first_name='Commerciale';
    insert into marketing_calendar_availability
     select id,g,null,true,time '07:00',time '21:00' from marketing_calendars,generate_series(0,6) g;
  `);
  await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${app.address().port}`;
  const tmp = await mkdtemp(path.join(os.tmpdir(), "eic-mappa-edge-"));
  const shim = path.join(tmp, "edge.ts");
  await writeFile(shim, `
    const original = Deno.serve;
    Object.assign(Deno, { serve: (h: Deno.ServeHandler) => original({ hostname: "127.0.0.1", port: 8182 }, h) });
    await import(${JSON.stringify(pathToFileURL(path.join(root, "supabase/functions/mappa-operativa/index.ts")).href)});
  `);
  edge = spawn("deno", ["run", "--no-lock", "--allow-env", "--allow-net=127.0.0.1", shim], {
    env: { ...process.env, SUPABASE_URL: url, SUPABASE_ANON_KEY: "fixture-anon", SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      MAPPA_OPERATIVA_OSRM_URL: url, MAPPA_OPERATIVA_OSRM_TOKEN: "routing-fixture",
      MAPPA_OPERATIVA_GEOCODING_URL: url, MAPPA_OPERATIVA_GEOCODING_TOKEN: "geocoding-fixture" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  edge.stdout.on("data", d => { edgeLog += d; });
  edge.stderr.on("data", d => { edgeLog += d; });
  const endpoint = "http://127.0.0.1:8182/";
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(endpoint)).status === 405) break; } catch { /* avvio */ }
    if (i === 39 || edge.exitCode != null) throw Error(edgeLog);
    await new Promise(r => setTimeout(r, 250));
  }
  const chiama = async (body, autorizzato = true) => {
    const res = await fetch(endpoint, { method: "POST", headers: {
      "Content-Type": "application/json", ...(autorizzato ? { Authorization: `Bearer ${auth}` } : {}),
    }, body: JSON.stringify({ company: az, ambito: "vendite", ...body }) });
    return [res.status, await res.json()];
  };
  assert.equal((await chiama({ azione: "vista" }, false))[0], 401);
  assert.equal((await chiama({ company: altro, azione: "vista" }))[0], 403);
  assert.equal((await chiama({ azione: "vista", tile: true }))[0], 200);
  assert.equal((await chiama({ azione: "vista", tile: true, cartografia: "openfreemap" }))[0], 200);
  assert.deepEqual(chiamate, []);
  const meta = { lat: 45.4, lng: 9.18 };
  const cerca = { azione: "vicini", giorno, inizio: "13:00", fine: "14:00", tipo: "vendite", meta };
  const [status, dati] = await chiama(cerca);
  assert.equal(status, 200);
  assert.equal(dati.totale, 20);
  assert.equal(dati.valutati, 5);
  assert.deepEqual(dati.risultati.map(r => r.nome), ["Commerciale 02", "Commerciale 03", "Commerciale 01"]);
  await chiama(cerca);
  assert.deepEqual(chiamate, [{ tipo: "matrice", elementi: 5 }]);
  const primi = await Promise.all([chiama({ azione: "indirizzo", indirizzo: " Via Demo 4, Milano " }),
    chiama({ azione: "indirizzo", indirizzo: "via demo 4, milano" })]);
  for (const [codice, risposta] of primi) { assert.equal(codice, 200); assert.equal(risposta.risultati[0].lat, 45.41); }
  assert.equal(chiamate.filter(c => c.tipo === "geocodifica").length, 1);
  const percorso = { azione: "percorso", punti: [meta, { lat: 45.45, lng: 9.21 }, meta], revisione: ["9"] };
  const [, giro] = await chiama(percorso);
  assert.deepEqual(giro.tratte.map(t => t.metri), [6000, 7200]);
  assert.deepEqual(giro.geometrieTratte.map(tratta => tratta.length), [2, 3]);
  assert.deepEqual((await chiama(percorso))[1], giro);
  assert.equal(chiamate.filter(c => c.tipo === "percorso").length, 1);
  await chiama({ ...percorso, revisione: ["10"] });
  assert.equal(chiamate.filter(c => c.tipo === "percorso").length, 2);
  const [, pinFuori] = await chiama({ ...percorso, punti: [meta, { lat: 45.9, lng: 9.7 }, meta] });
  assert.deepEqual(pinFuori, { tratte: [null, null], geometria: [], problema: "fuori_copertura", puntiFuoriCopertura: [1] });
  fallisciMatrice = true;
  const [, risultato] = await chiama({ ...cerca, meta: { lat: 45.41, lng: 9.19 } });
  assert.equal(risultato.metodo, "linea");
  const conteggi = (await db.query("select provider,voce,sum(unita)::int unita from private.mappa_consumo group by provider,voce order by provider,voce")).rows;
  assert.deepEqual(conteggi.map(c => [c.provider, c.voce, c.unita]), [
    ["maptiler", "visualizzazioni", 1], ["nominatim_privato", "geocodifiche", 1], ["openfreemap", "visualizzazioni", 1],
    ["osrm_privato", "elementi_matrice", 10], ["osrm_privato", "percorsi", 3],
  ]);
  console.log(JSON.stringify({ chiamate, conteggi, candidati: dati.totale, valutati: dati.valutati, fallback: risultato.metodo }, null, 2));
} catch (e) {
  console.error(edgeLog);
  throw e;
} finally {
  edge?.kill();
  app.closeAllConnections();
  app.close();
  await db.close();
}
