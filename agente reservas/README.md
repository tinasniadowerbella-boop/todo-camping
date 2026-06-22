# Agente de Reservas — TodoCamping

**Versión**: 1.0
**Estado**: Listo para implementación
**Scope**: RESERVAS SOLO

---

## Archivos de esta carpeta

| Archivo | Descripción |
|---|---|
| `AGENTE_RESERVAS_MEGAPROMPT_v1.md` | System prompt completo listo para usar |
| `config_agente.json` | Configuración: catálogo, herramientas, guardrails, Supabase |
| `README.md` | Este archivo |

---

## Qué hace este agente

El Agente de Reservas gestiona el cierre de operaciones: verifica disponibilidad real por fechas y unidades, crea reservas y las consulta. No informa sobre specs del catálogo — eso lo hace Cami.

---

## Flujo principal

```
Usuario quiere reservar
        ↓
Recoge: modelo + fechas + nombre + email + personas
        ↓
verificar_disponibilidad → ¿hay unidades libres?
        ├─ NO  → Informa + sugiere alternativas
        └─ SÍ  → Muestra resumen + pide confirmación
                        ↓
                Usuario confirma
                        ↓
                crear_reserva → devuelve ID de referencia
```

---

## Catálogo de modelos

| Key | Modelo | $/día (UYU) | Unidades | Estado |
|---|---|---|---|---|
| TC-ACS | Adria Coral 670 SL | 5800 | 3 | Activo |
| TC-WCB | Weinsberg CaraBus 600 MQ | 4200 | 5 | Activo |
| TC-KSI | Knaus Sun I 650 MEG | 7200 | 2 | Activo |
| TC-CCT | Carthago C-Tourer T143 | 8500 | 2 | Activo |
| TC-CAR | Carado CV600 | 3800 | 4 | Mantenimiento |
| TC-BLD | Bürstner Lyseo TD690 | 6500 | 3 | Activo |
| TC-HYM | Hymer B-ML T580 | 4800 | 4 | Activo |
| TC-PCA | Pössl Campster | 3500 | 6 | Activo |

La disponibilidad en tiempo real se calcula siempre desde la base de datos.

---

## Herramientas (tool use)

### `verificar_disponibilidad`
Cuenta reservas activas que solapan con las fechas y las resta de `unidades`. Devuelve `unidades_disponibles`.

### `crear_reserva`
Inserta una fila en `public.reservas`. Requiere todos los datos del cliente y confirmación previa.

### `consultar_reserva`
Busca en `public.reservas` por `cliente_email` o `id`.

---

## Integración con Supabase

Ver `../cami-schema.sql` para el schema completo. Puntos clave:

- `campers.key` — identificador legible del modelo (ej: `TC-ACS`)
- `campers.unidades` — flota de ese modelo (1–9)
- `reservas.camper_key` — referencia al modelo sin join a `campers`
- La disponibilidad se calcula con un `COUNT` de reservas no canceladas que solapan con el rango de fechas

---

## Reglas críticas

1. **Nunca crear reserva sin confirmación explícita**
2. **Nunca afirmar disponibilidad sin llamar a la herramienta**
3. **No gestionar pagos** — solo el registro de la reserva

---

## Integración con los otros agentes

```
Leo (Orquestador)
    └─► Agente de Reservas (este agente)
            └─► Si piden specs → Cami (Agente Informativo)
```

El usuario llega aquí desde Leo cuando tiene claro que quiere reservar, y opcionalmente con contexto previo de Cami (modelo elegido, fechas tentativas, n