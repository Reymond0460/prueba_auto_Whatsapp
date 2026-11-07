# Barbería básica: reservas por WhatsApp

Proyecto mínimo para probar la automatización. Tiene solo tres piezas:

```
WhatsApp -> n8n (Claude) -> Firestore <- panel del barbero (página estática)
```

| Carpeta/archivo | Qué es |
|---|---|
| `n8n/barberia-reservas.json` | Flujo de n8n: atiende por WhatsApp, ofrece horas libres, reserva y recuerda |
| `panel/` | Panel del barbero: login, reservas por día, cancelar y bloquear horas (HTML + JS, sin compilar) |
| `firestore.rules` | Reglas: solo el correo del barbero lee/escribe `reservas` |
| `firebase.json` | Hosting del panel + reglas |

No hay web pública de reservas: el cliente reserva solo por WhatsApp. (El modelo de datos de `reservas` está descrito en `docs/BARBERIA.md`.)

## Paso a paso

### A. Firebase (10 min)
1. Crea un proyecto en https://console.firebase.google.com
2. **Firestore Database** > Crear base de datos (modo producción).
3. **Authentication** > Método de acceso > activa *Correo y contraseña* y crea manualmente el usuario del barbero (Users > Add user).
4. Pon ese mismo correo en `firestore.rules` (reemplaza `barbero@ejemplo.com`).
5. **Configuración del proyecto > Tus apps > Web (</>)**: copia la config y pégala en `panel/firebase-config.js`.
6. Despliega (necesita `npm i -g firebase-tools` y `firebase login`):
   ```
   firebase use --add        # elige tu proyecto
   firebase deploy           # sube reglas y panel
   ```
   El panel queda en `https://TU_PROYECTO.web.app`.
7. **Cuenta de servicio para n8n:** Google Cloud Console > IAM > Cuentas de servicio > crear con rol *Cloud Datastore User* > Claves > crear clave JSON.

### B. WhatsApp (Meta)
1. App en https://developers.facebook.com con el producto WhatsApp; anota el **Phone Number ID** y crea un **token permanente** (usuario del sistema).
2. Crea y aprueba dos plantillas (categoría Utilidad, idioma `es`):
   - `aviso_barbero`: `Aviso de la recepcionista ({{1}}): {{2}} escribió: {{3}}. Revísalo cuando puedas.`
   - `recordatorio_cita` con botones de respuesta rápida "Confirmo" y "Cambiar hora": `Hola, {{1}} 👋 Te recordamos tu cita de mañana a las {{2}} con {{3}}. ¿Nos confirmas tu asistencia?`

### C. n8n
1. Importa `n8n/barberia-reservas.json` (n8n 2.46+, con HTTPS).
2. Credenciales: WhatsApp API (token), WhatsApp OAuth (trigger), Anthropic, **Google Service Account API** con scope `https://www.googleapis.com/auth/datastore` y la clave del paso A.7 (úsala en *Disponibilidad*, *Crea la reserva* y *Reservas de mañana*).
3. Edita **Datos de la barbería** (`projectId`, nombre, barbero, dirección, coordenadas, `horarioSemana`, `duracionMinutos`, servicios, `telefonoBarbero`) y **Datos de la barbería (mañana)** (incluye `phoneNumberId`).
4. **Publish.**

### D. Pruebas (en este orden)
1. Panel: entra con el correo del barbero, bloquea una hora y mira que aparece.
2. WhatsApp: "hola quiero una hora para mañana". Debe pedir nombre y servicio y ofrecer botones **sin** la hora bloqueada.
3. Toca un botón: llega la confirmación + ubicación, y la reserva aparece sola en el panel.
4. Reserva la misma hora desde otro teléfono: debe decir que ya no está disponible.
5. Audio, hora pasada, fuera de horario, "quiero cancelar" (debe derivar y avisar al barbero).
6. Cancela una reserva desde el panel y verifica que esa hora vuelve a ofrecerse.

## Cosas a vigilar
- El panel y n8n comparten el id de documento `yyyyMMdd'T'HHmm` (UTC): no lo cambies en un lado sin cambiar el otro.
- Cancelar desde el panel **borra** el documento (así la hora vuelve a quedar libre).
- Los flujos no se probaron contra servicios reales: en la primera prueba revisa los nodos que hablan con Firestore.
