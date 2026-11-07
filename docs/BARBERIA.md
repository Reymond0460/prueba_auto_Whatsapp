# Recepcionista IA para barbería (WhatsApp + Firebase)

Flujo importable: `n8n/barberia-reservas.json` (n8n 2.46+). Un solo barbero, solo reservar (sin cambiar ni cancelar por WhatsApp).
Adaptado del flujo dental (flujo dental original): Google Calendar y Sheets se reemplazan por Firestore.

```
WhatsApp -> n8n (Claude) -> Firestore (colección "reservas") <- panel admin del barbero
```

## Cómo funciona
1. El cliente escribe (texto o audio). El agente pide nombre y servicio.
2. La herramienta **Disponibilidad** consulta en Firestore las reservas ya tomadas del día y el agente calcula los huecos libres contra el horario.
3. Ofrece 2–3 horas con botones. Al tocar uno, el flujo **no pasa por la IA**: valida la hora (futura, dentro del horario, alineada a la duración) y crea la reserva.
4. **Atomicidad:** el id del documento es la hora en UTC (`yyyyMMdd'T'HHmm`). Si ya existe, Firestore responde 409 y el cliente recibe "ese horario ya no está disponible". Esto evita dobles reservas, incluso si la web y WhatsApp reservan a la vez.
5. Confirma por WhatsApp, manda la ubicación y deja la reserva en la memoria de la conversación.
6. Cada día a las 08:00 manda recordatorio a quienes tienen reserva mañana.
7. Lo que la IA no puede resolver (cambios, cancelaciones, dudas) se deriva y avisa al barbero por plantilla.

## Modelo de datos en Firestore (colección `reservas`)
| Campo | Tipo | Ejemplo |
|---|---|---|
| nombre | string | María |
| telefono | string | 5215512345678 |
| servicio | string | Corte + barba |
| inicio | timestamp | 2026-11-10T16:30:00Z |
| fin | timestamp | 2026-11-10T17:00:00Z |
| estado | string | confirmada / cancelada |
| origen | string | whatsapp / web |
| creada | timestamp | |

IMPORTANTE para la web y el panel (misma base):
- **La web debe crear sus reservas con el mismo id de documento** (`yyyyMMdd'T'HHmm` en UTC) usando `setDoc` dentro de una transacción o `create` que falle si existe; así la garantía anti-doble reserva vale para todos los canales.
- **Al cancelar desde el panel, borra el documento** (o cambia el id/estado de forma que libere la hora). Si solo marcas `estado: cancelada` y dejas el documento, esa hora seguirá bloqueada para crear.
- Si tus campos ya existen con otros nombres, cámbialos en los nodos *Disponibilidad*, *Crea la reserva*, *Reservas de mañana* y *Prepara recordatorios*. Idealmente pásame un documento real de ejemplo y lo ajusto.
- Reglas de Firestore: el flujo usa una cuenta de servicio (ignora las reglas). Mantén las reglas cerradas para escritura pública salvo lo que necesite la web.

## Puesta en marcha
1. **Firebase:** Google Cloud Console > IAM > cuenta de servicio con rol *Cloud Datastore User* > crear clave JSON.
2. **n8n > Credenciales > Google Service Account API:** pega el email y la clave privada, activa "Set up for use in HTTP Request node" y scope `https://www.googleapis.com/auth/datastore`. Úsala en *Disponibilidad*, *Crea la reserva* y *Reservas de mañana* (tipo `googleApi`).
3. Importa `n8n/barberia-reservas.json`.
4. Rellena **Datos de la barbería** (`projectId`, nombre, barbero, dirección, coordenadas, `horarioSemana`, `duracionMinutos`, servicios, `telefonoBarbero`) y **Datos de la barbería (mañana)** (más `phoneNumberId`).
   `horarioSemana`: JSON con día 1=lunes … 7=domingo -> `["apertura","cierre"]` o `null`.
5. Credenciales: WhatsApp API (nodos WhatsApp y HTTP Request de audio y botones), WhatsApp OAuth (trigger), Anthropic, OpenAI (solo para audios).
6. Crea y aprueba las plantillas en Meta (categoría Utilidad, idioma `es`):
   - `aviso_barbero`: "Aviso de la recepcionista ({{1}}): {{2}} escribió: {{3}}. Revísalo cuando puedas."
   - `recordatorio_cita` (botones de respuesta rápida "Confirmo" y "Cambiar hora"): "Hola, {{1}} 👋 Te recordamos tu cita de mañana a las {{2}} con {{3}}. ¿Nos confirmas tu asistencia?"
7. **Publish** en n8n (OAuth registra el webhook solo).
8. Pruebas: pedir horas; tocar un botón; reservar la misma hora desde dos teléfonos; mandar audio; pedir una hora pasada o fuera de horario; revisar que la reserva aparece en el panel.

## Pendientes / mejoras futuras
- Duraciones distintas por servicio (hoy una sola `duracionMinutos`).
- Cambiar y cancelar por WhatsApp (requeriría buscar la reserva por teléfono y borrarla).
- Descansos/almuerzo y días festivos (hoy solo `horarioSemana`).
- Memoria persistente (Postgres/Redis) en vez de la que se borra al reiniciar n8n.
- No se pudo probar contra un Firestore ni un n8n reales: revisar en la primera prueba los nodos de Firestore (*Disponibilidad*, *Crea la reserva*, *Reservas de mañana*).
