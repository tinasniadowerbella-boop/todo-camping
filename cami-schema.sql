-- ============================================================
-- SCHEMA SUPABASE — TodoCamping · Agente Cami
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase.
-- ============================================================

-- ── Tabla principal de campers ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campers (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  modelo          TEXT        NOT NULL,
  tipo            TEXT        NOT NULL CHECK (tipo IN ('Autocaravana', 'Furgoneta')),
  año             INTEGER,
  capacidad       INTEGER     NOT NULL,   -- nº de plazas (personas)
  camas           INTEGER,
  largo_m         NUMERIC(4,2),           -- longitud en metros
  combustible     TEXT        CHECK (combustible IN ('Diesel', 'Gasolina', 'Eléctrico', 'Híbrido')),
  consumo_l_100km NUMERIC(4,1),
  precio_diario   NUMERIC(8,2) NOT NULL,
  -- Equipamiento (columnas booleanas para filtrado eficiente)
  ac              BOOLEAN DEFAULT FALSE,
  calefaccion     BOOLEAN DEFAULT FALSE,
  cocina          BOOLEAN DEFAULT FALSE,
  bano            BOOLEAN DEFAULT FALSE,
  -- Estado operativo
  estado          TEXT DEFAULT 'Activo'
                  CHECK (estado IN ('Activo', 'Mantenimiento', 'Reparación')),
  disponible      BOOLEAN DEFAULT TRUE,
  -- Imagen y descripción (opcionales, para la UI)
  imagen_url      TEXT,
  descripcion     TEXT,
  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Tabla de reservas (para disponibilidad por fechas) ────────
CREATE TABLE IF NOT EXISTS public.reservas (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  camper_id       TEXT NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  cliente_nombre  TEXT,
  cliente_email   TEXT,
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  num_personas    INTEGER,
  estado_reserva  TEXT DEFAULT 'Confirmada'
                  CHECK (estado_reserva IN ('Pendiente', 'Confirmada', 'Cancelada', 'Completada')),
  precio_total    NUMERIC(10,2),
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fechas_validas CHECK (fecha_fin > fecha_inicio)
);

-- ── Índices para filtrados frecuentes ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_campers_estado     ON public.campers (estado);
CREATE INDEX IF NOT EXISTS idx_campers_disponible ON public.campers (disponible);
CREATE INDEX IF NOT EXISTS idx_campers_tipo       ON public.campers (tipo);
CREATE INDEX IF NOT EXISTS idx_campers_precio     ON public.campers (precio_diario);
CREATE INDEX IF NOT EXISTS idx_campers_capacidad  ON public.campers (capacidad);
CREATE INDEX IF NOT EXISTS idx_reservas_camper    ON public.reservas (camper_id);
CREATE INDEX IF NOT EXISTS idx_reservas_fechas    ON public.reservas (fecha_inicio, fecha_fin);

-- ── Row Level Security (RLS) ──────────────────────────────────
-- Campers: lectura pública; escritura solo autenticados.
ALTER TABLE public.campers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura pública campers"
  ON public.campers FOR SELECT USING (true);
CREATE POLICY "Escritura solo autenticados campers"
  ON public.campers FOR ALL USING (auth.role() = 'authenticated');

-- Reservas: solo el sistema/admin las ve; el chat no expone datos de reservas de otros.
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados pueden ver reservas"
  ON public.reservas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Solo autenticados pueden escribir reservas"
  ON public.reservas FOR ALL USING (auth.role() = 'authenticated');

-- ── Trigger: actualizar updated_at automáticamente ────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_campers_updated_at
  BEFORE UPDATE ON public.campers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- DATOS DE EJEMPLO — borra o adapta a tu catálogo real
-- ============================================================
INSERT INTO public.campers
  (modelo, tipo, año, capacidad, camas, largo_m, combustible, consumo_l_100km,
   precio_diario, ac, calefaccion, cocina, bano, estado, disponible, descripcion)
VALUES
  ('Adria Coral 670 SL',   'Autocaravana', 2022, 4, 2, 6.9,  'Diesel', 9.5,  95.00, TRUE,  TRUE,  TRUE, TRUE,  'Activo', TRUE,  'Autocaravana familiar con baño completo y zona salón amplia.'),
  ('Weinsberg CaraBus 600 MQ', 'Furgoneta', 2023, 2, 1, 5.99, 'Diesel', 7.2,  65.00, FALSE, TRUE,  TRUE, FALSE, 'Activo', TRUE,  'Furgoneta compacta ideal para pareja, fácil de aparcar.'),
  ('Knaus Sun I 650 MEG',  'Autocaravana', 2021, 6, 3, 6.99, 'Diesel', 10.2, 110.00, TRUE,  TRUE,  TRUE, TRUE,  'Activo', TRUE,  'Perfecta para familia grande. Tres zonas de cama independientes.'),
  ('Carthago C-Tourer T143', 'Autocaravana', 2020, 4, 2, 7.39, 'Diesel', 11.0, 130.00, TRUE, TRUE, TRUE, TRUE, 'Activo', FALSE, 'Gama premium con materiales de lujo y garaje trasero.'),
  ('Carado CV600',         'Furgoneta',    2022, 2, 1, 5.99, 'Diesel', 7.8,  58.00, FALSE, TRUE,  TRUE, FALSE, 'Mantenimiento', FALSE, 'Furgoneta polivalente, actualmente en revisión anual.'),
  ('Bürstner Lyseo TD690', 'Autocaravana', 2023, 4, 2, 6.99, 'Diesel', 9.8,  105.00, TRUE, TRUE,  TRUE, TRUE,  'Activo', TRUE,  'Diseño moderno con techo elevable y cocina de inducción.'),
  ('Hymer B-ML T580',      'Autocaravana', 2019, 2, 1, 5.72, 'Diesel', 8.9,  78.00, FALSE, TRUE,  TRUE, TRUE,  'Activo', TRUE,  'Autocaravana compacta para pareja viajera con baño integrado.'),
  ('Pössl Campster',       'Furgoneta',    2023, 2, 1, 4.99, 'Diesel', 6.8,  55.00, FALSE, FALSE, TRUE, FALSE, 'Activo', TRUE,  'La más compacta del catálogo. Sin calefacción, ideal primavera-otoño.')
ON CONFLICT (id) DO NOTHING;
