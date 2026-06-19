/**
 * server.js - Backend TodoCamping
 * Sirve los archivos estaticos + hace de proxy para la API de Anthropic
 * + ejecuta migracion de BD al arrancar
 */

const express  = require('express');
const path     = require('path');
const fetch    = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app  = express();
const PORT = process.env.PORT || 3000;

const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL       = process.env.SUPABASE_URL      || 'https://wgrqkffxwzwbzgjmbtsd.supabase.co';
const SUPABASE_ANON_KEY  = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERV_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MODEL              = process.env.MODEL             || 'claude-haiku-4-5-20251001';

app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

async function runMigration() {
  const key = SUPABASE_SERV_KEY || SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !key) {
    console.log('Migracion omitida: faltan credenciales Supabase');
    return;
  }

  const steps = [
    {
      desc: 'Agregar columnas cliente_documento, cliente_telefono, reserva_ref',
      sql: `ALTER TABLE public.reservas
              ADD COLUMN IF NOT EXISTS cliente_documento TEXT,
              ADD COLUMN IF NOT EXISTS cliente_telefono  TEXT,
              ADD COLUMN IF NOT EXISTS reserva_ref       TEXT;`
    },
    {
      desc: 'Crear indice unico en reserva_ref',
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_ref
              ON public.reservas (reserva_ref)
              WHERE reserva_ref IS NOT NULL;`
    },
    {
      desc: 'Abrir politicas RLS para el widget',
      sql: `
        DROP POLICY IF EXISTS "Solo autenticados pueden ver reservas" ON public.reservas;
        DROP POLICY IF EXISTS "Solo autenticados pueden escribir reservas" ON public.reservas;
      `
    },
    {
      desc: 'Crear politica lectura anon',
      sql: `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reservas' AND policyname='Widget leer reservas') THEN
          CREATE POLICY "Widget leer reservas" ON public.reservas FOR SELECT USING (true);
        END IF;
      END $$;`
    },
    {
      desc: 'Crear politica insercion anon',
      sql: `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reservas' AND policyname='Widget insertar reservas') THEN
          CREATE POLICY "Widget insertar reservas" ON public.reservas FOR INSERT WITH CHECK (true);
        END IF;
      END $$;`
    },
    {
      desc: 'Crear politica actualizacion anon',
      sql: `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reservas' AND policyname='Widget actualizar reservas') THEN
          CREATE POLICY "Widget actualizar reservas" ON public.reservas FOR UPDATE USING (true);
        END IF;
      END $$;`
    },
    {
      desc: 'Crear politica eliminacion anon',
      sql: `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reservas' AND policyname='Widget eliminar reservas') THEN
          CREATE POLICY "Widget eliminar reservas" ON public.reservas FOR DELETE USING (true);
        END IF;
      END $$;`
    },
  ];

  console.log('Ejecutando migracion Supabase...');
  for (const step of steps) {
    try {
      const resp = await (await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        key,
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({ sql: step.sql }),
      })).json();

      if (resp.error || resp.code) {
        console.log(`  [WARN] ${step.desc}: ${resp.message || resp.error || JSON.stringify(resp)}`);
      } else {
        console.log(`  [OK] ${step.desc}`);
      }
    } catch (e) {
      console.log(`  [WARN] ${step.desc}: ${e.message}`);
    }
  }
  console.log('Migracion completada');
}

app.get('/health', (req, res) => res.json({ status: 'ok', model: MODEL }));

app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl:      SUPABASE_URL,
    supabaseAnonKey:  SUPABASE_ANON_KEY,
    model:            MODEL,
  });
});

app.get('/api/migrate', async (req, res) => {
  await runMigration();
  res.json({ ok: true, mensaje: 'Migracion ejecutada - ver logs del servidor' });
});

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
    if (!upstream.ok) return res.status(upstream.status).json(data);
    res.json(data);
  } catch (err) {
    console.error('Error proxy Anthropic:', err);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`TodoCamping corriendo en http://localhost:${PORT}`);
  console.log(`API key: ${ANTHROPIC_API_KEY ? 'configurada' : 'FALTA ANTHROPIC_API_KEY'}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  await runMigration();
});
