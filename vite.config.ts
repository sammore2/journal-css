// @ts-nocheck
import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import fs from 'fs';

function resolveEnvVars(value: string): string {
  const resolved = value.replace(/\$\{(\w+)\}/g, (_, varName) => process.env[varName] || '');
  return path.resolve(resolved);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const targetDir = env.FOUNDRY_MODULE_PATH ? resolveEnvVars(env.FOUNDRY_MODULE_PATH) : undefined;

  return {
    publicDir: 'src',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    plugins: [
      {
        name: 'foundry-deploy',
        apply: 'build',
        closeBundle() {
          if (!targetDir) {
            console.warn('\n\x1b[33m[Foundry-Deploy] FOUNDRY_MODULE_PATH não definida no .env. Pulando deploy...\x1b[0m\n');
            return;
          }
          try {
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }
            // Copiar dist (scripts compilados)
            fs.cpSync('dist', targetDir, { recursive: true, force: true });
            // Copiar assets estáticos que não passam pelo bundle
            const staticDirs = ['lang', 'templates', 'styles', 'themes.json'];
            for (const dir of staticDirs) {
              const srcPath = path.join(__dirname, 'src', dir);
              if (fs.existsSync(srcPath)) {
                fs.cpSync(srcPath, path.join(targetDir, dir), { recursive: true, force: true });
              }
            }
            // module.json
            fs.copyFileSync('src/module.json', path.join(targetDir, 'module.json'));

            console.log(`\n\x1b[32m[Foundry-Deploy] Build implantado em: ${targetDir}\x1b[0m\n`);
          } catch (err: any) {
            console.error('\n\x1b[31m[Foundry-Deploy] Erro no deploy:\x1b[0m', err.message);
          }
        }
      }
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      lib: {
        entry: 'src/scripts/module.ts',
        name: 'journal-css',
        formats: ['es'],
        fileName: 'scripts/module'
      },
      rollupOptions: {
        external: ['/modules/storyteller-cinema/apps/key-manager.js'],
        output: {
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              if (assetInfo.name?.includes('themes/')) return 'styles/themes/[name][extname]';
              return 'styles/[name][extname]';
            }
            return 'assets/[name][extname]';
          },
          chunkFileNames: 'scripts/[name].js',
          manualChunks(id) {
            if (id.includes('node_modules')) return 'vendor';
            if (id.includes('src/scripts/')) {
              const relative = id.split('src/scripts/')[1];
              if (relative && relative !== 'module.ts') {
                return relative.replace('.ts', '').replace('.js', '');
              }
            }
          }
        }
      }
    }
  };
});
