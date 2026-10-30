import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
import fs from 'fs';

/**
 * بلجن مخصص لنسخ ملفات الـ SQL migrations إلى مجلد الـ build
 * بحيث يقدر الـ migrator يلاقيها وقت التشغيل
 */
function copyMigrationsPlugin(): Plugin {
  return {
    name: 'copy-migrations',
    closeBundle() {
      const srcDir = path.resolve(__dirname, 'src/main/db/migrations');
      const destDir = path.resolve(__dirname, 'dist-electron/main/migrations');

      if (!fs.existsSync(srcDir)) return;

      // إنشاء المجلد الهدف
      fs.mkdirSync(destDir, { recursive: true });

      // نسخ جميع ملفات .sql
      const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.sql'));
      for (const file of files) {
        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
      }

      console.log(`✅ تم نسخ ${files.length} ملف migration إلى dist-electron/main/migrations/`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry point
        entry: path.resolve(__dirname, 'src/main/index.ts'),
        vite: {
          plugins: [copyMigrationsPlugin()],
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/main'),
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      {
        // Preload scripts entry point
        entry: path.resolve(__dirname, 'src/preload/index.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/preload'),
          },
        },
        onstart(options) {
          options.reload();
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@preload': path.resolve(__dirname, 'src/preload'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  root: 'src/renderer',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
