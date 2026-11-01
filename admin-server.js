/**
 * خادم لوحة تحكم الأدمن المحلي - Mobix Admin Local Server
 * يسمح بتشغيل لوحة الأدمن محلياً بكامل الصلاحيات الإدارية دون قيود المتصفح
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3333;

// تحميل متغيرات البيئة من ملف .env
const envPath = require('path').join(__dirname, '.env');
try {
  const envContent = require('fs').readFileSync(envPath, 'utf-8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  });
} catch (e) {
  console.warn('[Admin Server] تعذر قراءة ملف .env:', e.message);
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error('⚠️ يجب تعيين SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في ملف .env');
  process.exit(1);
}

function supabaseRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(endpoint, SUPABASE_URL);
    const options = {
      method: method,
      headers: {
        'apikey': SUPABASE_SECRET,
        'Authorization': `Bearer ${SUPABASE_SECRET}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(fullUrl, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    // 1. Health check & Server Status
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, mode: 'local-server' }));
    }

    // 2. GET /api/licenses
    if (url.pathname === '/api/licenses' && req.method === 'GET') {
      const resp = await supabaseRequest('GET', '/rest/v1/licenses?select=*&order=created_at.desc');
      res.writeHead(resp.status, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(resp.data));
    }

    // 3. POST /api/licenses
    if (url.pathname === '/api/licenses' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const resp = await supabaseRequest('POST', '/rest/v1/licenses', payload);
          res.writeHead(resp.status, { 'Content-Type': 'application/json; charset=utf-8' });
          const out = typeof resp.data === 'object' && resp.data !== null ? resp.data : { raw: resp.raw };
          if (resp.status >= 400 && !out.error) {
            out.error = out.message || resp.raw || 'فشل حفظ الترخيص في قاعدة البيانات';
          }
          res.end(JSON.stringify(out));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 4. PATCH /api/licenses/:id
    if (url.pathname.startsWith('/api/licenses/') && req.method === 'PATCH') {
      const id = url.pathname.replace('/api/licenses/', '');
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const resp = await supabaseRequest('PATCH', `/rest/v1/licenses?id=eq.${encodeURIComponent(id)}`, payload);
          res.writeHead(resp.status, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(resp.data));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 5. DELETE /api/licenses/:id
    if (url.pathname.startsWith('/api/licenses/') && req.method === 'DELETE') {
      const id = url.pathname.replace('/api/licenses/', '');
      const resp = await supabaseRequest('DELETE', `/rest/v1/licenses?id=eq.${encodeURIComponent(id)}`);
      res.writeHead(resp.status, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(resp.data));
    }

    // 6. GET /api/backups
    if (url.pathname === '/api/backups' && req.method === 'GET') {
      const resp = await supabaseRequest('GET', '/rest/v1/backups?select=*&order=created_at.desc');
      res.writeHead(resp.status, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(resp.data));
    }

    // 7. Serve admin-portal.html for root or any other page
    const htmlPath = path.join(__dirname, 'admin-portal.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('admin-portal.html not found');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`=======================================================`);
  console.log(`🃏 سيرفر لوحة تحكم الأدمن يعمل الآن بنجاح!`);
  console.log(`🔗 الرابط: http://localhost:${PORT}`);
  console.log(`=======================================================`);

  // Open browser automatically
  const startCmd = process.platform === 'win32' ? `start http://localhost:${PORT}` : `open http://localhost:${PORT}`;
  exec(startCmd);
});

