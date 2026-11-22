import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
const root=path.resolve(__dirname,'dev/preventivi-responsive');
export default defineConfig({root,envDir:root,publicDir:false,plugins:[react()],resolve:{alias:[{find:/^@\/hooks\/useGoogleMapsDocumentoFv$/,replacement:path.join(root,'mapsLocale.ts')},{find:'@',replacement:path.resolve(__dirname,'src')}]},server:{host:'127.0.0.1',port:5197,strictPort:true,fs:{allow:[__dirname]}},cacheDir:path.resolve(__dirname,'work/mobile-tablet-20261122/vite-cache')});
