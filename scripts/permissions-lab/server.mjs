import http from "node:http";
import { assertLocalFixture, serviceAsync, storageService } from "./backend.mjs";
assertLocalFixture();
const port = Number(process.env.EIC_PERMISSIONS_API_PORT || 5189);
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !["http://127.0.0.1:5188", "http://localhost:5188"].includes(origin)) { res.writeHead(403).end(); return; }
  res.setHeader("Access-Control-Allow-Origin", origin || "http://127.0.0.1:5188");
  res.setHeader("Vary", "Origin");res.setHeader("Access-Control-Expose-Headers","Content-Range,Range-Unit,Retry-After");res.setHeader("Access-Control-Allow-Headers", "content-type,apikey,authorization,x-client-info,prefer,accept,range,range-unit,x-upsert,accept-profile,content-profile,x-supabase-api-version");res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {res.writeHead(204).end();return;}
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (!url.pathname.startsWith("/rest/v1/") && !url.pathname.startsWith("/auth/v1/") && !url.pathname.startsWith("/functions/v1/") && !url.pathname.startsWith("/storage/v1/")) {res.writeHead(404).end();return;}
    const path = url.pathname.replace(/^\/(rest|auth)\/v1/, "");
    const chunks = [];let size=0;for await (const chunk of req) {size+=chunk.length;if(size>1e6)throw new Error("Richiesta troppo grande");chunks.push(chunk);}
    if(url.pathname.startsWith('/storage/v1/')) {
      const r=storageService(url.pathname.replace('/storage/v1','')+url.search,req.method,chunks.length?Buffer.concat(chunks):undefined,req.headers);
      res.setHeader('Cache-Control','no-store');for(const[k,v]of Object.entries(r.headers))res.setHeader(k,v);res.writeHead(r.status).end(r.body);return;
    }
    const body = chunks.length ? Buffer.concat(chunks).toString() : undefined;
    if (process.env.EIC_LOCAL_CHAT === "true" && ["/functions/v1/silvio-chat","/functions/v1/silvio-execute-action"].includes(url.pathname)) {
      const response=await fetch("http://127.0.0.1:5191/"+url.pathname.split('/').pop(),{method:req.method,headers:req.headers,body});
      res.setHeader('Content-Type','application/json');res.writeHead(response.status).end(Buffer.from(await response.arrayBuffer()));return;
    }
    if (url.pathname.startsWith("/functions/v1/")) {res.setHeader("Content-Type","application/json");res.writeHead(503).end(JSON.stringify({message:"Servizio non avviato nel laboratorio locale; nessuna chiamata a servizi esterni"}));return;}
    const result = url.pathname.startsWith("/auth/v1/")
      ? await serviceAsync(9999, path + url.search, req.method, body, req.headers)
      : await serviceAsync(3002, path + url.search, req.method, body, req.headers);
    res.setHeader("Cache-Control","no-store");
    for(const [key,value] of Object.entries(result.headers||{})) res.setHeader(key,value);
    res.setHeader("Content-Type", "application/json");res.writeHead(result.status);res.end(result.data === null ? "" : JSON.stringify(result.data));
  } catch (error) {res.setHeader("Content-Type","application/json");res.writeHead(500).end(JSON.stringify({message:error.message}));}
});
server.listen(port,"127.0.0.1",()=>console.log(`Laboratorio sintetico API: http://127.0.0.1:${port}`));
