# Base de conocimiento: flujos n8n con IA (WhatsApp + agenda)

Fuente: tres flujos gratuitos de alvarolazarus.com (recepcionista dental, cotizador de taller, web inmobiliaria).
El JSON del recepcionista dental está en el flujo dental original (no incluido aquí).
Objetivo: reutilizar el patrón en nuestros próximos proyectos (abogados u otros rubros).

## 1. Patrón general

```
Mensaje (WhatsApp / foto / audio / chat web)
  -> normalizar (un item limpio por mensaje)
  -> IA con memoria por teléfono + herramientas (agenda, hoja de datos)
  -> salida ESTRUCTURADA (JSON: accion, respuesta, botones, urgente, motivo...)
  -> Switch por accion: responder | ofrecer_horarios | reservar | derivar
  -> reservar: re-verificar hueco -> crear evento -> guardar ficha -> confirmar + ubicación
  -> avisar al dueño (plantilla)  +  cron diario: resumen + recordatorios
```

Requisitos comunes: n8n 2.46+ con HTTPS, WhatsApp Cloud API (Phone Number ID + token permanente),
Anthropic, Google (Calendar + Sheets). OpenAI solo si hay audios (Whisper).

## 2. Ideas clave a reutilizar (lo más valioso)

1. **Nodo "Datos del negocio" al inicio**: toda la configuración (nombre, dirección, coordenadas, zona horaria,
   horario, servicios/precios, teléfono del dueño, idioma de plantillas) en un solo Set. Cambiar de rubro = cambiar este nodo + el prompt.
2. **Salida estructurada** con output parser y un campo `accion` que enruta el flujo con un Switch.
   Código de "Prepara la respuesta" degrada con seguridad: si la IA falla -> `derivar` + mensaje cortés + aviso al dueño;
   si pide botones sin botones -> `responder`; si `reservar` sin fecha válida -> `responder`.
3. **Botones que cargan el estado en el id** (máx. 256 caracteres): `{"i": inicio, "u": urgente, "m": motivo, "n": nombre}`.
   Al tocar el botón, el flujo salta directo a reservar sin pasar por la IA (más barato y determinista).
   Límites WhatsApp: máx. 3 botones, títulos únicos de hasta 20 caracteres.
4. **Doble verificación de agenda**: la IA consulta ocupados antes de ofrecer, y el flujo vuelve a comprobar
   disponibilidad + que no sea pasado antes de crear el evento. Si ya no está libre -> "Horario ocupado".
5. **Memoria sincronizada**: tras confirmar o fallar una reserva (mensajes que la IA no escribió) se inserta el
   mensaje en la memoria con Memory Manager, para que la IA sepa que ya hay cita y no re-ofrezca horarios.
6. **La IA solo elige IDs/filas; los datos salen de la hoja** (precios, fotos, inventario). Una sola fuente de verdad;
   evita que la IA invente precios. (Inmobiliaria y taller.)
7. **Audios**: Obtén URL -> descarga -> nombrar el archivo con extensión según mimeType (Whisper la necesita) -> transcribir.
   Si falla la transcripción, el prompt pide al usuario que escriba.
8. **Mensajes no soportados** (imagen, sticker...) se pasan al agente como texto descriptivo para que responda con naturalidad.
9. **Ficha en Google Sheets** por cada cita + **resumen diario 08:00** al profesional + **recordatorios** el día anterior
   (se detecta el teléfono leyendo "WhatsApp: +N" de la descripción del evento: no hace falta base de datos).
10. **Respuesta al recordatorio** (quick reply) llega como mensaje `button`; el flujo lo etiqueta para que la IA
    confirme o derive si quieren cambiar hora.
11. **Clasificación del lead** (caliente / tibio / frío) y ficha al agente (inmobiliaria): preguntas de calificación
    (crédito, plazo, presupuesto) antes de agendar.
12. **Cotización por foto** (taller): Claude con visión identifica piezas/daño/gravedad -> busca en hoja `Precios`
    (Pieza · Daño · Mínimo · Máximo · Notas) -> suma -> rango estimado + botón agendar revisión + aviso al dueño con la foto.
    Reconoce sinónimos regionales (parachoques/defensa/bumper).
13. **Web chat** (inmobiliaria): webhook de chat de n8n + plantilla estática (`config.js` con `chatUrl`, `inventarioCsv`, marca, colores);
    CORS limitado al dominio propio; como el usuario no escribe por WhatsApp, TODO mensaje saliente va por plantilla.
14. **Estados en inventario**: `disponible | reservada | vendida`.
15. **Horarios configurables** (taller): `horasRevision`, `horasRevisionSabado`, `diasRevision` (1=lun..7=dom), `minutosRevision`.

## 3. Plantillas de Meta (categoría Utilidad, idioma es)

Todo mensaje iniciado por el negocio fuera de la ventana de 24 h requiere plantilla aprobada.

| Plantilla | Texto |
|---|---|
| aviso_clinica | Aviso de la recepcionista ({{1}}): {{2}} escribió: {{3}}. Revísalo cuando puedas. |
| resumen_diario | Buenos días, {{1}} ☀️ Estas son las citas nuevas que agendó la recepcionista desde ayer ({{2}}): {{3}}. ¡Que tengas un gran día! |
| recordatorio_cita (+ botones "Confirmo" / "Cambiar hora") | Hola, {{1}} 👋 Te recordamos tu cita de mañana a las {{2}} con la {{3}}. ¿Nos confirmas tu asistencia? |
| nuevo_cliente (encabezado Imagen) | 🔔 Nuevo cliente: {{1}}. Daño: {{2}}. Presupuesto estimado: {{3}}. Revisión: {{4}}. Los datos ya están en tu hoja de clientes. |
| confirmacion_visita (encabezado Ubicación) | ¡Listo, {{1}}! 🏡 Tu visita a {{2}} quedó agendada para el {{3}}. Te recibe {{4}}, de {{5}}. Arriba tienes la ubicación. |
| ficha_lead | Lead {{1}} (caliente/tibio/frío), nombre, búsqueda, presupuesto, crédito, mudanza, casa, visita, WhatsApp. "Respóndele hoy." |
| recordatorio_visita | Hola, {{1}} 👋 Te recordamos tu visita de mañana a las {{2}} a {{3}}. Te recibe {{4}}. ¡Te esperamos! |

## 4. Hojas de Google Sheets

- Pacientes/Clientes: `Registrado · Nombre · WhatsApp · Motivo · Urgente · Cita · Evento`
- Precios (taller): `Pieza · Daño · Mínimo · Máximo · Notas`; Clientes (taller): `Registrado · Nombre · WhatsApp · Daño · Presupuesto · Revisión · Evento`
- Inventario: ID, tipo, título, zona, precio, cuartos, baños, m², extras, descripción, dirección, latitud, longitud, foto, estado
- Leads: registro, nombre, WhatsApp, qué busca, presupuesto, crédito, mudanza, propiedad, visita, etiqueta, evento, sesión

## 5. Checklist de puesta en marcha (común)

1. Importar JSON. 2. Rellenar nodos de datos (y su copia "mañana"/"noche"; incluir `phoneNumberId`).
3. Credenciales: WhatsApp API (nodos WhatsApp + HTTP Request), WhatsApp OAuth (trigger), Anthropic, OpenAI, Google.
4. Elegir calendario en TODOS los nodos de Calendar. 5. Crear hoja y pestañas. 6. Crear y aprobar plantillas.
7. Publish (OAuth registra el webhook solo; no pegarlo a mano). 8. Probar: texto, audio, botón, urgencia.
Si la zona horaria no es CDMX, cambiarla también en los ajustes del workflow.

## 6. Producción y costos

- Memoria por defecto se borra al reiniciar n8n -> Postgres o Redis Chat Memory (misma clave de sesión = teléfono).
- Modelo: el flujo usa `claude-opus-5-5`; probar `claude-sonnet-5-5` para abaratar (validar con casos reales).
- Prompt: máx. 3 frases, tono WhatsApp, 1 emoji, sin markdown; no inventar precios/horarios; derivar lo que no pueda resolver.
- Puntos débiles a vigilar: IDs de calendario vacíos, `TU_PHONE_NUMBER_ID` en el flujo de la mañana, plantillas sin aprobar.

## 7. Qué cambia al adaptar a otro rubro

Datos del negocio, `systemMessage` del agente (reglas, urgencias, límites), duración de cita (prompt + `plus({minutes})` en "Datos de la cita"),
significado de `urgente`, textos fijos (confirmación, horario ocupado), nombres/columnas de hojas y las plantillas de Meta.
Ideas de nicho: despacho de abogados (consulta inicial, triage por área legal, cita), salón, taller, gimnasio, inmobiliaria, restaurante.
