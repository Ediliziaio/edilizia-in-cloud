import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
const repo=path.resolve(__dirname,"../..");
export default defineConfig({root:__dirname,plugins:[react()],cacheDir:path.join(repo,"node_modules/.vite-automation-builder-check"),
 resolve:{alias:[{find:"@/integrations/supabase/client",replacement:path.join(__dirname,"mock.ts")},{find:"@/contexts/AuthContext",replacement:path.join(__dirname,"mock.ts")},{find:"@/hooks/useAutomationBuilder",replacement:path.join(__dirname,"builder.ts")},{find:"@",replacement:path.join(repo,"src")}]},
 server:{host:"127.0.0.1",port:8095,strictPort:true,fs:{allow:[repo]}}});
