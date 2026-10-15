import {defineConfig} from 'vite';
import {runtimePlugins} from './scripts/serve-plugins';
export default defineConfig({base:'./',plugins:[runtimePlugins()],build:{outDir:process.env.MERMAID_BP_OUT_DIR||'dist',chunkSizeWarningLimit:1600,rollupOptions:{input:{main:'index.html'}}}});
