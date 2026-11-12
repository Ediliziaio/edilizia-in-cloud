import {defineConfig}from'vitest/config';
import path from'node:path';
export default defineConfig({test:{environment:'node',include:['scripts/permissions-lab/*.integration.test.ts'],testTimeout:30000,hookTimeout:30000,maxWorkers:1},resolve:{alias:{'https://esm.sh/@supabase/supabase-js@2':'@supabase/supabase-js','@':path.resolve(__dirname,'src'),'https://esm.sh/pdf-lib@1.17.1':'pdf-lib','https://esm.sh/fontkit@2.0.4':'fontkit'}}});
