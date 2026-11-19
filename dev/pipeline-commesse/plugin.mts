import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, type Plugin } from "vite";
import { PipelineError, pipelineStore, uuid } from "./store.mts";

export function pipelineCommesseDev(): Plugin {
  return {name:"pipeline-commesse-db-locale", apply:"serve", async configureServer(server) {
    const env = loadEnv(server.config.mode,server.config.root,"VITE_SUPABASE_");
    const url = env.VITE_SUPABASE_URL;
    if (!url || !env.VITE_SUPABASE_PUBLISHABLE_KEY) return;
    const { DatabaseSync } = await import("node:sqlite");
    const dir = join(homedir(),".local","share","edilizia-in-cloud", new URL(url).hostname);
    mkdirSync(dir,{recursive:true,mode:0o700});
    const db = new DatabaseSync(join(dir,"pipeline-commesse.sqlite"));
    const store = pipelineStore(db);
    server.httpServer?.once("close",()=>db.close());
    server.middlewares.use("/api/locale/pipeline-commesse",async (req,res) => {
      res.setHeader("Content-Type","application/json");
      res.setHeader("Cache-Control","no-store");
      try {
        const azienda = new URL(req.url ?? "/", "http://localhost").searchParams.get("azienda");
        if (!uuid(azienda)) throw new PipelineError(400,"Azienda non valida.");
        const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
        if (!token) throw new PipelineError(401,"Accedi per consultare le pipeline.");
        const client = createClient(url,env.VITE_SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
        const {data:{user},error} = await client.auth.getUser(token);
        if (error || !user) throw new PipelineError(401,"Sessione scaduta.");
        async function permesso(nome: string) {
          const {data,error} = await client.rpc("has_permission_for_company",{_company_id:azienda,_permission:nome,_user_id:user!.id});
          if (error) throw new PipelineError(503,"Impossibile verificare i permessi aziendali.");
          return data === true;
        }
        const ordineVisibile = async (ids: string[]) => {
          const {data,error} = await client.from("orders").select("id").eq("company_id",azienda).is("deleted_at",null).in("id",ids);
          if (error) throw new PipelineError(503,"Impossibile verificare le commesse.");
          return data.map(r=>r.id as string);
        };
        if (req.method==="GET") {
          const puoLeggereOrdini = await permesso("can_view_orders");
          if (!puoLeggereOrdini && !await permesso("can_view_settings_orders")) throw new PipelineError(403,"Accesso negato.");
          const assegnate = store.assegnazioni(azienda);
          const ids = Object.keys(assegnate);
          const visibili: Record<string,string> = {};
          if (puoLeggereOrdini) for (let i=0;i<ids.length;i+=100)
            for (const id of await ordineVisibile(ids.slice(i,i+100))) visibili[id]=assegnate[id];
          res.end(JSON.stringify({pipeline:store.elenco(azienda),fasiPerCommessa:visibili})); return;
        }
        if (req.method!=="POST") throw new PipelineError(405,"Metodo non consentito.");
        req.setEncoding("utf8");
        let raw="";
        for await (const chunk of req) { raw+=chunk; if (raw.length>65536) throw new PipelineError(413,"Richiesta troppo grande."); }
        let body;
        try { body=JSON.parse(raw); } catch {throw new PipelineError(400,"Dati non validi.");}
        if (body?.azione==="salva") {
          if (!await permesso("can_edit_settings_orders")) throw new PipelineError(403,"Non puoi modificare le pipeline.");
          store.salva(azienda,body.pipeline);
        } else if (body?.azione==="assegna") {
          if (!await permesso("can_edit_orders")) throw new PipelineError(403,"Non puoi spostare le commesse.");
          if (!uuid(body.commessa) || !(body.fase===null || uuid(body.fase)) || !(body.precedente===null || uuid(body.precedente))) throw new PipelineError(400,"Destinazione non valida.");
          if (!(await ordineVisibile([body.commessa])).length) throw new PipelineError(404,"Commessa non disponibile.");
          store.assegna(azienda,body.commessa,body.fase,body.precedente);
        } else throw new PipelineError(400,"Operazione non valida.");
        res.end("{}");
      } catch (e) {
        res.statusCode=e instanceof PipelineError ? e.status : 500;
        res.end(JSON.stringify({errore:e instanceof PipelineError ? e.message : "Database pipeline non disponibile."}));
      }
    });
  }};
}
