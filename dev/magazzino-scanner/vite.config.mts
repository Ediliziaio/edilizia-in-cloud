import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('.',import.meta.url));
const root=fileURLToPath(new URL('../../',import.meta.url));
export default defineConfig({root:here,cacheDir:root+'node_modules/.vite-magazzino-scanner-demo',plugins:[react()],resolve:{alias:[{find:'@/hooks/warehouse/useBarcodeLookup',replacement:here+'lookup-demo.ts'},{find:'@',replacement:root+'src'}]},server:{host:'127.0.0.1',port:8099,strictPort:true,fs:{allow:[root]}},build:{outDir:here+'dist',emptyOutDir:true}});
