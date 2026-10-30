import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';

// تقديم بناء الواجهة (frontend/dist) من Express على الأصل نفسه، مع توجيه مسارات React Router إلى index.html

// بصمات SHA-256 للسكربتات المضمّنة في index.html (سكربت المظهر) كي تسمح بها سياسة CSP دون 'unsafe-inline'
function inlineScriptHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].trim() === '') continue;
    hashes.push(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  }
  return hashes;
}

// يعيد null إن لم يوجد بناء (index.html) في المجلد
export function loadFrontend(dir) {
  const indexPath = path.join(dir, 'index.html');
  if (!existsSync(indexPath)) return null;
  const indexHtml = readFileSync(indexPath, 'utf8');
  return { dir, indexHtml, scriptHashes: inlineScriptHashes(indexHtml) };
}

export function serveFrontend(app, frontend) {
  app.use(
    express.static(frontend.dir, {
      index: false,
      setHeaders(res, filePath) {
        // ملفات Vite ذات البصمة في اسمها لا تتغير أبداً
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // أي GET/HEAD لصفحة (بلا امتداد ملف وخارج /api) يرجع index.html؛ الملفات المفقودة وطلبات /api تبقى 404
  app.use((req, res, next) => {
    const isPageRequest = req.method === 'GET' || req.method === 'HEAD';
    const isApi = req.path === '/api' || req.path.startsWith('/api/');
    if (!isPageRequest || isApi || path.extname(req.path)) return next();
    res.set('Cache-Control', 'no-cache').type('html').send(frontend.indexHtml);
  });
}
