import type { Plugin } from 'vite';
import { request } from 'node:http';

const warehouseLabPort = 8117;
const labNotAvailable = { error: { code: '08006', message: `Servizio di collaudo Magazzino non disponibile sulla porta ${warehouseLabPort}.` } };

export function localWarehousePlugin(): Plugin {
  return {
    name:'magazzino-local-only',apply:'serve',enforce:'pre',
    transform(code,id) {
      if (id.replaceAll('\\','/').endsWith('/src/contexts/AuthContext.tsx')) {
        // La fixture non usa active_company_selection del servizio online.
        // Non effettuare quella scrittura all'avvio del laboratorio e non
        // mostrare un falso errore di disallineamento. Il servizio reale e
        // tutte le sue verifiche rimangono nel ramo normale, fuori collaudo.
        return {code:code.replace('let erroreSync: unknown = null;',
          "if ((await import('/dev/magazzino-local/mode.ts')).localWarehouseMode()) return;\n      let erroreSync: unknown = null;"),map:null};
      }
      if (id.replaceAll('\\','/').endsWith('/src/lib/queryPersister.ts')) {
        const guard="if ((await import('/dev/magazzino-local/mode.ts')).localWarehouseMode()) return";
        return {code:code
          .replace('persistClient: async (client: PersistedClient) => {','persistClient: async (client: PersistedClient) => { '+guard+';')
          .replace('restoreClient: async () => {','restoreClient: async () => { '+guard+' undefined;')
          .replace('removeClient: async () => {','removeClient: async () => { '+guard+';'),map:null};
      }
      if (!id.replaceAll('\\','/').endsWith('/src/integrations/supabase/client.ts')) return;
      const needle='async function fetchTraducendoGliErrori(originale: RequestInfo | URL, init?: RequestInit): Promise<Response> {';
      if(!code.includes(needle)) throw new Error('Magazzino locale: punto di isolamento non trovato. Arresto per evitare scritture online.');
      return {code:code.replace(needle, needle+`\n  const local = await import('/dev/magazzino-local/bridge-client.ts');\n  const localResponse = await local.warehouseLocalFetch(originale, init);\n  if (localResponse) return localResponse;\n`),map:null};
    },
    configureServer(server) {
      server.middlewares.use('/__magazzino_local',(req,res)=>{
        const host=req.headers.host??'';const remote=req.socket.remoteAddress??'';
        if(!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)) {res.statusCode=403;res.end();return;}
        const path=req.url==='/'?'/bridge/session':req.url==='/session'?'/bridge/session':req.url==='/bridge'?'/bridge':req.url==='/reset'?'/reset':req.url==='/state'?'/state':null;
        if(!path){res.statusCode=404;res.end();return;}
        const chunks: Buffer[]=[];let size=0;
        req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>20000){res.statusCode=413;res.end();req.destroy();}else chunks.push(chunk);});
        req.on('end',()=>{
          const body=Buffer.concat(chunks);
          const unavailable = () => {
            if (!res.headersSent) {
              res.writeHead(503, {'Content-Type':'application/json','Cache-Control':'no-store'});
              res.end(JSON.stringify(labNotAvailable));
            } else if (!res.writableEnded) res.destroy();
          };
          const proxy=request({hostname:'127.0.0.1',port:warehouseLabPort,path,method:req.method,headers:{host:`127.0.0.1:${warehouseLabPort}`,origin:`http://${host}`,'Content-Type':'application/json','Content-Length':body.length,...(req.headers['x-local-fixture']?{'X-Local-Fixture':String(req.headers['x-local-fixture'])}:{})}},upstream=>{
            if (!upstream.headers['content-type']?.startsWith('application/json')) {
              upstream.resume();
              unavailable();
              return;
            }
            upstream.on('error', unavailable);
            res.writeHead(upstream.statusCode??502,{'Content-Type':'application/json','Cache-Control':'no-store'});upstream.pipe(res);
          });
          proxy.setTimeout(12_000, () => proxy.destroy());
          proxy.on('error', unavailable);
          res.once('close', () => { if (!res.writableEnded) proxy.destroy(); });
          proxy.end(body);
        });
      });
    },
  };
}
