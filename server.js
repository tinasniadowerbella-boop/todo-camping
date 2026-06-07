/**
 * server.js — Backend TodoCamping
 * Sirve los archivos estáticos + hace de proxy para la API de Anthropic
 * + ejecuta migración de BD al arrancar
 */

const express  = require('express');
const path     = require('path');
const fetch    = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Variables de entorno ────────────────────────────────────────────
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL       = process.env.SUPABASE_URL      || 'https://wgrqkffxwzwbzgjmbtsd.supabase.co';
const SUPABASE_ANON_KEY  = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERV_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY; // opcional, para migración
const MODEL              = process.env.MODEL             || 'claude-haiku-4-5-20251001';

// ── Middleware ──────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Migración Supabase ──────────────────────────────────────────────
// Ejecuta al arrancar y también disponible como endpoint manual
async function runMigration() {
  const key = SUPABASE_SERV_KEY || SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !key) {
    console.log('⚠️  Migración omitida: faltan credenciales Supabase');
    return;
  }

  // Pasos de migración usando la REST API de Supabase (RPC o queries directas)
  const steps = [
    // 1. Agregar columnas faltantes en reservas
    {
      desc: 'Agregar columnas cliente_documento, cliente_telefono, reserva_ref',
      sql: `ALTER TABLE public.reservas
              ADD COLUMN IF NOT EXISTS cliente_documento TEXT,
              ADD COLUMN IF NOT EXISTS cliente_telefono  TEXT,
              ADD COLUMN IF NOT EXISTS reserva_ref       TEXT;`
    },
    // 2. Índice único en reserva_ref
    {
      desc: 'Crear índice único en reserva_ref',
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_ref
              ON public.reservas (reserva_ref)
              WHERE reserva_ref IS NOT NULL;`
    },
    // 3. Políticas RLS para el widget (acceso anon)
    {
      desc: 'Abrir políticas RLS para el widget',
      sql: `
        DROP POLICY IF EXISTS "Solo autenticados pueden ver reservas" ON public.reservas;
        DROP POLICY IF EXISTS "Solo autenticados pueden escribir reservas" ON public.reservas;
      `
    },
    {
      desc: 'Crear política lectura anon',
      sql: `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reservas' AND policyname='Widget leer reservas') THEN
          CREATE POLICY "Widget leer reservas" ON public.reservas FOR SELECT USING (true);
        END IF;
      END $$;`
    },
    {
      desc: 'Crear política inserción anon',
      sql: `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reservas' AND policyname='Widget insertar reservas') THEN
          CREATE POLICY "Widget insertar reservas" ON public.reservas FOR INSERT WITH CHECK (true);
        END IF;
      END $$;`
    },
    {
      desc: 'Crear política actualización anon',
      sql: `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reservas' AND policyname='Widget actualizar reservas') THEN
          CREATE POLICY "Widget actualizar reservas" ON public.reservas FOR UPDATE USING (true);
        END IF;
      END $$;`
    },
    {
      desc: 'Crear política eliminación anon',
      sql: `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reservas' AND policyname='Widget eliminar reservas') THEN
          CREATE POLICY "Widget eliminar reservas" ON public.reservas FOR DELETE USING (true);
        END IF;
      END $$;`
    },
  ];

  console.log('🔄 E