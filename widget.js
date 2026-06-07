/* ═══════════════════════════════════════════════════════
   TODOCAMPING — WIDGET IA v2 (Leo, Cami, Remi)
   Mejoras: presentación agentes, validaciones, contexto,
   tono unificado, moneda explícita, flujo modificación.
═══════════════════════════════════════════════════════ */
(function() {

var TC_CONFIG = {
  SUPABASE_URL:      'https://wgrqkffxwzwbzgjmbtsd.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndncnFrZmZ4d3p3Ynpnam1idHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODYzMjUsImV4cCI6MjA5NTY2MjMyNX0.gwqy3kr-PKXJ0ovnVrV3eUhPvwSmOdtNSUd-oKQ6ZDw',
  MODEL: 'claude-haiku-4-5-20251001',
};

fetch('/api/config').then(function(r){return r.json();}).then(function(cfg){
  if(cfg.supabaseUrl)     TC_CONFIG.SUPABASE_URL      = cfg.supabaseUrl;
  if(cfg.supabaseAnonKey) TC_CONFIG.SUPABASE_ANON_KEY = cfg.supabaseAnonKey;
  if(cfg.model)           TC_CONFIG.MODEL             = cfg.model;
  tcInitSupabase();
}).catch(function(){ tcInitSupabase(); });

var TC_MOCK = {
  campers: [
    { id:'C001', key:'TC-ACS', modelo:'Adria Coral 670 SL',       unidades:3, tipo:'Autocaravana', capacidad:4, precio_diario:95,  ac:true,  calefaccion:true,  cocina:true, bano:true,  estado:'Activo',        disponible:true  },
    { id:'C002', key:'TC-WCB', modelo:'Weinsberg CaraBus 600 MQ', unidades:5, tipo:'Furgoneta',    capacidad:2, precio_diario:65,  ac:false, calefaccion:true,  cocina:true, bano:false, estado:'Activo',        disponible:true  },
    { id:'C003', key:'TC-KSI', modelo:'Knaus Sun I 650 MEG',      unidades:2, tipo:'Autocaravana', capacidad:6, precio_diario:110, ac:true,  calefaccion:true,  cocina:true, bano:true,  estado:'Activo',        disponible:true  },
    { id:'C004', key:'TC-CCT', modelo:'Carthago C-Tourer T143',   unidades:2, tipo:'Autocaravana', capacidad:4, precio_diario:130, ac:true,  calefaccion:true,  cocina:true, bano:true,  estado:'Activo',        disponible:false },
    { id:'C005', key:'TC-CAR', modelo:'Carado CV600',              unidades:4, tipo:'Furgoneta',    capacidad:2, precio_diario:58,  ac:false, calefaccion:true,  cocina:true, bano:false, estado:'Mantenimiento', disponible:false },
    { id:'C006', key:'TC-BLD', modelo:'Burstner Lyseo TD690',     unidades:3, tipo:'Autocaravana', capacidad:4, precio_diario:105, ac:true,  calefaccion:true,  cocina:true, bano:true,  estado:'Activo',        disponible:true  },
    { id:'C007', key:'TC-HYM', modelo:'Hymer B-ML T580',          unidades:4, tipo:'Autocaravana', capacidad:2, precio_diario:78,  ac:false, calefaccion:true,  cocina:true, bano:true,  estado:'Activo',        disponible:true  },
    { id:'C008', key:'TC-PCA', modelo:'Possl Campster',            unidades:6, tipo:'Furgoneta',    capacidad:2, precio_diario:55,  ac:false, calefaccion:false, cocina:true, bano:false, estado:'Activo',        disponible:true  },
  ],
  reservas: [],
  _nextId: 1,
};

var TC_AGENTS = {
  leo:      { id:'leo',      name:'Leo',  role:'Bienvenida - TodoCamping',            avatar:'L', color:'#1e40af', colorDark:'#1e3a8a' },
  cami:     { id:'cami',     name:'Cami', role:'Asistente de flota - TodoCamping',    avatar:'C', color:'#2d7a4f', colorDark:'#1e5534' },
  reservas: { id:'reservas', name:'Remi', role:'Agente de reservas - TodoCamping',    avatar:'R', color:'#b45309', colorDark:'#92400e' },
};

var TC_HOY = (function(){
  var d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
})();

var TC_PROMPTS = {

leo: `Eres Leo, el primer punto de contacto de TodoCamping, empresa de alquiler de campers y autocaravanas en Madrid (Calle del Turismo 45, L-V 9-19h, Sáb 10-14h, +34 91 234 56 78, hola@todocamping.es).
FECHA HOY: ${TC_HOY}.

TONO: cálido y profesional. Tutea. Respuestas cortas. Máximo 1-2 emojis por mensaje. Sin exceso de signos de exclamación.

MISIÓN: Entender la necesidad del usuario y derivarlo al agente correcto.
- Deriva a "informativo" (Cami) para: preguntas sobre modelos, precios, disponibilidad, equipamiento, comparativas, recomendaciones.
- Deriva a "reservas" (Remi) para: hacer una reserva, consultar/modificar/cancelar una reserva existente.
- Responde tú mismo solo para: saludos puros, info de contacto u horario, intenciones muy ambiguas (haz UNA sola pregunta para clarificar).

REGLA CAPACIDAD: Si el usuario menciona más de 6 personas, avísale antes de derivar que la flota llega hasta 6 plazas por unidad, y que para más personas necesitaría 2 vehículos.

REGLA FECHAS: Si menciona fechas anteriores a ${TC_HOY}, pídele que confirme fechas futuras antes de derivar.

Usa SIEMPRE la herramienta derivar_agente para derivar. No menciones el traspaso en el texto previo.
NUNCA repitas el mensaje del usuario en tu respuesta. Si decides derivar directamente sin texto previo, simplemente llama a la herramienta sin ningún texto adicional.`,

cami: `Eres Cami, especialista en la flota de TodoCamping. Ayudas a los clientes a elegir el camper ideal.
FECHA HOY: ${TC_HOY}.

PRESENTACIÓN: Si recibes contexto de otro agente, preséntate brevemente al inicio: "Hola, soy Cami, me encargo de asesorarte sobre nuestra flota."

TONO: cercana, clara, profesional. Tutea. Máximo 1-2 emojis por mensaje. Sin exceso de negritas.

MONEDA: Todos los precios en PESOS URUGUAYOS. El precio es el número exacto del campo precio_diario (ej: si precio_diario=55, escribe $55 UYU/noche, NO $55.000). Escríbelo siempre así: "$55 UYU/noche" o "$110 UYU/noche". NUNCA uses solo "$" sin aclarar la moneda. NUNCA uses euros.

REGLAS:
1. Usa SIEMPRE consultar_campers antes de dar cualquier precio o disponibilidad. Nunca inventes datos.
2. Si el usuario no sabe qué elegir, pregúntale: "¿Qué es lo más importante para vos: el precio, el espacio o las comodidades?" Luego filtra según su respuesta.
3. Si la capacidad pedida supera 6 personas, avísalo ANTES de mostrar opciones: "Nuestra flota llega hasta 6 plazas por unidad. Para [N] personas necesitarías [X] vehículos."
4. Al presentar opciones, usa este formato limpio:
   🚐 [Modelo] — $[precio] UYU/noche
   Capacidad: [N] personas | [equipamiento clave]
   [Una línea de descripción]
5. Valida fechas: si son anteriores a ${TC_HOY}, pide corrección antes de continuar.
6. Cuando el usuario quiera reservar, usa pasar_a_reservas con todo el contexto (modelo elegido, fechas, personas).

SCOPE: solo info de flota. Para reservas, usa pasar_a_reservas.`,

reservas: `Eres Remi, el agente de reservas de TodoCamping. Gestionas el ciclo completo: crear, consultar, modificar y cancelar reservas.
FECHA HOY: ${TC_HOY}.

PRESENTACIÓN OBLIGATORIA: Cada vez que tomes la conversación (ya sea por derivación o directamente), preséntate en la PRIMERA línea de tu respuesta: "Hola, soy Remi, me encargo de gestionar tus reservas."
Si el usuario ya estaba hablando contigo, no repitas la presentación.

TONO: profesional y cálido. Tutea. Máximo 1-2 emojis por mensaje. Sin exceso de bullets.

MONEDA: Todos los precios en PESOS URUGUAYOS. El precio es el número exacto del campo precio_por_noche (ej: si precio_por_noche=55, escribe $55 UYU/noche, el total de 5 noches es $275 UYU). NUNCA formatees con puntos de miles a menos que el número lo requiera realmente. NUNCA uses solo "$". NUNCA uses euros.

═══ FLUJO NUEVA RESERVA (sigue este orden estrictamente) ═══
1. Si faltan: modelo + fecha_inicio + fecha_fin → pídelos. Una sola pregunta a la vez.
2. Valida fechas (deben ser futuras, fecha_fin > fecha_inicio). Si son inválidas, corrígelas antes de continuar.
3. Llama a verificar_disponibilidad. Si no hay stock, llama a buscar_disponibilidad_alternativa y ofrece opciones concretas.
4. Solo si hay disponibilidad: pide datos personales. NUNCA pidas nombre/email/documento/teléfono antes de confirmar disponibilidad.
   - Pide de a uno: primero nombre completo, luego email, luego documento, luego teléfono.
   - Valida email INMEDIATAMENTE al recibirlo: debe contener @ y un dominio válido (ej: usuario@gmail.com). Si es inválido, recházalo en el momento y pide uno correcto. NO continúes con un email inválido.
   - No preguntes "¿estos datos son a tu nombre?" si el usuario ya está hablando en primera persona.
5. Muestra resumen COMPLETO antes de confirmar:
   ✅ Resumen de tu reserva:
   - Camper: [modelo]
   - Fechas: [inicio] al [fin] ([N] noches)
   - Personas: [N]
   - Precio: $[precio_noche] UYU/noche × [N] noches = $[total] UYU
   - Titular: [nombre] | Doc: [doc] | Tel: [tel] | Email: [email]
   ¿Confirmas la reserva?
6. Solo tras "sí confirmo" u otra confirmación explícita: llama a crear_reserva.
7. Tras confirmar, muestra:
   ✅ ¡Reserva confirmada! ID: [REF]
   - Próximos pasos: recibirás un email de confirmación en [email]. Deberás presentar tu documento en el momento de retiro. El camper estará disponible a partir de las 10:00h del día de inicio.
   - ¿Necesitas algo más?

═══ FLUJO MODIFICACIÓN ═══
Si el usuario quiere cambiar algo de una reserva ya confirmada:
1. Identifica qué cambia (fechas, camper, personas, datos personales).
2. Si cambian fechas o camper: llama a verificar_disponibilidad para las NUEVAS fechas/camper. No asumas que hay disponibilidad.
3. Muestra el resumen con los cambios destacados y pide confirmación.
4. Tras confirmación: llama a modificar_reserva. Informa si la reserva anterior queda anulada y la nueva queda activa.

═══ VALIDACIONES OBLIGATORIAS ═══
- Email: debe contener @ y dominio (ej: usuario@dominio.com). Rechaza cualquier string sin @ o sin punto después del @.
- Documento: entre 5 y 20 caracteres alfanuméricos.
- Teléfono: entre 7 y 15 dígitos.
- Fechas: deben ser iguales o posteriores a ${TC_HOY}. fecha_fin > fecha_inicio.

═══ CONTEXTO ENTRE AGENTES ═══
Si recibes contexto de otro agente (modelo, fechas, personas ya confirmados), úsalo directamente. No le pidas al usuario datos que ya confirmó.

═══ AYUDA PARA DECIDIR ═══
Si el usuario no sabe qué camper elegir: usa pasar_a_cami para que Cami le ayude a comparar opciones.

SCOPE: solo gestión de reservas. Para info de modelos: pasar_a_cami.`,

};

var TC_TOOLS = {
  leo: [{
    name:'derivar_agente', description:'Deriva al agente correcto segun la intencion del usuario.',
    input_schema:{ type:'object', properties:{
      agente_destino:{type:'string',enum:['informativo','reservas']},
      mensaje_usuario:{type:'string'},
      contexto:{type:'object',properties:{resumen:{type:'string'},modelo:{type:'string'},fechas:{type:'string'},pax:{type:'integer'},presupuesto:{type:'string'}},required:['resumen']},
    }, required:['agente_destino','mensaje_usuario','contexto'] },
  }],
  cami:[
    {name:'consultar_campers',description:'Consulta el catalogo de campers. Usa SIEMPRE antes de dar precios o disponibilidad.',input_schema:{type:'object',properties:{estado:{type:'string'},disponible:{type:'boolean'},tipo:{type:'string'},capacidad_min:{type:'integer'},capacidad_max:{type:'integer'},precio_max:{type:'number'},precio_min:{type:'number'},tiene_ac:{type:'boolean'},tiene_bano:{type:'boolean'},tiene_calefaccion:{type:'boolean'}}}},
    {name:'pasar_a_reservas',description:'Transfiere al agente de reservas cuando el usuario quiere hacer una reserva.',input_schema:{type:'object',properties:{mensaje_usuario:{type:'string'},contexto:{type:'object',properties:{resumen:{type:'string'},modelo:{type:'string'},fechas:{type:'string'},pax:{type:'integer'},precio_por_noche:{type:'number'}},required:['resumen']}},required:['mensaje_usuario','contexto']}},
  ],
  reservas:[
    {name:'verificar_disponibilidad',description:'Verifica si un camper esta disponible para un rango de fechas. Llama SIEMPRE antes de pedir datos personales o confirmar.',input_schema:{type:'object',properties:{modelo:{type:'string'},fecha_inicio:{type:'string',description:'YYYY-MM-DD'},fecha_fin:{type:'string',description:'YYYY-MM-DD'}},required:['modelo','fecha_inicio','fecha_fin']}},
    {name:'crear_reserva',description:'Crea una reserva. Llama SOLO tras confirmacion explicita del usuario y con email validado.',input_schema:{type:'object',properties:{camper_modelo:{type:'string'},cliente_nombre:{type:'string'},cliente_documento:{type:'string'},cliente_telefono:{type:'string'},cliente_email:{type:'string'},fecha_inicio:{type:'string'},fecha_fin:{type:'string'},num_personas:{type:'integer'},notas:{type:'string'}},required:['camper_modelo','cliente_nombre','cliente_documento','cliente_telefono','cliente_email','fecha_inicio','fecha_fin']}},
    {name:'consultar_reserva',description:'Busca una reserva por email o ID de referencia.',input_schema:{type:'object',properties:{email:{type:'string'},id_reserva:{type:'string'}}}},
    {name:'listar_reservas_activas',description:'Lista todas las reservas con estado Confirmada o Pendiente.',input_schema:{type:'object',properties:{},required:[]}},
    {name:'modificar_reserva',description:'Modifica una reserva existente. Solo tras confirmacion. Si cambian fechas o camper, verifica disponibilidad antes.',input_schema:{type:'object',properties:{id_reserva:{type:'string'},camper_modelo:{type:'string'},fecha_inicio:{type:'string'},fecha_fin:{type:'string'},cliente_telefono:{type:'string'},cliente_email:{type:'string'},estado_reserva:{type:'string',enum:['Pendiente','Confirmada','Cancelada','Completada']},observaciones:{type:'string'}},required:['id_reserva']}},
    {name:'cancelar_reserva',description:'Cancela una reserva (estado Cancelada, queda en historial). Solo tras confirmacion.',input_schema:{type:'object',properties:{id_reserva:{type:'string'},motivo:{type:'string'}},required:['id_reserva']}},
    {name:'buscar_disponibilidad_alternativa',description:'Busca campers alternativos disponibles cuando el solicitado no tiene stock.',input_schema:{type:'object',properties:{fecha_inicio:{type:'string'},fecha_fin:{type:'string'},num_personas:{type:'integer'},precio_max:{type:'number'}},required:['fecha_inicio','fecha_fin']}},
    {name:'pasar_a_cami',description:'Pasa a Cami para que ayude a elegir modelo o compare opciones de flota.',input_schema:{type:'object',properties:{mensaje_usuario:{type:'string'},contexto:{type:'object',properties:{resumen:{type:'string'},fechas:{type:'string'},pax:{type:'integer'},presupuesto:{type:'string'}},required:['resumen']}},required:['mensaje_usuario','contexto']}},
  ],
};

var tcSb = null;
function tcInitSupabase() {
  if(TC_CONFIG.SUPABASE_URL && TC_CONFIG.SUPABASE_ANON_KEY && window.supabase)
    tcSb = window.supabase.createClient(TC_CONFIG.SUPABASE_URL, TC_CONFIG.SUPABASE_ANON_KEY);
}

function tcValidarEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e).trim()); }
function tcValidarTel(t)   { var d=String(t).replace(/[\s\-\+\(\)\.]/g,''); return d.length>=7&&d.length<=15&&/^\d+$/.test(d); }
function tcValidarDoc(d)   { var l=String(d).trim().replace(/[\.\-\s]/g,''); return l.length>=5&&l.length<=20&&/^[A-Za-z0-9]+$/.test(l); }

function tcParseFecha(s) {
  var p=(s||'').split(' ')[0].split('-').map(Number);
  if(p.length!==3||p.some(isNaN)) return null;
  return new Date(p[0],p[1]-1,p[2]);
}
function tcValidarFechas(fi,ff) {
  var hoy=new Date(); hoy.setHours(0,0,0,0);
  var a=tcParseFecha(fi),b=tcParseFecha(ff);
  if(!a) return {ok:false,error:'Fecha de inicio invalida. Usa el formato YYYY-MM-DD.'};
  if(!b) return {ok:false,error:'Fecha de fin invalida. Usa el formato YYYY-MM-DD.'};
  if(a<hoy){var s=new Date(a);s.setFullYear(hoy.getFullYear());if(s<hoy)s.setFullYear(hoy.getFullYear()+1);return {ok:false,error:'La fecha de inicio ya paso. Querias decir '+s.getFullYear()+'-'+String(s.getMonth()+1).padStart(2,'0')+'-'+String(s.getDate()).padStart(2,'0')+'?'};}
  if(b<=a) return {ok:false,error:'La fecha de fin debe ser posterior a la de inicio.'};
  return {ok:true};
}

function tcFindMock(q) {
  var ql=q.toLowerCase();
  return TC_MOCK.campers.find(function(c){return c.key.toLowerCase()===ql;})||
         TC_MOCK.campers.find(function(c){return c.modelo.toLowerCase().includes(ql);})||null;
}
async function tcFindCamper(q) {
  if(!q) return null;
  if(tcSb){try{var r=await tcSb.from('campers').select('*').ilike('modelo','%'+q+'%').limit(1);if(r.data&&r.data[0])return r.data[0];var r2=await tcSb.from('campers').select('*').ilike('key',q).limit(1);if(r2.data&&r2.data[0])return r2.data[0];}catch(e){}}
  return tcFindMock(q);
}

async function tcExecConsultarCampers(f) {
  var data=TC_MOCK.campers.slice();
  if(tcSb){try{var q=tcSb.from('campers').select('*');if(f.estado)q=q.eq('estado',f.estado);if(f.disponible!=null)q=q.eq('disponible',f.disponible);if(f.tipo)q=q.eq('tipo',f.tipo);if(f.capacidad_min)q=q.gte('capacidad',f.capacidad_min);if(f.capacidad_max)q=q.lte('capacidad',f.capacidad_max);if(f.precio_max)q=q.lte('precio_diario',f.precio_max);if(f.precio_min)q=q.gte('precio_diario',f.precio_min);if(f.tiene_ac)q=q.eq('ac',true);if(f.tiene_bano)q=q.eq('bano',true);if(f.tiene_calefaccion)q=q.eq('calefaccion',true);var r=await q.order('precio_diario',{ascending:true});if(!r.error&&r.data)data=r.data;}catch(e){}}
  else{if(f.estado)data=data.filter(function(c){return c.estado===f.estado;});if(f.disponible!=null)data=data.filter(function(c){return c.disponible===f.disponible;});if(f.tipo)data=data.filter(function(c){return c.tipo===f.tipo;});if(f.capacidad_min)data=data.filter(function(c){return c.capacidad>=f.capacidad_min;});if(f.capacidad_max)data=data.filter(function(c){return c.capacidad<=f.capacidad_max;});if(f.precio_max)data=data.filter(function(c){return c.precio_diario<=f.precio_max;});if(f.precio_min)data=data.filter(function(c){return c.precio_diario>=f.precio_min;});if(f.tiene_ac)data=data.filter(function(c){return c.ac;});if(f.tiene_bano)data=data.filter(function(c){return c.bano;});if(f.tiene_calefaccion)data=data.filter(function(c){return c.calefaccion;});data.sort(function(a,b){return a.precio_diario-b.precio_diario;});}
  return data.length?{total:data.length,campers:data}:{resultado:'Sin campers con esos filtros.',campers:[]};
}

async function tcExecVerificarDisp(args) {
  var fv=tcValidarFechas(args.fecha_inicio,args.fecha_fin);
  if(!fv.ok) return {disponible:false,error:fv.error};
  var camper=await tcFindCamper(args.modelo);
  if(!camper) return {disponible:false,motivo:'Camper "'+args.modelo+'" no encontrado. Modelos disponibles: '+TC_MOCK.campers.filter(function(c){return c.estado==='Activo';}).map(function(c){return c.modelo;}).join(', ')+'.'};
  if(camper.estado!=='Activo') return {disponible:false,motivo:'El camper '+camper.modelo+' esta en estado "'+camper.estado+'" y no puede reservarse.'};
  if(!camper.disponible) return {disponible:false,motivo:'El camper '+camper.modelo+' no esta disponible actualmente.'};
  var ocu=0;
  if(tcSb){try{var r=await tcSb.from('reservas').select('*',{count:'exact',head:true}).eq('camper_key',camper.key).in('estado_reserva',['Confirmada','Pendiente']).lte('fecha_inicio',args.fecha_fin).gte('fecha_fin',args.fecha_inicio);ocu=r.count||0;}catch(e){}}
  else{ocu=TC_MOCK.reservas.filter(function(r){return r.camper_key===camper.key&&['Confirmada','Pendiente'].includes(r.estado_reserva)&&r.fecha_inicio<=args.fecha_fin&&r.fecha_fin>=args.fecha_inicio;}).length;}
  var d=(camper.unidades||1)-ocu;
  return {disponible:d>0,modelo:camper.modelo,key:camper.key,precio_por_noche:camper.precio_diario,moneda:'pesos uruguayos (UYU)',unidades_disponibles:Math.max(0,d),nota_precio:'Todos los precios en pesos uruguayos (UYU)'};
}

async function tcExecCrearReserva(args) {
  var fv=tcValidarFechas(args.fecha_inicio,args.fecha_fin);
  if(!fv.ok) return {error:fv.error};
  if(!tcValidarEmail(args.cliente_email)) return {error:'Email invalido: "'+args.cliente_email+'". Debe tener formato usuario@dominio.com'};
  if(args.cliente_documento&&!tcValidarDoc(args.cliente_documento)) return {error:'Documento invalido: "'+args.cliente_documento+'". Acepta DNI, pasaporte, cedula (5-20 caracteres alfanumericos).'};
  if(args.cliente_telefono&&!tcValidarTel(args.cliente_telefono)) return {error:'Telefono invalido: "'+args.cliente_telefono+'". Debe tener entre 7 y 15 digitos.'};
  var camper=await tcFindCamper(args.camper_modelo);
  if(!camper) return {error:'Camper "'+args.camper_modelo+'" no encontrado.'};
  var fi=tcParseFecha(args.fecha_inicio),ff=tcParseFecha(args.fecha_fin);
  var noches=Math.round((ff-fi)/86400000);
  if(noches<=0) return {error:'Fecha fin debe ser posterior a inicio.'};
  var precio_total=camper.precio_diario*noches;
  if(tcSb){try{var cnt=await tcSb.from('reservas').select('*',{count:'exact',head:true});var ref='RES-'+String((cnt.count||0)+1).padStart(4,'0');var ins=await tcSb.from('reservas').insert({camper_id:camper.id,camper_key:camper.key,reserva_ref:ref,cliente_nombre:args.cliente_nombre,cliente_documento:args.cliente_documento||null,cliente_telefono:args.cliente_telefono||null,cliente_email:args.cliente_email,fecha_inicio:args.fecha_inicio.split(' ')[0],fecha_fin:args.fecha_fin.split(' ')[0],num_personas:args.num_personas||null,estado_reserva:'Pendiente',precio_total:precio_total,notas:args.notas||null}).select().single();if(ins.error)return{error:ins.error.message};return{ok:true,id_reserva:ref,modelo:camper.modelo,precio_total:precio_total,noches:noches,moneda:'pesos uruguayos (UYU)',email_cliente:args.cliente_email};}catch(e){}}
  var ref='RES-'+String(TC_MOCK._nextId++).padStart(4,'0');
  TC_MOCK.reservas.push({id:ref,reserva_ref:ref,camper_key:camper.key,camper_modelo:camper.modelo,cliente_nombre:args.cliente_nombre,cliente_documento:args.cliente_documento||null,cliente_telefono:args.cliente_telefono||null,cliente_email:args.cliente_email,fecha_inicio:args.fecha_inicio.split(' ')[0],fecha_fin:args.fecha_fin.split(' ')[0],num_personas:args.num_personas||null,estado_reserva:'Pendiente',precio_total:precio_total});
  return {ok:true,id_reserva:ref,modelo:camper.modelo,precio_total:precio_total,noches:noches,moneda:'pesos uruguayos (UYU)',email_cliente:args.cliente_email};
}

async function tcExecConsultarReserva(args) {
  if(tcSb){try{var q=tcSb.from('reservas').select('*');if(args.id_reserva)q=q.eq('reserva_ref',args.id_reserva);else if(args.email)q=q.ilike('cliente_email',args.email);var r=await q.limit(10);return r.data&&r.data.length?{reservas:r.data}:{resultado:'No se encontraron reservas con esos datos.'};}catch(e){}}
  var f=TC_MOCK.reservas;
  if(args.id_reserva)f=f.filter(function(r){return r.reserva_ref===args.id_reserva||r.id===args.id_reserva;});
  else if(args.email)f=f.filter(function(r){return r.cliente_email&&r.cliente_email.toLowerCase()===args.email.toLowerCase();});
  return f.length?{reservas:f}:{resultado:'No se encontraron reservas con esos datos.'};
}

async function tcExecListarActivas() {
  if(tcSb){try{var r=await tcSb.from('reservas').select('*').in('estado_reserva',['Confirmada','Pendiente']).order('fecha_inicio',{ascending:true});return{reservas:r.data||[],total:(r.data||[]).length};}catch(e){}}
  var f=TC_MOCK.reservas.filter(function(r){return['Confirmada','Pendiente'].includes(r.estado_reserva);});
  return{reservas:f,total:f.length};
}

async function tcExecModificarReserva(args) {
  if(tcSb){try{var updates={};if(args.fecha_inicio)updates.fecha_inicio=args.fecha_inicio;if(args.fecha_fin)updates.fecha_fin=args.fecha_fin;if(args.cliente_telefono)updates.cliente_telefono=args.cliente_telefono;if(args.cliente_email)updates.cliente_email=args.cliente_email;if(args.estado_reserva)updates.estado_reserva=args.estado_reserva;if(args.observaciones)updates.notas=args.observaciones;if(args.camper_modelo){var c=await tcSb.from('campers').select('id,key').ilike('modelo','%'+args.camper_modelo+'%').limit(1).single();if(c.data){updates.camper_id=c.data.id;updates.camper_key=c.data.key;}}var r=await tcSb.from('reservas').update(updates).eq('reserva_ref',args.id_reserva).select().single();if(r.error)return{error:r.error.message};return{ok:true,reserva:r.data,mensaje:'Reserva '+args.id_reserva+' actualizada correctamente.'};}catch(e){}}
  var idx=TC_MOCK.reservas.findIndex(function(r){return r.reserva_ref===args.id_reserva||r.id===args.id_reserva;});
  if(idx===-1) return{error:'Reserva '+args.id_reserva+' no encontrada.'};
  var r=TC_MOCK.reservas[idx];
  if(args.fecha_inicio)r.fecha_inicio=args.fecha_inicio;if(args.fecha_fin)r.fecha_fin=args.fecha_fin;
  if(args.cliente_telefono)r.cliente_telefono=args.cliente_telefono;if(args.cliente_email)r.cliente_email=args.cliente_email;
  if(args.estado_reserva)r.estado_reserva=args.estado_reserva;if(args.observaciones)r.notas=args.observaciones;
  return{ok:true,reserva:{...r},mensaje:'Reserva '+args.id_reserva+' actualizada correctamente.'};
}

async function tcExecCancelar(args) {
  if(tcSb){try{var u={estado_reserva:'Cancelada'};if(args.motivo)u.notas=args.motivo;var r=await tcSb.from('reservas').update(u).eq('reserva_ref',args.id_reserva);if(r.error)return{error:r.error.message};return{ok:true,id_reserva:args.id_reserva,estado:'Cancelada',mensaje:'Reserva cancelada. El historial se conserva.'};}catch(e){}}
  var r=TC_MOCK.reservas.find(function(x){return x.reserva_ref===args.id_reserva||x.id===args.id_reserva;});
  if(!r) return{error:'Reserva '+args.id_reserva+' no encontrada.'};
  r.estado_reserva='Cancelada';if(args.motivo)r.notas=args.motivo;
  return{ok:true,id_reserva:args.id_reserva,estado:'Cancelada',mensaje:'Reserva cancelada. El historial se conserva.'};
}

async function tcExecBuscarAlt(args) {
  var campers=TC_MOCK.campers.filter(function(c){return c.estado==='Activo'&&c.disponible;});
  if(args.num_personas)campers=campers.filter(function(c){return c.capacidad>=args.num_personas;});
  if(args.precio_max)campers=campers.filter(function(c){return c.precio_diario<=args.precio_max;});
  if(tcSb){try{var q=tcSb.from('campers').select('*').eq('estado','Activo').eq('disponible',true);if(args.num_personas)q=q.gte('capacidad',args.num_personas);if(args.precio_max)q=q.lte('precio_diario',args.precio_max);var r=await q.order('precio_diario',{ascending:true});if(r.data)campers=r.data;}catch(e){}}
  return{disponibles:campers.map(function(c){return{modelo:c.modelo,precio_diario:c.precio_diario,capacidad:c.capacidad,tipo:c.tipo};}),moneda:'pesos uruguayos (UYU)'};
}

/* ─── STATE ───
   history guarda solo pares {user:texto, assistant:texto}.
   Los ciclos tool_use/tool_result son locales al loop, no se persisten.
   Esto evita el error "unexpected tool_use_id" en turnos posteriores.
*/
var tcState = { current:'leo', histories:{ leo:[], cami:[], reservas:[] }, presentados:{leo:false,cami:false,reservas:false} };

async function tcCallClaude(system, tools, messages) {
  var body={model:TC_CONFIG.MODEL,max_tokens:1500,system:system,messages:messages};
  if(tools&&tools.length) body.tools=tools;
  var resp=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!resp.ok){var err=await resp.json().catch(function(){return{};});throw new Error((err.error&&err.error.message)||'Error '+resp.status);}
  return resp.json();
}

async function tcRunLoop(userText) {
  var agentId=tcState.current;
  var history=tcState.histories[agentId];
  var messages=history.slice();
  messages.push({role:'user',content:userText});
  var system=TC_PROMPTS[agentId];
  var tools=TC_TOOLS[agentId];

  for(var turn=0;turn<10;turn++){
    var result=await tcCallClaude(system,tools,messages);

    if(result.stop_reason==='end_turn'){
      var text=result.content.filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('');
      history.push({role:'user',content:userText});
      history.push({role:'assistant',content:[{type:'text',text:text}]});
      return{text:text,handoff:null};
    }

    if(result.stop_reason==='tool_use'){
      messages.push({role:'assistant',content:result.content});
      var toolResults=[];
      var handoff=null;

      for(var i=0;i<result.content.length;i++){
        var block=result.content[i];
        if(block.type!=='tool_use') continue;
        var output;

        if     (block.name==='derivar_agente')                   {handoff={agente:block.input.agente_destino,contexto:block.input.contexto,mensajeVisible:block.input.mensaje_usuario};output={ok:true};}
        else if(block.name==='pasar_a_reservas')                 {handoff={agente:'reservas',contexto:block.input.contexto,mensajeVisible:block.input.mensaje_usuario};output={ok:true};}
        else if(block.name==='pasar_a_cami')                     {handoff={agente:'cami',contexto:block.input.contexto,mensajeVisible:block.input.mensaje_usuario};output={ok:true};}
        else if(block.name==='consultar_campers')                {output=await tcExecConsultarCampers(block.input);}
        else if(block.name==='verificar_disponibilidad')         {output=await tcExecVerificarDisp(block.input);}
        else if(block.name==='crear_reserva')                    {output=await tcExecCrearReserva(block.input);}
        else if(block.name==='consultar_reserva')                {output=await tcExecConsultarReserva(block.input);}
        else if(block.name==='listar_reservas_activas')          {output=await tcExecListarActivas();}
        else if(block.name==='modificar_reserva')                {output=await tcExecModificarReserva(block.input);}
        else if(block.name==='cancelar_reserva')                 {output=await tcExecCancelar(block.input);}
        else if(block.name==='buscar_disponibilidad_alternativa'){output=await tcExecBuscarAlt(block.input);}
        else                                                      {output={error:'Herramienta desconocida: '+block.name};}

        toolResults.push({type:'tool_result',tool_use_id:block.id,content:JSON.stringify(output)});
      }

      if(handoff){return{text:handoff.mensajeVisible,handoff:handoff};}
      messages.push({role:'user',content:toolResults});
      continue;
    }

    var ft=result.content&&result.content.find(function(b){return b.type==='text';});
    var txt=ft?ft.text:'Respuesta inesperada.';
    history.push({role:'user',content:userText});
    history.push({role:'assistant',content:[{type:'text',text:txt}]});
    return{text:txt,handoff:null};
  }
  return{text:'Lo siento, tome demasiado tiempo procesando. Podrias repetir tu consulta?',handoff:null};
}

var TC_AGENT_MAP={informativo:'cami',reservas:'reservas'};

async function tcPerformHandoff(handoff) {
  var destId=TC_AGENT_MAP[handoff.agente]||handoff.agente;
  var destDef=TC_AGENTS[destId];
  tcAddHandoffEvent('Conectando con '+destDef.name+'...');
  tcState.current=destId;
  tcUpdateTheme(destDef);
  var ctx=handoff.contexto;
  var brief='[DERIVACION DE AGENTE. Contexto recibido: '+ctx.resumen+'.';
  if(ctx.modelo)brief+=' Modelo elegido: '+ctx.modelo+'.';
  if(ctx.fechas)brief+=' Fechas confirmadas: '+ctx.fechas+'.';
  if(ctx.pax)   brief+=' Personas: '+ctx.pax+'.';
  // No incluimos precio_por_noche para que Remi siempre verifique disponibilidad para las fechas actuales
  if(ctx.presupuesto)brief+=' Presupuesto: '+ctx.presupuesto+'.';
  brief+=' IMPORTANTE: Presentate con tu nombre y rol en la primera linea. Usa el contexto directamente sin pedir datos que el usuario ya confirmo.]';
  tcSetTyping(true);
  try{
    var r=await tcRunLoop(brief);
    tcSetTyping(false);
    if(r.text)tcAddAgentMsg(r.text,destId);
    if(r.handoff)await tcPerformHandoff(r.handoff);
  }catch(e){
    tcSetTyping(false);
    tcAddError('Error al conectar: '+e.message);
  }
}

function tcUpdateTheme(agent){
  document.getElementById('tc-chat-header').style.background   =agent.color;
  document.getElementById('tc-header-avatar').style.background =agent.colorDark;
  document.getElementById('tc-header-avatar').textContent=agent.avatar;
  document.getElementById('tc-header-name').textContent  =agent.name;
  document.getElementById('tc-header-role').textContent  =agent.role;
  document.getElementById('tc-send-btn').style.background  =agent.color;
  document.getElementById('tc-chat-bubble').style.background=agent.color;
}

function tcRenderMd(text){
  return text.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');
}
function tcAddUserMsg(text){
  var msgs=document.getElementById('tc-chat-messages'),tip=document.getElementById('tc-typing');
  var row=document.createElement('div');row.className='tc-msg-row user';
  var b=document.createElement('div');b.className='tc-bubble';b.textContent=text;
  row.appendChild(b);msgs.insertBefore(row,tip);msgs.scrollTop=msgs.scrollHeight;
}
function tcAddAgentMsg(text,agentId){
  if(!text||!text.trim())return;
  var agent=TC_AGENTS[agentId||tcState.current];
  var msgs=document.getElementById('tc-chat-messages'),tip=document.getElementById('tc-typing');
  var row=document.createElement('div');row.className='tc-msg-row agent';
  var av=document.createElement('div');av.className='tc-msg-avatar';av.dataset.agent=agent.id;av.textContent=agent.avatar;
  var b=document.createElement('div');b.className='tc-bubble';b.innerHTML=tcRenderMd(text);
  row.appendChild(av);row.appendChild(b);msgs.insertBefore(row,tip);msgs.scrollTop=msgs.scrollHeight;
}
function tcAddHandoffEvent(text){
  var msgs=document.getElementById('tc-chat-messages'),tip=document.getElementById('tc-typing');
  var div=document.createElement('div');div.className='tc-handoff-event';div.textContent=text;
  msgs.insertBefore(div,tip);msgs.scrollTop=msgs.scrollHeight;
}
function tcAddError(text){
  var msgs=document.getElementById('tc-chat-messages'),tip=document.getElementById('tc-typing');
  var div=document.createElement('div');div.className='tc-error-banner';div.textContent=text;
  msgs.insertBefore(div,tip);msgs.scrollTop=msgs.scrollHeight;
}
function tcSetTyping(v){
  document.getElementById('tc-typing').classList.toggle('visible',v);
  document.getElementById('tc-chat-messages').scrollTop=99999;
}
function tcSetDisabled(v){
  document.getElementById('tc-user-input').disabled=v;
  document.getElementById('tc-send-btn').disabled=v;
}

async function tcHandleSend(){
  var inp=document.getElementById('tc-user-input');
  var text=inp.value.trim();if(!text)return;
  inp.value='';
  tcAddUserMsg(text);tcSetTyping(true);tcSetDisabled(true);
  try{
    var r=await tcRunLoop(text);
    tcSetTyping(false);
    // No mostrar si el agente repitio exactamente el mensaje del usuario (bug del LLM)
    if(r.text && r.text.trim().toLowerCase() !== text.trim().toLowerCase()) tcAddAgentMsg(r.text);
    if(r.handoff)await tcPerformHandoff(r.handoff);
  }catch(err){
    tcSetTyping(false);
    tcAddError('Error: '+err.message);
  }finally{
    tcSetDisabled(false);
    document.getElementById('tc-user-input').focus();
  }
}

async function tcIniciar(){
  tcInitSupabase();tcUpdateTheme(TC_AGENTS.leo);
  tcSetTyping(true);tcSetDisabled(true);
  try{
    var result=await tcCallClaude(TC_PROMPTS.leo,TC_TOOLS.leo,[{role:'user',content:'(El usuario acaba de abrir el chat. Saludalo brevemente, presuntate como Leo de TodoCamping, y preguntale en que puedes ayudarle hoy. Maximo 2 lineas.)'}]);
    var text=result.content.filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('');
    tcSetTyping(false);
    tcAddAgentMsg(text||'Hola, soy Leo de TodoCamping. En que puedo ayudarte hoy?','leo');
  }catch(e){
    tcSetTyping(false);
    tcAddAgentMsg('Hola, soy Leo de TodoCamping. En que puedo ayudarte hoy?','leo');
  }finally{
    tcSetDisabled(false);
    document.getElementById('tc-user-input').focus();
  }
}

function tcSetupListeners(){
  var sendBtn=document.getElementById('tc-send-btn');
  var userInput=document.getElementById('tc-user-input');
  if(!sendBtn||!userInput){setTimeout(tcSetupListeners,100);return;}
  sendBtn.addEventListener('click',tcHandleSend);
  userInput.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();tcHandleSend();}});
  var closeBtn=document.getElementById('tc-chat-close');
  var bubble=document.getElementById('tc-chat-bubble');
  if(closeBtn)closeBtn.addEventListener('click',function(){document.getElementById('tc-chat-widget').classList.add('tc-hidden');if(bubble)bubble.classList.remove('tc-hidden');});
  if(bubble)bubble.addEventListener('click',function(){document.getElementById('tc-chat-widget').classList.remove('tc-hidden');bubble.classList.add('tc-hidden');document.getElementById('tc-user-input').focus();});
  tcIniciar();
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',tcSetupListeners);}
else{tcSetupListeners();}

})();
