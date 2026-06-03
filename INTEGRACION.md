# Guía de integración — Agente Cami (TodoCamping)

## ✅ Qué tienes ya listo (hecho localmente)

| Archivo | Qué hace |
|---|---|
| `cami-widget.html` | Chat completo con UI, lógica de tool use y loop agentico |
| `cami-supabase.js` | Módulo de consultas Supabase (para backend Node.js) |
| `cami-schema.sql` | Schema de tablas + datos de ejemplo |
| `INTEGRACION.md` | Esta guía |

---

## ❌ Qué falta para que funcione en producción

### 1. Credenciales (obligatorio)

| Credencial | Dónde conseguirla | Dónde pegarla |
|---|---|---|
| **Anthropic API Key** (`sk-ant-...`) | [console.anthropic.com](https://console.anthropic.com) → API Keys | `CONFIG.ANTHROPIC_API_KEY` en `cami-widget.html` línea 5 |
| **Supabase URL** (`https://xxxx.supabase.co`) | Supabase → Settings → API | `CONFIG.SUPABASE_URL` línea 6 |
| **Supabase Anon Key** (`eyJ...`) | Supabase → Settings → API | `CONFIG.SUPABASE_ANON_KEY` línea 7 |

> Para probar rápido: abre `cami-widget.html` en el navegador → rellena las credenciales en el panel de configuración que aparece automáticamente.

---

### 2. Base de datos Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) si no tienes uno.
2. Ve a **SQL Editor** y ejecuta el contenido de `cami-schema.sql`.
3. Verifica que la tabla `campers` tiene datos (puedes editar o borrar los de ejemplo).
4. Si tienes una tabla de reservas propia, adapta la sección de `reservas` en el schema.

#### Ajuste importante de columnas de equipamiento
El widget asume columnas booleanas separadas: `ac`, `bano`, `calefaccion`, `cocina`.
Si en tu base el equipamiento es un campo `jsonb` o un array de texto, actualiza la función `ejecutarConsultaCampers` en `cami-widget.html` (busca el comentario `// Filtros de equipamiento`).

---

### 3. Incrustar el widget en tu web

**Opción A — página completa (demo local):**
Simplemente abre `cami-widget.html` en el navegador. Ya funciona como página independiente.

**Opción B — widget flotante en tu web:**
Envuelve el HTML en un `<iframe>` o extrae el `<div id="cami-widget">` y su `<script>` y pégalos en tu web. Ajusta el CSS para posicionarlo (ej. `position: fixed; bottom: 24px; right: 24px`).

**Opción C — componente React/Vue:**
Copia la lógica del `<script>` a un componente. Las funciones `procesarMensaje`, `ejecutarConsultaCampers` y `callClaude` son el núcleo; el resto es UI.

---

### 4. Seguridad en producción (imprescindible antes de publicar)

El widget actual llama a la API de Anthropic directamente desde el navegador (la API key queda expuesta). Para producción:

1. **Crea un endpoint backend** (Node.js / Python / Cloudflare Worker) que:
   - Reciba el historial de mensajes del frontend.
   - Tenga la API key de Anthropic en variables de entorno.
   - Ejecute las llamadas a Claude y a Supabase server-side.
   - Devuelva la respuesta al frontend.
2. En `cami-widget.html`, reemplaza la función `callClaude` para que llame a **tu endpoint** en vez de `api.anthropic.com` directamente.
3. La Supabase Anon Key puede quedarse en el frontend (es pública por diseño), pero asegúrate de que las políticas RLS del schema estén activas.

---

### 5. Configuración opcional del modelo

En `CONFIG.MODEL` (línea 8 del widget) puedes cambiar el modelo Claude:

| Modelo | Velocidad | Coste | Recomendado para |
|---|---|---|---|
| `claude-haiku-4-5-20251001` | Muy rápido | Bajo | Chat de soporte con volumen alto |
| `claude-sonnet-4-6` | Rápido | Medio | Equilibrio calidad/coste (recomendado) |
| `claude-opus-4-6` | Más lento | Alto | Consultas muy complejas |

---

### 6. Adaptar los emails de derivación

En el system prompt (dentro del `<script>` del widget), busca la sección `# 8. DERIVACIÓN` y reemplaza:
- `soporte@todocamping.com` → tu email real de soporte
- `admin@todocamping.com` → tu email real de administración

---

## Orden recomendado de pasos

1. Ejecutar `cami-schema.sql` en Supabase y añadir tus campers reales.
2. Abrir `cami-widget.html`, introducir credenciales en el panel → probar el chat.
3. Confirmar que las consultas devuelven datos reales.
4. Crear backend proxy para ocultar la API key (antes de publicar).
5. Incrustar en tu web.
6. Ajustar emails de derivación y modelo Claude si hace falta.
