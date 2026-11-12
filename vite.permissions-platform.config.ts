import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { existsSync } from "node:fs";
import { createHmac } from "node:crypto";
const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString("base64url");
const body=encode({alg:"HS256",typ:"JWT"})+"."+encode({role:"anon",exp:4102444800});
const key=body+"."+createHmac("sha256","local-permissions-fixture-only-secret-20261111").update(body).digest("base64url");
export default defineConfig({
 root:__dirname,envDir:path.resolve(__dirname,"scripts/permissions-lab"),cacheDir:"/tmp/eic-permissions-platform-vite-cache",plugins:[react()],
 server:{host:"127.0.0.1",port:5188,strictPort:true,headers:{"Content-Security-Policy":"connect-src 'self' http://127.0.0.1:5189 ws://127.0.0.1:5188 ws://127.0.0.1:5189"},fs:{allow:[__dirname]}},
 resolve:{alias:{...(existsSync(path.resolve(__dirname,"node_modules/@fishaudio/agent-client")) ? {} : {"@fishaudio/agent-client":path.join(process.env.EIC_PERMISSIONS_EXTRA_DEPS || "/tmp/eic-permissions-extra-deps/node_modules","@fishaudio/agent-client")}),"@":path.resolve(__dirname,"src")}},
 define:{"import.meta.env.VITE_SUPABASE_URL":JSON.stringify("http://127.0.0.1:5189"),"import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY":JSON.stringify(key),"import.meta.env.VITE_SENTRY_DSN":JSON.stringify("")},
});
