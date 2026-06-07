/* ═══════════════════════════════════════════════════════
   TODOCAMPING — WIDGET IA (Leo, Cami, Remi)
═══════════════════════════════════════════════════════ */
(function() {

var TC_CONFIG = {
  SUPABASE_URL:      'https://wgrqkffxwzwbzgjmbtsd.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndncnFrZmZ4d3p3Ynpnam1idHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODYzMjUsImV4cCI6MjA5NTY2MjMyNX0.gwqy3kr-PKXJ0ovnVrV3eUhPvwSmOdtNSUd-oKQ6ZDw',
  MODEL: 'claude-haiku-4-5-20251001',
};

fetch('/api/config').then(function(r){return r.json();}).then(function(cfg){
  if (cfg.supabaseUrl)     TC_CONFIG.SUPABASE_URL      = cfg.supabaseUrl;
  if (cfg.supabaseAnonKey) TC_CONFIG.SUPABASE_ANON_KEY = cfg.supabaseAnonKey;
  if (cfg.model)           TC_CONFIG.MODEL             = cfg.model;
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
  cami:     { id:'cami',     name:'Cami', role:'Asistente informativo - TodoCamping', avatar:'C', color:'#2d7a4f', colorDark:'#1e5534' },
  reservas: { id:'reservas', name:'Remi', role:'Agente de reservas - TodoCamping',    avatar:'R', color:'#b45309', colorDark:'#92400e' },
};

var TC_HOY = (function(){
  var d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
})();

var TC_PROMPTS = {
  leo: 'Eres Leo, asistente de bienvenida de TodoCamping (alquiler de campers en Madrid). FECHA HOY: '+TC_HOY+'. MISION: detectar intencion y derivar con derivar_agente. TONO: cercano, breve, tuteas. Deriva a "informativo" para info de campers/precios/disponibilidad. Deriva a "reservas" para reservar/cancelar/consultar reservas. Responde solo para saludos, contacto o intenciones ambiguas. Usa SIEMPRE derivar_agente para derivar.',
  cami: 'Eres Cami, asistente informativa de campers de TodoCamping. FECHA HOY: '+TC_HOY+'. MONEDA: Pesos argentinos ($). Nunca euros. Usa consultar_campers antes de dar datos. Recomienda 1-3 opciones. Para reservar usa pasar_a_reservas.',
  reservas: 'Eres Remi, agente de reservas de TodoCamping. FECHA HOY: '+TC_HOY+'. MONEDA: Pesos argentinos ($). ORDEN RESERVA: 1) pedir modelo+fechas, 2) verificar_disponibilidad, 3) pedir datos personales, 4) mostrar resumen y precio, 5) crear_reserva solo tras confirmacion. Para info de modelos usa pasar_a_cami.',
};

var TC_TOOLS = {
  leo: [{
    name:'derivar_agente', description:'Deriva al agente correcto segun la intencion.',
    input_schema:{ type:'object', properties:{
      agente_destino:{type:'string',enum:['informativo','reservas']},
      mensaje_usuario:{type:'string'},
      contexto:{type:'object',properties:{resumen:{type:'string'},modelo:{type:'string'},fechas:{type:'string'},pax:{type:'integer'}},required:['resumen']},
    }, required:['agente_destino','mensaje_usuario','contexto'] },
  }],
  cami:[
    {name:'consultar_campers',description:'Consulta catalogo de campers.',input_schema:{type:'object',properties:{estado:{type:'string'},disponible:{type:'boolean'},tipo:{type:'string'},capacidad_min:{type:'integer'},precio_max:{type:'number'},tiene_ac:{type:'boolean'},tiene_bano:{type:'boolean'}}}},
    {name:'pasar_a_reservas',description:'Transfiere al agente de reservas.',input_schema:{type:'object',properties:{mensaje_usuario:{type:'string'},contexto:{type:'object',properties:{resumen:{type:'string'},modelo:{type:'string'},fechas:{type:'string'},pax:{type:'integer'}},required:['resumen']}},required:['mensaje_usuario','contexto']}},
  ],
  reservas:[
    {name:'verificar_disponibilidad',description:'Verifica disponibilidad de un camper para fechas.',input_schema:{type:'object',properties:{modelo:{type:'string'},fecha_inicio:{type:'string'},fecha_fin:{type:'string'}},required:['modelo','fecha_inicio','fecha_fin']}},
    {name:'crear_reserva',description:'Crea reserva tras confirmacion explicita.',input_schema:{type:'object',properties:{camper_modelo:{type:'string'},cliente_nombre:{type:'string'},cliente_documento:{type:'string'},cliente_telefono:{type:'string'},cliente_email:{type:'string'},fecha_inicio:{type:'string'},fecha_fin:{type:'string'},num_personas:{type:'integer'}},required:['camper_modelo','cliente_nombre','cliente_documento','cliente_telefono','cliente_email','fecha_inicio','fecha_fin']}},
    {name:'consultar_reserva',description:'Busca reserva por email o ID.',input_schema:{type:'object',properties:{email:{type:'string'},id_reserva:{type:'string'}}}},
    {name:'listar_reservas_activas',description:'Lista todas las reservas activas.',input_schema:{type:'object',properties:{},required:[]}},
    {name:'cancelar_reserva',description:'Cancela reserva tras confirmacion.',input_schema:{type:'object',properties:{id_reserva:{type:'string'},motivo:{type:'string'}},required:['id_reserva']}},
    {name:'buscar_disponibilidad_alternativa',description:'Busca campers alternativos disponibles.',input_schema:{type:'object',properties:{fecha_inicio:{type:'string'},fecha_fin:{type:'string'},num_personas:{type:'integer'}},required:['fecha_inicio','fecha_fin']}},
    {name:'pasar_a_cami',description:'Pasa a Cami para info de modelos.',input_schema:{type:'object',properties:{mensaje_usuario:{type:'string'},contexto:{type:'object',properties:{resumen:{type:'string'}},required:['resumen']}},required:['mensaje_usuario','contexto']}},
  ],
};

var tcSb = null;
function tcInitSupabase() {
  if (TC_CONFIG.SUPABASE_URL && TC_CONFIG.SUPABASE_ANON_KEY && window.supabase)
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
  if(!a) return {ok:false,error:'Fecha de inicio invalida (YYYY-MM-DD).'};
  if(!b) return {ok:false,error:'Fecha de fin invalida (YYYY-MM-DD).'};
  if(a<hoy){var s=new Date(a);s.setFullYear(hoy.getFullYear());if(s<hoy)s.setFullYear(hoy.getFullYear()+1);return {ok:false,error:'Fecha inicio ya paso. Querias decir '+s.getFullYear()+'-'+String(s.getMonth()+1).padStart(2,'0')+'-'+String(s.getDate()).padStart(2,'0')+'?'};}
  if(b<=a) return {ok:false,error:'Fecha fin debe ser posterior a inicio.'};
  return {ok:true};
}

function tcFindMock(q) {
  var ql=q.toLowerCase();
  return TC_MOCK.campers.find(function(c){return c.key.toLowerCase()===ql;})||
         TC_MOCK.campers.find(function(c){return c.modelo.toLowerCase().includes(ql);})||null;
}
async function tcFindCamper(q) {
  if(!q) return null;
  if(tcSb){try{var r=await tcSb.from('campers').select('*').ilike('modelo','%'+q+'%').limit(1);if(r.data&&r.data[0])return r.data[0];}catch(e){}}
  return tcFindMock(q);
}

async function tcExecConsultarCampers(f) {
  var data=TC_MOCK.campers.slice();
  if(tcSb){try{var q=tcSb.from('campers').select('*');if(f.estado)q=q.eq('estado',f.estado);if(f.disponible!=null)q=q.eq('disponible',f.disponible);if(f.tipo)q=q.eq('tipo',f.tipo);if(f.capacidad_min)q=q.gte('capacidad',f.capacidad_min);if(f.precio_max)q=q.lte('precio_diario',f.precio_max);if(f.tiene_ac)q=q.eq('ac',true);if(f.tiene_bano)q=q.eq('bano',true);var r=await q.order('precio_diario',{ascending:true});if(!r.error&&r.data)data=r.data;}catch(e){}}
  else{if(f.estado)data=data.filter(function(c){return c.estado===f.estado;});if(f.disponible!=null)data=data.filter(function(c){return c.disponible===f.disponible;});if(f.tipo)data=data.filter(function(c){return c.tipo===f.tipo;});if(f.capacidad_min)data=data.filter(function(c){return c.capacidad>=f.capacidad_min;});if(f.precio_max)data=data.filter(function(c){return c.precio_diario<=f.precio_max;});if(f.tiene_ac)data=data.filter(function(c){return c.ac;});if(f.tiene_bano)data=data.filter(function(c){return c.bano;});data.sort(function(a,b){return a.precio_diario-b.precio_diario;});}
  return data.length?{total:data.length,campers:data}:{resultado:'Sin coincidencias.',campers:[]};
}

async function tcExecVerificarDisp(args) {
  var fv=tcValidarFechas(args.fecha_inicio,args.fecha_fin);
  if(!fv.ok) return {disponible:false,error:fv.error};
  var camper=await tcFindCamper(args.modelo);
  if(!camper) return {disponible:false,motivo:'Camper "'+args.modelo+'" no encontrado.'};
  if(camper.estado!=='Activo') return {disponible:false,motivo:'Camper en estado '+camper.estado+'.'};
  if(!camper.disponible) return {disponible:false,motivo:'Camper no disponible actualmente.'};
  var ocu=0;
  if(tcSb){try{var r=await tcSb.from('reservas').select('*',{count:'exact',head:true}).eq('camper_key',camper.key).in('estado_reserva',['Confirmada','Pendiente']).lte('fecha_inicio',args.fecha_fin).gte('fecha_fin',args.fecha_inicio);ocu=r.count||0;}catch(e){}}
  else{ocu=TC_MOCK.reservas.filter(function(r){return r.camper_key===camper.key&&['Confirmada','Pendiente'].includes(r.estado_reserva)&&r.fecha_inicio<=args.fecha_fin&&r.fecha_fin>=args.fecha_inicio;}).length;}
  var d=(camper.unidades||1)-ocu;
  return {disponible:d>0,modelo:camper.modelo,key:camper.key,precio_por_noche:camper.precio_diario,moneda:'ARS ($)',unidades_disponibles:Math.max(0,d)};
}

async function tcExecCrearReserva(args) {
  var fv=tcValidarFechas(args.fecha_inicio,args.fecha_fin);
  if(!fv.ok) return {error:fv.error};
  if(!tcValidarEmail(args.cliente_email)) return {error:'Email invalido.'};
  if(args.cliente_documento&&!tcValidarDoc(args.cliente_documento)) return {error:'Documento invalido.'};
  if(args.cliente_telefono&&!tcValidarTel(args.cliente_telefono)) return {error:'Telefono invalido (7-15 digitos).'};
  var camper=await tcFindCamper(args.camper_modelo);
  if(!camper) return {error:'Camper "'+args.camper_modelo+'" no encontrado.'};
  var fi=tcParseFecha(args.fecha_inicio),ff=tcParseFecha(args.fecha_fin);
  var noches=Math.round((ff-fi)/86400000);
  if(noches<=0) return {error:'Fecha fin debe ser posterior a inicio.'};
  var precio_total=camper.precio_diario*noches;
  if(tcSb){try{var cnt=await tcSb.from('reservas').select('*',{count:'exact',head:true});var ref='RES-'+String((cnt.count||0)+1).padStart(4,'0');var ins=await tcSb.from('reservas').insert({camper_id:camper.id,camper_key:camper.key,reserva_ref:ref,cliente_nombre:args.cliente_nombre,cliente_documento:args.cliente_documento||null,cliente_telefono:args.cliente_telefono||null,cliente_email:args.cliente_email,fecha_inicio:args.fecha_inicio.split(' ')[0],fecha_fin:args.fecha_fin.split(' ')[0],num_personas:args.num_personas||null,estado_reserva:'Pendiente',precio_total:precio_total,notas:args.notas||null}).select().single();if(ins.error)return{error:ins.error.message};return{ok:true,id_reserva:ref,modelo:camper.modelo,precio_total:precio_total,noches:noches,moneda:'ARS ($)'};}catch(e){}}
  var ref='RES-'+String(TC_MOCK._nextId++).padStart(4,'0');
  TC_MOCK.reservas.push({id:ref,reserva_ref:ref,camper_key:camper.key,cliente_nombre:args.cliente_nombre,cliente_documento:args.cliente_documento||null,cliente_telefono:args.cliente_telefono||null,cliente_email:args.cliente_email,fecha_inicio:args.fecha_inicio.split(' ')[0],fecha_fin:args.fecha_fin.split(' ')[0],estado_reserva:'Pendiente',precio_total:precio_total});
  return {ok:true,id_reserva:ref,modelo:camper.modelo,precio_total:precio_total,noches:noches,moneda:'ARS ($)'};
}

async function tcExecConsultarReserva(args) {
  if(tcSb){try{var q=tcSb.from('reservas').select('*');if(args.id_reserva)q=q.eq('reserva_ref',args.id_reserva);else if(args.email)q=q.ilike('cliente_email',args.email);var r=await q.limit(10);return r.data&&r.data.length?{reservas:r.data}:{resultado:'No se encontraron reservas.'};}catch(e){}}
  var f=TC_MOCK.reservas;
  if(args.id_reserva)f=f.filter(function(r){return r.reserva_ref===args.id_reserva||r.id===args.id_reserva;});
  else if(args.email)f=f.filter(function(r){return r.cliente_email&&r.cliente_email.toLowerCase()===args.email.toLowerCase();});
  return f.length?{reservas:f}:{resultado:'No se encontraron reservas.'};
}

async function tcExecListarActivas() {
  if(tcSb){try{var r=await tcSb.from('reservas').select('*').in('estado_reserva',['Confirmada','Pendiente']).order('fecha_inicio',{ascending:true});return{reservas:r.data||[],total:(r.data||[]).length};}catch(e){}}
  var f=TC_MOCK.reservas.filter(function(r){return['Confirmada','Pendiente'].includes(r.estado_reserva);});
  return {reservas:f,total:f.length};
}

async function tcExecCancelar(args) {
  if(tcSb){try{var u={estado_reserva:'Cancelada'};if(args.motivo)u.notas=args.motivo;var r=await tcSb.from('reservas').update(u).eq('reserva_ref',args.id_reserva);if(r.error)return{error:r.error.message};return{ok:true,id_reserva:args.id_reserva,estado:'Cancelada'};}catch(e){}}
  var r=TC_MOCK.reservas.find(function(x){return x.reserva_ref===args.id_reserva||x.id===args.id_reserva;});
  if(!r) return {error:'Reserva '+args.id_reserva+' no encontrada.'};
  r.estado_reserva='Cancelada';if(args.motivo)r.notas=args.motivo;
  return {ok:true,id_reserva:args.id_reserva,estado:'Cancelada'};
}

async function tcExecBuscarAlt(args) {
  var campers=TC_MOCK.campers.filter(function(c){return c.estado==='Activo'&&c.disponible;});
  if(args.num_personas)campers=campers.filter(function(c){return c.capacidad>=args.num_personas;});
  if(tcSb){try{var q=tcSb.from('campers').select('*').eq('estado','Activo').eq('disponible',true);if(args.num_personas)q=q.gte('capacidad',args.num_personas);var r=await q.order('precio_diario',{ascending:true});if(r.data)campers=r.data;}catch(e){}}
  return {disponibles:campers.map(function(c){return{modelo:c.modelo,precio_diario:c.precio_diario,capacidad:c.capacidad};})};
}

/* ─── STATE ─── 
   history guarda SOLO: {role:user, content:string} y {role:assistant, content:string}
   Los ciclos de tool_use/tool_result son locales al loop, no se persisten en history.
   Esto evita el error "unexpected tool_use_id" en turnos posteriores.
*/
var tcState = { current:'leo', histories:{ leo:[], cami:[], reservas:[] } };

async function tcCallClaude(system, tools, messages) {
  var body={model:TC_CONFIG.MODEL,max_tokens:1024,system:system,messages:messages};
  if(tools&&tools.length) body.tools=tools;
  var resp=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!resp.ok){var err=await resp.json().catch(function(){return{};});throw new Error((err.error&&err.error.message)||'Error '+resp.status);}
  return resp.json();
}

async function tcRunLoop(userText) {
  var agentId = tcState.current;
  var history = tcState.histories[agentId];

  // Construir messages COMPLETOS para esta llamada (history previo + nuevo turno user)
  // History contiene solo pares {user, assistant} con contenido de texto plano
  var messages = history.slice();
  messages.push({ role:'user', content:userText });

  var system = TC_PROMPTS[agentId];
  var tools  = TC_TOOLS[agentId];

  // Loop agentico local — NO toca history hasta el final
  for (var turn=0; turn<8; turn++) {
    var result = await tcCallClaude(system, tools, messages);

    if (result.stop_reason === 'end_turn') {
      var text = result.content.filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('');
      // Solo ahora guardamos en history: el turno user y la respuesta final
      history.push({ role:'user', content:userText });
      history.push({ role:'assistant', content:[{type:'text',text:text}] });
      return { text:text, handoff:null };
    }

    if (result.stop_reason === 'tool_use') {
      // Agregar al messages LOCAL (no al history)
      messages.push({ role:'assistant', content:result.content });
      var toolResults = [];
      var handoff = null;

      for (var i=0; i<result.content.length; i++) {
        var block = result.content[i];
        if (block.type !== 'tool_use') continue;
        var output;

        if      (block.name==='derivar_agente')              { handoff={agente:block.input.agente_destino,contexto:block.input.contexto,mensajeVisible:block.input.mensaje_usuario};output={ok:true}; }
        else if (block.name==='pasar_a_reservas')            { handoff={agente:'reservas',contexto:block.input.contexto,mensajeVisible:block.input.mensaje_usuario};output={ok:true}; }
        else if (block.name==='pasar_a_cami')                { handoff={agente:'cami',contexto:block.input.contexto,mensajeVisible:block.input.mensaje_usuario};output={ok:true}; }
        else if (block.name==='consultar_campers')           { output=await tcExecConsultarCampers(block.input); }
        else if (block.name==='verificar_disponibilidad')    { output=await tcExecVerificarDisp(block.input); }
        else if (block.name==='crear_reserva')               { output=await tcExecCrearReserva(block.input); }
        else if (block.name==='consultar_reserva')           { output=await tcExecConsultarReserva(block.input); }
        else if (block.name==='listar_reservas_activas')     { output=await tcExecListarActivas(); }
        else if (block.name==='cancelar_reserva')            { output=await tcExecCancelar(block.input); }
        else if (block.name==='buscar_disponibilidad_alternativa') { output=await tcExecBuscarAlt(block.input); }
        else                                                  { output={error:'Herramienta desconocida: '+block.name}; }

        toolResults.push({type:'tool_result',tool_use_id:block.id,content:JSON.stringify(output)});
      }

      if (handoff) {
        // Handoff: NO guardamos nada en history (el agente origen no necesita recordar esto)
        return { text:handoff.mensajeVisible, handoff:handoff };
      }

      messages.push({ role:'user', content:toolResults });
      continue;
    }

    // Cualquier otro stop_reason
    var ft=result.content&&result.content.find(function(b){return b.type==='text';});
    var txt=ft?ft.text:'Respuesta inesperada.';
    history.push({role:'user',content:userText});
    history.push({role:'assistant',content:[{type:'text',text:txt}]});
    return {text:txt,handoff:null};
  }

  return {text:'Lo siento, tardo demasiado procesando. Podrias repetir?',handoff:null};
}

var TC_AGENT_MAP = { informativo:'cami', reservas:'reservas' };

async function tcPerformHandoff(handoff) {
  var destId  = TC_AGENT_MAP[handoff.agente] || handoff.agente;
  var destDef = TC_AGENTS[destId];
  tcAddHandoffEvent('Conectando con '+destDef.name+'...');
  tcState.current = destId;
  tcUpdateTheme(destDef);
  var ctx = handoff.contexto;
  var brief = '[Contexto del agente anterior: '+ctx.resumen+'.';
  if(ctx.modelo) brief+=' Modelo: '+ctx.modelo+'.';
  if(ctx.fechas) brief+=' Fechas: '+ctx.fechas+'.';
  if(ctx.pax)    brief+=' Personas: '+ctx.pax+'.';
  brief+=' Saluda brevemente y ayuda directamente sin pedir datos que ya tenes.]';
  tcSetTyping(true);
  try {
    var r=await tcRunLoop(brief);
    tcSetTyping(false);
    if(r.text) tcAddAgentMsg(r.text,destId);
    if(r.handoff) await tcPerformHandoff(r.handoff);
  } catch(e) {
    tcSetTyping(false);
    tcAddError('Error al conectar: '+e.message);
  }
}

function tcUpdateTheme(agent) {
  document.getElementById('tc-chat-header').style.background   = agent.color;
  document.getElementById('tc-header-avatar').style.background = agent.colorDark;
  document.getElementById('tc-header-avatar').textContent = agent.avatar;
  document.getElementById('tc-header-name').textContent   = agent.name;
  document.getElementById('tc-header-role').textContent   = agent.role;
  document.getElementById('tc-send-btn').style.background  = agent.color;
  document.getElementById('tc-chat-bubble').style.background = agent.color;
}

function tcRenderMd(text) {
  return text.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');
}

function tcAddUserMsg(text) {
  var msgs=document.getElementById('tc-chat-messages'),tip=document.getElementById('tc-typing');
  var row=document.createElement('div'); row.className='tc-msg-row user';
  var b=document.createElement('div'); b.className='tc-bubble'; b.textContent=text;
  row.appendChild(b); msgs.insertBefore(row,tip); msgs.scrollTop=msgs.scrollHeight;
}

function tcAddAgentMsg(text,agentId) {
  if(!text||!text.trim()) return;
  var agent=TC_AGENTS[agentId||tcState.current];
  var msgs=document.getElementById('tc-chat-messages'),tip=document.getElementById('tc-typing');
  var row=document.createElement('div'); row.className='tc-msg-row agent';
  var av=document.createElement('div'); av.className='tc-msg-avatar'; av.dataset.agent=agent.id; av.textContent=agent.avatar;
  var b=document.createElement('div'); b.className='tc-bubble'; b.innerHTML=tcRenderMd(text);
  row.appendChild(av); row.appendChild(b); msgs.insertBefore(row,tip); msgs.scrollTop=msgs.scrollHeight;
}

function tcAddHandoffEvent(text) {
  var msgs=document.getElementById('tc-chat-messages'),tip=document.getElementById('tc-typing');
  var div=document.createElement('div'); div.className='tc-handoff-event'; div.textContent=text;
  msgs.insertBefore(div,tip); msgs.scrollTop=msgs.scrollHeight;
}

function tcAddError(text) {
  var msgs=document.getElementById('tc-chat-messages'),tip=document.getElementById('tc-typing');
  var div=document.createElement('div'); div.className='tc-error-banner'; div.textContent=text;
  msgs.insertBefore(div,tip); msgs.scrollTop=msgs.scrollHeight;
}

function tcSetTyping(v) {
  document.getElementById('tc-typing').classList.toggle('visible',v);
  document.getElementById('tc-chat-messages').scrollTop=99999;
}
function tcSetDisabled(v) {
  document.getElementById('tc-user-input').disabled=v;
  document.getElementById('tc-send-btn').disabled=v;
}

async function tcHandleSend() {
  var inp=document.getElementById('tc-user-input');
  var text=inp.value.trim(); if(!text) return;
  inp.value='';
  tcAddUserMsg(text); tcSetTyping(true); tcSetDisabled(true);
  try {
    var r=await tcRunLoop(text);
    tcSetTyping(false);
    if(r.text) tcAddAgentMsg(r.text);
    if(r.handoff) await tcPerformHandoff(r.handoff);
  } catch(err) {
    tcSetTyping(false);
    tcAddError('Error: '+err.message);
  } finally {
    tcSetDisabled(false);
    document.getElementById('tc-user-input').focus();
  }
}

async function tcIniciar() {
  tcInitSupabase(); tcUpdateTheme(TC_AGENTS.leo);
  tcSetTyping(true); tcSetDisabled(true);
  try {
    var result=await tcCallClaude(TC_PROMPTS.leo,TC_TOOLS.leo,[{role:'user',content:'(El usuario acabo de abrir el chat. Saludalo brevemente y preguntale en que puedes ayudarle.)'}]);
    var text=result.content.filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('');
    tcSetTyping(false);
    tcAddAgentMsg(text||'Hola! Soy Leo de TodoCamping. En que puedo ayudarte?','leo');
  } catch(e) {
    tcSetTyping(false);
    tcAddAgentMsg('Hola! Soy Leo de TodoCamping. En que puedo ayudarte hoy?','leo');
  } finally {
    tcSetDisabled(false);
    document.getElementById('tc-user-input').focus();
  }
}

function tcSetupListeners() {
  var sendBtn=document.getElementById('tc-send-btn');
  var userInput=document.getElementById('tc-user-input');
  if(!sendBtn||!userInput){ setTimeout(tcSetupListeners,100); return; }
  sendBtn.addEventListener('click',tcHandleSend);
  userInput.addEventListener('keydown',function(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();tcHandleSend();} });
  var closeBtn=document.getElementById('tc-chat-close');
  var bubble=document.getElementById('tc-chat-bubble');
  if(closeBtn) closeBtn.addEventListener('click',function(){ document.getElementById('tc-chat-widget').classList.add('tc-hidden'); bubble.classList.remove('tc-hidden'); });
  if(bubble)   bubble.addEventListener('click',function(){ document.getElementById('tc-chat-widget').classList.remove('tc-hidden'); bubble.classList.add('tc-hidden'); document.getElementById('tc-user-input').focus(); });
  tcIniciar();
}

if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',tcSetupListeners); }
else { tcSetupListeners(); }

})();
