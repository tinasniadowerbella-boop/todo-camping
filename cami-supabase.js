/**
 * cami-supabase.js
 * Módulo de consultas a Supabase para el agente Cami de TodoCamping.
 *
 * USO (Node.js / backend):
 *   const { createCamiDB } = require('./cami-supabase');
 *   const db = createCamiDB(SUPABASE_URL, SUPABASE_ANON_KEY);
 *   const campers = await db.getCampersDisponibles();
 *
 * También funciona en el navegador si importas @supabase/supabase-js via CDN o bundler.
 */

const { createClient } = require('@supabase/supabase-js');

/**
 * Fábrica principal. Devuelve el objeto db con todos los métodos de consulta.
 * @param {string} supabaseUrl
 * @param {string} supabaseAnonKey
 */
function createCamiDB(supabaseUrl, supabaseAnonKey) {
  const client = createClient(supabaseUrl, supabaseAnonKey);

  /* ──────────────────────────────────────────────────────────────
     Consulta base: aplica filtros opcionales a la tabla "campers"
     ────────────────────────────────────────────────────────────── */
  async function queryBase(filtros = {}) {
    let q = client.from('campers').select('*');

    if (filtros.estado !== undefined)
      q = q.eq('estado', filtros.estado);

    if (filtros.disponible !== undefined)
      q = q.eq('disponible', filtros.disponible);

    if (filtros.tipo !== undefined)
      q = q.eq('tipo', filtros.tipo);

    if (filtros.capacidad_min !== undefined)
      q = q.gte('capacidad', filtros.capacidad_min);

    if (filtros.capacidad_max !== undefined)
      q = q.lte('capacidad', filtros.capacidad_max);

    if (filtros.precio_max !== undefined)
      q = q.lte('precio_diario', filtros.precio_max);

    if (filtros.precio_min !== undefined)
      q = q.gte('precio_diario', filtros.precio_min);

    if (filtros.modelo !== undefined)
      q = q.ilike('modelo', `%${filtros.modelo}%`);

    // Equipamiento (columnas booleanas: ac, bano, calefaccion, cocina)
    if (filtros.tiene_ac === true)          q = q.eq('ac', true);
    if (filtros.tiene_bano === true)        q = q.eq('bano', true);
    if (filtros.tiene_calefaccion === true) q = q.eq('calefaccion', true);
    if (filtros.tiene_cocina === true)      q = q.eq('cocina', true);

    // Combustible
    if (filtros.combustible !== undefined)
      q = q.eq('combustible', filtros.combustible);

    // Número de camas
    if (filtros.camas_min !== undefined)
      q = q.gte('camas', filtros.camas_min);

    q = q.order('precio_diario', { ascending: true });

    const { data, error } = await q;
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data ?? [];
  }

  /* ──────────────────────────────────────────────────────────────
     Métodos públicos
     ────────────────────────────────────────────────────────────── */

  /** Todos los campers activos y disponibles */
  async function getCampersDisponibles() {
    return queryBase({ estado: 'Activo', disponible: true });
  }

  /** Un camper concreto por modelo (coincidencia exacta) */
  async function getCamperPorModelo(modelo) {
    const { data, error } = await client
      .from('campers')
      .select('*')
      .ilike('modelo', modelo)
      .limit(1)
      .single();
    if (error) return null;
    return data;
  }

  /**
   * Filtrado flexible para el agente.
   * Acepta el objeto "filtros" tal como lo genera Claude.
   */
  async function filtrarCampers(filtros = {}) {
    // Si el agente no pide un estado concreto, devolvemos todos (incl. no disponibles)
    return queryBase(filtros);
  }

  /** Campers disponibles para un rango de precios */
  async function getCampersPorPresupuesto(precioMaxDia) {
    return queryBase({ estado: 'Activo', disponible: true, precio_max: precioMaxDia });
  }

  /** Campers que caben al menos N personas */
  async function getCampersPorCapacidad(personas) {
    return queryBase({ estado: 'Activo', disponible: true, capacidad_min: personas });
  }

  /** Campers con equipamiento específico */
  async function getCampersConEquipamiento({ ac, bano, calefaccion, cocina } = {}) {
    return queryBase({
      estado: 'Activo',
      disponible: true,
      ...(ac          !== undefined ? { tiene_ac: ac }                 : {}),
      ...(bano        !== undefined ? { tiene_bano: bano }             : {}),
      ...(calefaccion !== undefined ? { tiene_calefaccion: calefaccion } : {}),
      ...(cocina      !== undefined ? { tiene_cocina: cocina }         : {}),
    });
  }

  /**
   * Verificar disponibilidad por fechas.
   * Requiere tabla "reservas" con columnas: camper_id, fecha_inicio, fecha_fin.
   * Devuelve los modelos disponibles para el rango dado.
   */
  async function getCampersDisponiblesPorFechas(fechaInicio, fechaFin) {
    // 1. Obtener IDs de campers ocupados en el rango
    const { data: reservas, error: rErr } = await client
      .from('reservas')
      .select('camper_id')
      .or(
        `fecha_inicio.lte.${fechaFin},fecha_fin.gte.${fechaInicio}`
      );

    if (rErr) throw new Error(`Error al consultar reservas: ${rErr.message}`);

    const idsOcupados = (reservas ?? []).map(r => r.camper_id);

    // 2. Traer campers activos que NO estén ocupados
    let q = client
      .from('campers')
      .select('*')
      .eq('estado', 'Activo')
      .eq('disponible', true);

    if (idsOcupados.length > 0) {
      q = q.not('id', 'in', `(${idsOcupados.join(',')})`);
    }

    const { data, error } = await q.order('precio_diario', { ascending: true });
    if (error) throw new Error(`Error al consultar campers: ${error.message}`);
    return data ?? [];
  }

  /** Alternativas cuando un modelo está en mantenimiento */
  async function getAlternativasSimilares({ tipo, capacidadMin, precioMax }) {
    return queryBase({
      estado: 'Activo',
      disponible: true,
      ...(tipo          ? { tipo }                       : {}),
      ...(capacidadMin  ? { capacidad_min: capacidadMin } : {}),
      ...(precioMax     ? { precio_max: precioMax }       : {}),
    });
  }

  /* ──────────────────────────────────────────────────────────────
     Objeto público del módulo
     ────────────────────────────────────────────────────────────── */
  return {
    getCampersDisponibles,
    getCamperPorModelo,
    filtrarCampers,
    getCampersPorPresupuesto,
    getCampersPorCapacidad,
    getCampersConEquipamiento,
    getCampersDisponiblesPorFechas,
    getAlternativasSimilares,
    // Acceso al cliente crudo por si se necesita
    _client: client,
  };
}

module.exports = { createCamiDB };
