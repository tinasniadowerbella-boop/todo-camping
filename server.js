/**
 * server.js — Backend TodoCamping
 * Sirve los archivos estáticos + hace de proxy para la API de Anthropic
 * (así la API key nunca queda expuesta en el navegador).
 */

const express  = require('express');
const path     = require('path');
const fetch    = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Variables de entorno ────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL      = process.env.SUPABASE_URL      || 'https://wgrqkffxwzwbzgjmbtsd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MODEL             = process.env.MODEL             || 'claude-haiku-4-5-20251001';

// ── Middleware ──────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// CORS permisivo (para desarrollo y widgets embebidos)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Ruta de salud ───────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', model: MODEL }));

// ── Config pública (sin la API key) ────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl:      SUPABASE_URL,
    supabaseAnonKey:  SUPABASE_ANON_KEY,
    model:            MODEL,
  });
});

// ── Proxy Anthropic ─────────────────────────────────────────────────
// El frontend manda el body completo (model, system, tools, messages);
// el servidor añade la API key y lo reenvía a Anthropic.
app.post('/api/chat', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en el servidor.' });
  }

  try {
    const body = {
      model:      req.body.model      || MODEL,
      max_tokens: req.body.max_tokens || 1024,
      system:     req.body.system,
      tools:      req.body.tools,
      messages:   req.body.messages,
    };

    // Eliminar campos undefined para no mandar basura a la API
    Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error('Error proxy Anthropic:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Archivos estáticos ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ── Catch-all → index.html ──────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Arrancar ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`TodoCamping corriendo en http://localhost:${PORT}`);
  console.log(`API key: ${ANTHROPIC_API_KEY ? '✅ configurada' : '❌ FALTA ANTHROPIC_API_KEY'}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
});
