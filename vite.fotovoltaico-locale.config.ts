import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {richiestaProduzione,parametriPVGIS,aggregaIrraggiamento} from "./dev/fotovoltaico-locale/pvgisLocale";
const cachePVGIS=new Map<string,Promise<number>>();
const esegui = promisify(execFile);
const root = path.resolve(__dirname, "dev/fotovoltaico-locale");
export default defineConfig({
  root, envDir: root, publicDir: path.resolve(__dirname, "public"),
  cacheDir: path.resolve(__dirname, "node_modules/.vite-fotovoltaico-locale-8087"),
  plugins: [react(), {
    name: "fv-pvgis-locale",
    configureServer(server) {
      server.middlewares.use("/api/fv-stima", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        try {
          if(req.method!=="GET"&&req.method!=="POST"){res.statusCode=405;res.end(JSON.stringify({error:"Metodo non consentito"}));return;}
          let raw:Record<string,unknown>;
          if(req.method==="POST"){let corpo="";for await(const chunk of req){corpo+=chunk;if(corpo.length>16000)throw new Error("Richiesta troppo grande.");}raw=JSON.parse(corpo);}
          else raw=Object.fromEntries(new URL(req.url??"/","http://127.0.0.1").searchParams);
          const {lat,lng,gruppi}=richiestaProduzione(raw);
          const leggi=async(g:typeof gruppi[number])=>{const params=parametriPVGIS(lat,lng,g),key=params.toString();let promessa=cachePVGIS.get(key);if(!promessa){promessa=(async()=>{const {stdout}=await esegui("curl",["--fail","--silent","--show-error","--location","--max-time","15",`https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?${params}`],{encoding:"utf8",timeout:20000,maxBuffer:1024*1024});const result=JSON.parse(stdout),ore=Number(result.outputs?.totals?.fixed?.["H(i)_y"]);if(!Number.isFinite(ore)||ore<=0)throw new Error("PVGIS non ha fornito irraggiamento utilizzabile.");return ore;})();cachePVGIS.set(key,promessa);if(cachePVGIS.size>100)cachePVGIS.delete(cachePVGIS.keys().next().value!);promessa.catch(()=>cachePVGIS.delete(key));}return promessa;};
          const valori:number[]=[];for(let i=0;i<gruppi.length;i+=3)valori.push(...await Promise.all(gruppi.slice(i,i+3).map(leggi)));
          res.end(JSON.stringify({fonte:"pvgis",ore_sole_annue_equivalenti:aggregaIrraggiamento(gruppi,valori),gruppi,raddatabase:"PVGIS-SARAH3"}));
        } catch {
          res.statusCode = 503; res.end(JSON.stringify({ error: "PVGIS non è disponibile: riprova fra qualche istante." }));
        }
      });
    },
  }],
  build: { copyPublicDir: false },
  resolve: { alias: [
    { find: /^@\/contexts\/AuthContext$/, replacement: path.resolve(__dirname,"dev/fotovoltaico-locale/authLocale.ts") },
    { find: /^@\/hooks\/(useEffectiveCompanyId|usePermissions)$/, replacement: path.resolve(__dirname, "dev/fotovoltaico-locale/context.ts") },
    { find: /^@\/integrations\/supabase\/client$/, replacement: path.resolve(__dirname, "dev/fotovoltaico-locale/services.ts") },
    { find: /^@\/lib\/velocity\/sentry$/, replacement: path.resolve(__dirname, "dev/fotovoltaico-locale/services.ts") },
    { find: "@", replacement: path.resolve(__dirname, "src") },
  ] },
  define: { __APP_MODE__: JSON.stringify("full") },
  server: { host: "127.0.0.1", port: 8087, strictPort: true, fs: { allow: [__dirname] },
    headers: { "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: data: ws://127.0.0.1:8087; frame-src 'self' blob: data:; form-action 'none'; object-src 'none'" },
  },
});
