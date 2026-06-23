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




// GET /api/admin/fixlogs — arregla permisos logs_sistema y hace seed
app.get('/api/admin/fixlogs', async (req, res) => {
  const headers = { ...sbAdminHeaders(), 'Prefer': 'return=minimal' };
  const results = [];

  // Lista de SQLs a ejecutar en orden (skipped — service_role bypasea RLS)
  const sqls = [
    `CREATE TABLE IF NOT EXISTS public.logs_sistema (
      id             BIGSERIAL PRIMARY KEY,
      tipo_evento    TEXT NOT NULL,
      session_id     TEXT,
      cliente_email  TEXT,
      cliente_nombre TEXT,
      agente         TEXT,
      duracion_ms    INTEGER,
      datos          JSONB,
      timestamp      TIMESTAMPTZ DEFAULT NOW()
    )`,
    `ALTER TABLE public.logs_sistema ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='logs_sistema' AND policyname='logs insert anon') THEN
         CREATE POLICY "logs insert anon" ON public.logs_sistema FOR INSERT WITH CHECK (true);
       END IF;
     END $$`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='logs_sistema' AND policyname='logs select anon') THEN
         CREATE POLICY "logs select anon" ON public.logs_sistema FOR SELECT USING (true);
       END IF;
     END $$`,
    `GRANT SELECT, INSERT ON public.logs_sistema TO anon`,
    `GRANT SELECT, INSERT ON public.logs_sistema TO authenticated`,
    `GRANT USAGE ON SEQUENCE IF EXISTS public.logs_sistema_id_seq TO anon`,
  ];

  for (const sql of sqls) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST', headers,
        body: JSON.stringify({ sql }),
      });
      const txt = await r.text();
      results.push({ sql: sql.substring(0,60), status: r.status, resp: txt.substring(0,100) });
    } catch(e) {
      results.push({ sql: sql.substring(0,60), error: e.message });
    }
  }

  // Ahora insertar seed de logs directamente
  const now = new Date();
  const clientes = [
    { nombre: 'Valentina López',   email: 'valentina@gmail.com' },
    { nombre: 'Mateo García',      email: 'mateo.garcia@hotmail.com' },
    { nombre: 'Sofía Martínez',    email: 'sofia.m@gmail.com' },
    { nombre: 'Nicolás Rodríguez', email: 'nicolas.r@outlook.com' },
    { nombre: 'Camila Fernández',  email: 'camila.f@gmail.com' },
    { nombre: 'Lucas Pérez',       email: 'lucas.perez@gmail.com' },
    { nombre: 'Isabella Torres',   email: 'isa.torres@gmail.com' },
    { nombre: 'Tomás Ramírez',     email: 'tomas.r@hotmail.com' },
    { nombre: 'Lucía Díaz',        email: 'lucia.d@gmail.com' },
    { nombre: 'Emilio Sánchez',    email: 'emilio.s@gmail.com' },
    { nombre: 'Florencia Ruiz',    email: 'flor.ruiz@gmail.com' },
    { nombre: 'Agustín Morales',   email: 'agus.m@gmail.com' },
  ];

  const logsData = [];
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const baseDate = new Date(now);
    baseDate.setDate(baseDate.getDate() - daysAgo);
    const nSessions = daysAgo === 0 ? 3 : 3 + Math.floor(Math.random() * 3);
    for (let s = 0; s < nSessions; s++) {
      const cliente = clientes[(daysAgo * 3 + s) % clientes.length];
      const sessionId = `sess-seed-${daysAgo}-${s}`;
      const h = 9 + Math.floor(Math.random() * 9);
      const m = Math.floor(Math.random() * 60);
      const t0 = new Date(baseDate); t0.setHours(h, m, 0, 0);

      logsData.push({ tipo_evento:'chat_inicio', session_id:sessionId, cliente_email:cliente.email, cliente_nombre:cliente.nombre, agente:null, duracion_ms:null, datos:null, timestamp:t0.toISOString() });

      const nMsgs = 4 + Math.floor(Math.random() * 9);
      for (let i = 0; i < nMsgs; i++) {
        const mt = new Date(t0.getTime() + (i+1) * (20000 + Math.random()*50000));
        logsData.push({ tipo_evento:'chat_mensaje', session_id:sessionId, cliente_email:cliente.email, cliente_nombre:cliente.nombre, agente: i<2?'leo':(Math.random()>0.4?'reservas':'cami'), duracion_ms: 600+Math.floor(Math.random()*2800), datos:{num_mensaje:i+1}, timestamp:mt.toISOString() });
      }

      // ~45% termina en reserva
      if (nMsgs > 5 && Math.random() > 0.55) {
        const rt = new Date(t0.getTime() + nMsgs * 55000);
        logsData.push({ tipo_evento:'reserva_creada', session_id:sessionId, cliente_email:cliente.email, cliente_nombre:cliente.nombre, agente:'reservas', duracion_ms:null, datos:{num_mensajes:nMsgs, tiempo_ms:nMsgs*55000}, timestamp:rt.toISOString() });
      }
    }
  }

  // Insertar en lotes de 40
  let total = 0;
  for (let i = 0; i < logsData.length; i += 40) {
    const batch = logsData.slice(i, i+40);
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/logs_sistema`, {
        method: 'POST',
        headers: sbAdminHeaders(),
        body: JSON.stringify(batch),
      });
      const batchStatus = r.status;
      if (batchStatus === 201 || batchStatus === 200) total += batch.length;
      else {
        const t = await r.text();
        results.push({ paso: `batch ${i}`, status: r.status, err: t.substring(0,150) });
      }
    } catch(e) { results.push({ paso:`batch ${i}`, error: e.message }); }
  }

  res.json({ ok: true, logs_insertados: total, total_generados: logsData.length, sql_results: results });
});

// GET /api/admin/seed — crea tabla logs_sistema + datos de prueba
app.get('/api/admin/seed', async (req, res) => {
  const key = SUPABASE_SERV_KEY || SUPABASE_ANON_KEY;
  if (!key) return res.status(500).json({ error: 'Sin credenciales Supabase' });

  const headers = {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Prefer': 'return=minimal',
  };

  const results = [];

  // 1. Crear tabla logs_sistema si no existe
  const createSQL = `
    CREATE TABLE IF NOT EXISTS public.logs_sistema (
      id            BIGSERIAL PRIMARY KEY,
      tipo_evento   TEXT NOT NULL,
      session_id    TEXT,
      cliente_email TEXT,
      cliente_nombre TEXT,
      agente        TEXT,
      duracion_ms   INTEGER,
      datos         JSONB,
      timestamp     TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE public.logs_sistema ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='logs_sistema' AND policyname='logs insert anon') THEN
        CREATE POLICY "logs insert anon" ON public.logs_sistema FOR INSERT WITH CHECK (true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='logs_sistema' AND policyname='logs select anon') THEN
        CREATE POLICY "logs select anon" ON public.logs_sistema FOR SELECT USING (true);
      END IF;
    END $$;
  `;

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sql: createSQL }),
    });
    results.push({ paso: 'crear tabla logs_sistema', status: r.status });
  } catch(e) {
    results.push({ paso: 'crear tabla logs_sistema', error: e.message });
  }

  // 2. Insertar logs de prueba — últimos 7 días
  const now = new Date();
  const logsData = [];
  const clientes = [
    { nombre: 'Valentina López', email: 'valentina@gmail.com' },
    { nombre: 'Mateo García', email: 'mateo.garcia@hotmail.com' },
    { nombre: 'Sofía Martínez', email: 'sofia.m@gmail.com' },
    { nombre: 'Nicolás Rodríguez', email: 'nicolas.r@outlook.com' },
    { nombre: 'Camila Fernández', email: 'camila.f@gmail.com' },
    { nombre: 'Lucas Pérez', email: 'lucas.perez@gmail.com' },
    { nombre: 'Isabella Torres', email: 'isa.torres@gmail.com' },
    { nombre: 'Tomás Ramírez', email: 'tomas.r@hotmail.com' },
    { nombre: 'Lucía Díaz', email: 'lucia.d@gmail.com' },
    { nombre: 'Emilio Sánchez', email: 'emilio.s@gmail.com' },
    { nombre: 'Florencia Ruiz', email: 'flor.ruiz@gmail.com' },
    { nombre: 'Agustín Morales', email: 'agus.m@gmail.com' },
  ];

  // Generar sesiones para los últimos 7 días
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const baseDate = new Date(now);
    baseDate.setDate(baseDate.getDate() - daysAgo);

    // 2-5 sesiones por día
    const nSessions = daysAgo === 0 ? 3 : Math.floor(Math.random() * 4) + 2;
    for (let s = 0; s < nSessions; s++) {
      const cliente = clientes[Math.floor(Math.random() * clientes.length)];
      const sessionId = 'sess-seed-' + daysAgo + '-' + s;
      const startHour = 9 + Math.floor(Math.random() * 10);
      const startMin  = Math.floor(Math.random() * 60);
      const sessionStart = new Date(baseDate);
      sessionStart.setHours(startHour, startMin, 0, 0);

      // chat_inicio
      logsData.push({
        tipo_evento: 'chat_inicio',
        session_id: sessionId,
        cliente_email: cliente.email,
        cliente_nombre: cliente.nombre,
        timestamp: sessionStart.toISOString(),
      });

      // Mensajes de la sesión (3-12 mensajes)
      const nMsgs = Math.floor(Math.random() * 10) + 3;
      for (let m = 0; m < nMsgs; m++) {
        const msgTime = new Date(sessionStart.getTime() + (m + 1) * (30000 + Math.random() * 60000));
        logsData.push({
          tipo_evento: 'chat_mensaje',
          session_id: sessionId,
          cliente_email: cliente.email,
          agente: m < 2 ? 'leo' : (Math.random() > 0.4 ? 'reservas' : 'cami'),
          duracion_ms: Math.floor(800 + Math.random() * 3200),
          datos: { num_mensaje: m + 1 },
          timestamp: msgTime.toISOString(),
        });
      }

      // 40% de sesiones terminan en reserva_creada (los que tienen >6 mensajes)
      if (nMsgs > 6 && Math.random() > 0.5) {
        const resTime = new Date(sessionStart.getTime() + nMsgs * 60000);
        logsData.push({
          tipo_evento: 'reserva_creada',
          session_id: sessionId,
          cliente_email: cliente.email,
          agente: 'reservas',
          datos: {
            num_mensajes: nMsgs,
            tiempo_ms: nMsgs * 60000,
          },
          timestamp: resTime.toISOString(),
        });
      }
    }
  }

  // Insertar en lotes de 50
  for (let i = 0; i < logsData.length; i += 50) {
    const batch = logsData.slice(i, i + 50);
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/logs_sistema`, {
        method: 'POST',
        headers: sbAdminHeaders(),
        body: JSON.stringify(batch),
      });
      results.push({ paso: `logs batch ${i}-${i+batch.length}`, status: r.status });
    } catch(e) {
      results.push({ paso: `logs batch ${i}`, error: e.message });
    }
  }

  // 3. Insertar reservas de prueba si hay pocas
  const resCheck = await fetch(`${SUPABASE_URL}/rest/v1/reservas?select=id&limit=1`, { headers });
  const resData = await resCheck.json();
  if (!resData.length) {
    const campers = ['TC-ACS','TC-BLD','TC-CAR','TC-CCT','TC-HYM','TC-KSI','TC-PCA','TC-WCB'];
    const reservasSeed = clientes.slice(0,6).map((c, i) => {
      const fi = new Date(now); fi.setDate(fi.getDate() + 10 + i*5);
      const ff = new Date(fi); ff.setDate(ff.getDate() + 3 + Math.floor(Math.random()*4));
      const camper = campers[i % campers.length];
      const precios = { 'TC-ACS':4200,'TC-BLD':4900,'TC-CAR':3500,'TC-CCT':7200,'TC-HYM':3800,'TC-KSI':5800,'TC-PCA':3500,'TC-WCB':3500 };
      const noches = Math.round((ff-fi)/86400000);
      return {
        camper_key: camper,
        reserva_ref: 'RES-' + String(1000+i).padStart(4,'0'),
        cliente_nombre: c.nombre,
        cliente_email: c.email,
        cliente_documento: String(10000000 + i*1234567).substring(0,8),
        cliente_telefono: '09' + String(9000000 + i*1234).substring(0,7),
        fecha_inicio: fi.toISOString().split('T')[0],
        fecha_fin: ff.toISOString().split('T')[0],
        num_personas: 2 + (i % 4),
        estado_reserva: ['Confirmada','Confirmada','Pendiente','Confirmada','Completada','Pendiente'][i],
        precio_total: precios[camper] * noches,
      };
    });
    try {
      // Primero obtener camper_ids
      const campersRes = await fetch(`${SUPABASE_URL}/rest/v1/campers?select=id,key`, { headers });
      const campersData = await campersRes.json();
      const camperMap = {};
      if (Array.isArray(campersData)) campersData.forEach(c => { camperMap[c.key] = c.id; });

      const reservasConId = reservasSeed.map(r => ({
        ...r,
        camper_id: camperMap[r.camper_key] || null,
      })).filter(r => r.camper_id);

      const rr = await fetch(`${SUPABASE_URL}/rest/v1/reservas`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify(reservasConId),
      });
      results.push({ paso: 'reservas seed', status: rr.status });
    } catch(e) {
      results.push({ paso: 'reservas seed', error: e.message });
    }
  } else {
    results.push({ paso: 'reservas seed', status: 'ya existen reservas, omitido' });
  }

  res.json({ ok: true, total_logs: logsData.length, results });
});

/* ── ADMIN API — usa service_role para bypassar RLS ── */
function sbAdminHeaders() {
  const key = SUPABASE_SERV_KEY || SUPABASE_ANON_KEY;
  return {
    'Content-Type':  'application/json',
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Prefer':        'return=representation',
  };
}

// GET /api/admin/reservas — todas las reservas (sin RLS)
app.get('/api/admin/reservas', async (req, res) => {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/reservas?select=*&order=created_at.desc&limit=200`, {
      headers: sbAdminHeaders(),
    });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/logs — logs del sistema
app.get('/api/admin/logs', async (req, res) => {
  try {
    const tipo = req.query.tipo ? `&tipo_evento=eq.${req.query.tipo}` : '';
    const desde = req.query.desde ? `&timestamp=gte.${req.query.desde}` : '';
    const url = `${SUPABASE_URL}/rest/v1/logs_sistema?select=*&order=timestamp.desc&limit=500${tipo}${desde}`;
    const r = await fetch(url, { headers: sbAdminHeaders() });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/reservas/:id — cambiar estado
app.patch('/api/admin/reservas/:id', async (req, res) => {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/reservas?id=eq.${req.params.id}`, {
      method: 'PATCH',
      headers: sbAdminHeaders(),
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
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

// Sin cache para HTML y JS — el browser siempre descarga la version nueva
app.use(express.static(path.join(__dirname), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`TodoCamping corriendo en http://localhost:${PORT}`);
  console.log(`API key: ${ANTHROPIC_API_KEY ? 'configurada' : 'FALTA ANTHROPIC_API_KEY'}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  await runMigration();
});
