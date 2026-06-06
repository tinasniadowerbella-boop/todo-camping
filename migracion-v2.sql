-- ============================================================
-- MIGRACIÓN v2 — TodoCamping · Agente Remi (Reservas)
-- Ejecutar en el SQL Editor de Supabase ANTES de usar el widget.
-- Es seguro ejecutar varias veces (usa IF NOT EXISTS / IF EXISTS).
-- ============================================================

-- ── 1. Nuevas columnas en la tabla reservas ───────────────────
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS cliente_documento TEXT,
  ADD COLUMN IF NOT EXISTS cliente_telefono  TEXT,
  ADD COLUMN IF NOT EXISTS reserva_ref       TEXT;   -- ID legible: RES-0001

-- ── 2. Índice único para reserva_ref ─────────────────────────
--    Permite búsqueda rápida y evita duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_ref
  ON public.reservas (reserva_ref)
  WHERE reserva_ref IS NOT NULL;

-- ── 3. Actualizar políticas RLS ───────────────────────────────
--    Las políticas originales solo permiten acceso autenticado.
--    El widget usa la clave anon (pública), por lo que necesita
--    permisos de lectura/escritura para poder gestionar reservas.
--
--    ⚠️  NOTA DE SEGURIDAD: estas políticas permiten acceso público.
--    Para producción real, considera mover las llamadas a un backend
--    proxy con la clave de servicio (service_role key) en lugar de
--    exponer la clave anon con permisos de escritura.

DROP POLICY IF EXISTS "Solo autenticados pueden ver reservas"      ON public.reservas;
DROP POLICY IF EXISTS "Solo autenticados pueden escribir reservas" ON public.reservas;

CREATE POLICY "Widget — leer reservas"
  ON public.reservas FOR SELECT
  USING (true);

CREATE POLICY "Widget — insertar reservas"
  ON public.reservas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Widget — actualizar reservas"
  ON public.reservas FOR UPDATE
  USING (true);

CREATE POLICY "Widget — eliminar reservas"
  ON public.reservas FOR DELETE
  USING (true);

-- ── 4. (Opcional) Verificar resultado ────────────────────────
--    Ejecuta esta consulta para comprobar que las columnas existen:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'reservas'
--    ORDER BY ordinal_position;
