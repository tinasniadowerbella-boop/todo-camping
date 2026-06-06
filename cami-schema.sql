-- ============================================================
-- SCHEMA SUPABASE — TodoCamping · Agente Cami
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase.
-- ============================================================

-- ── Tabla principal de campers ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campers (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key             TEXT UNIQUE NOT NULL,
  modelo          TEXT        NOT NULL,
  tipo            TEXT        NOT NULL CHECK (tipo IN ('Autocaravana', 'Furgoneta')),
  anio            INTEGER,
  capacidad       INTEGER     NOT NULL,
  camas           INTEGER,
  largo_m         NUMERIC(4,2),
  combustible     TEXT        CHECK (combustible IN ('Diesel', 'Gasolina', 'Electrico', 'Hibrido')),
  consumo_l_100km NUMERIC(4,1),
  precio_diario   NUMERIC(8,2) NOT NULL,
  unidades        INTEGER     NOT NULL DEFAULT 1 CHECK (unidades BETWEEN 1 AND 9),
  ac              BOOLEAN DEFAULT FALSE,
  calefaccion     BOOLEAN DEFAULT FALSE,
  cocina          BOOLEAN DEFAULT FALSE,
  bano            BOOLEAN DEFAULT FALSE,
  estado          TEXT DEFAULT 'Activo'
                  CHECK (estado IN ('Activo', 'Mantenimiento', 'Reparacion')),
  disponible      BOOLEAN DEFAULT TRUE,
  imagen_url      TEXT,
  descripcion     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Tabla de reservas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reservas (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  camper_id       TEXT NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  camper_key      TEXT NOT NULL,
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

-- ── Indices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_campers_estado     ON public.campers (estado);
CREATE INDEX IF NOT EXISTS idx_campers_disponible ON public.campers (disponible);
CREATE INDEX IF NOT EXISTS idx_campers_tipo       ON public.campers (tipo);
CREATE INDEX IF NOT EXISTS idx_campers_precio     ON public.campers (precio_diario);
CREATE INDEX IF NOT EXISTS idx_campers_capacidad  ON public.campers (capacidad);
CREATE INDEX IF NOT EXISTS idx_campers_key        ON public.campers (key);
CREATE INDEX IF NOT EXISTS idx_reservas_camper    ON public.reservas (camper_id);
CREATE INDEX IF NOT EXISTS idx_reservas_key       ON public.reservas (camper_key);
CREATE INDEX IF NOT EXISTS idx_reservas_fechas    ON public.reservas (fecha_inicio, fecha_fin);

-- ── Row Level Security (RLS) ──────────────────────────────────
ALTER TABLE public.campers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura publica campers"
  ON public.campers FOR SELECT USING (true);
CREATE POLICY "Escritura solo autenticados campers"
  ON public.campers FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados pueden ver reservas"
  ON public.reservas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Solo autenticados pueden escribir reservas"
  ON public.reservas FOR ALL USING (auth.role() = 'authenticated');

-- ── Trigger updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_campers_updated_at
  BEFORE UPDATE ON public.campers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- DATOS DE EJEMPLO
-- ============================================================
INSERT INTO public.campers
  (key, modelo, tipo, anio, capacidad, camas, largo_m, combustible, consumo_l_100km,
   precio_diario, unidades, ac, calefaccion, cocina, bano, estado, disponible, descripcion)
VALUES
  ('TC-ACS', 'Adria Coral 670 SL',       'Autocaravana', 2022, 4, 2, 6.90, 'Diesel',  9.5,  95.00, 3, TRUE,  TRUE,  TRUE,  TRUE,  'Activo',        TRUE,  'Autocaravana familiar con bano completo y salon amplio.'),
  ('TC-WCB', 'Weinsberg CaraBus 600 MQ', 'Furgoneta',    2023, 2, 1, 5.99, 'Diesel',  7.2,  65.00, 5, FALSE, TRUE,  TRUE,  FALSE, 'Activo',        TRUE,  'Furgoneta compacta ideal para pareja, facil de aparcar.'),
  ('TC-KSI', 'Knaus Sun I 650 MEG',      'Autocaravana', 2021, 6, 3, 6.99, 'Diesel', 10.2, 110.00, 2, TRUE,  TRUE,  TRUE,  TRUE,  'Activo',        TRUE,  'Perfecta para familia grande. Tres zonas de cama independientes.'),
  ('TC-CCT', 'Carthago C-Tourer T143',   'Autocaravana', 2020, 4, 2, 7.39, 'Diesel', 11.0, 130.00, 2, TRUE,  TRUE,  TRUE,  TRUE,  'Activo',        FALSE, 'Gama premium con materiales de lujo y garaje trasero.'),
  ('TC-CAR', 'Carado CV600',             'Furgoneta',    2022, 2, 1, 5.99, 'Diesel',  7.8,  58.00, 4, FALSE, TRUE,  TRUE,  FALSE, 'Mantenimiento', FALSE, 'Furgoneta polivalente, actualmente en revision anual.'),
  ('TC-BLD', 'Burstner Lyseo TD690',     'Autocaravana', 2023, 4, 2, 6.99, 'Diesel',  9.8, 105.00, 3, TRUE,  TRUE,  TRUE,  TRUE,  'Activo',        TRUE,  'Diseno moderno con techo elevable y cocina de induccion.'),
  ('TC-HYM', 'Hymer B-ML T580',          'Autocaravana', 2019, 2, 1, 5.72, 'Diesel',  8.9,  78.00, 4, FALSE, TRUE,  TRUE,  TRUE,  'Activo',        TRUE,  'Autocaravana compacta para pareja viajera con bano integrado.'),
  ('TC-PCA', 'Possl Campster',           'Furgoneta',    2023, 2, 1, 4.99, 'Diesel',  6.8,  55.00, 6, FALSE, FALSE, TRUE,  FALSE, 'Activo',        TRUE,  'La mas compacta del catalogo. Sin calefaccion, ideal primavera-otono.')
ON CONFLICT (key) DO NOTHING;
