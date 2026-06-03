# Leo — Agente Orquestador · TodoCamping

**Versión**: 1.0
**Estado**: Listo para implementación
**Scope**: ENRUTAMIENTO Y BIENVENIDA

---

## Archivos de esta carpeta

| Archivo | Descripción |
|---|---|
| `AGENTE_ORQUESTADOR_MEGAPROMPT_v1.md` | System prompt completo listo para usar |
| `config_agente.json` | Configuración: negocio, herramientas, reglas de enrutamiento |
| `README.md` | Este archivo |

---

## Qué hace este agente

Leo es la primera línea de contacto. Recibe todos los mensajes entrantes, detecta la intención del usuario mediante la herramienta `derivar_agente` y lo pasa al especialista correcto con el contexto necesario.

Leo **no** es experto en campers ni en reservas. Su valor está en el enrutamiento limpio y en evitar que el usuario repita información.

---

## Lógica de enrutamiento

```
Mensaje del usuario
        ↓
Leo clasifica la intención
        ├─ Info / comparativas / precios / recomendaciones
        │       └─► Cami (Agente Informativo)
        │
        ├─ Quiere reservar / gestionar reserva existente
        │       └─► Agente de Reservas
        │
        └─ Saludo / contacto / ambiguo / fuera de scope
                └─► Leo responde directamente
```

---

## Herramienta: `derivar_agente`

Cuando Leo determina la intención, llama a `derivar_agente` con:

- `agente_destino`: `"informativo"` o `"reservas"`
- `mensaje_usuario`: mensaje breve de traspaso visible al usuario
- `contexto`: resumen + modelo/fechas/pax/presupuesto si ya se mencionaron

El contexto se inyecta en el historial del agente destino para que no haya que repetir información.

---

## Datos del negocio (responde Leo directamente)

| Campo | Valor |
|---|---|
| Dirección | Calle del Turismo 45, 28001 Madrid |
| Teléfono | +34 91 234 56 78 |
| Email | hola@todocamping.es |
| Horario L-V | 09:00 – 19:00 |
| Horario Sáb | 10:00 – 14:00 |

---

## Integración con los otros agentes

```
Leo (Orquestador) ← punto de entrada
    ├─► Cami  →  ../agente información/
    └─► Reservas  →  ../agente reservas/
```

El chat web (`chat.html`) en la raíz del proyecto implementa los tres agentes como un único flujo conversacional con cambio de tema visual al hacer handoff.
