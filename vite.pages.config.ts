import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath,URL} from 'node:url';
export default defineConfig({root:'web',base:'/Still-Notes/',plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},publicDir:'../public',build:{outDir:'../gh-pages',emptyOutDir:true},server:{fs:{allow:['..']}}});
