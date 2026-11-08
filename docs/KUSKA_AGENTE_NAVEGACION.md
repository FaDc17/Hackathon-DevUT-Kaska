# Agente Kuska: navegación contextual y continuidad

8 de noviembre de 2026. Implementación en el agente existente; se conservan su interfaz, Cloudflare y búsquedas online/offline.

## Comportamiento

- Abre las pantallas reales de Servicios, Comunidad, Emergencias, Perfil, Mapa y Canales de ayuda mediante la navegación existente. Puede volver con la acción Volver.
- Abre los formularios existentes para publicar servicio, publicación, alerta o editar el perfil. Las preguntas sobre cómo hacer algo ofrecen una acción; las solicitudes directas la ejecutan. El usuario confirma Publicar o Guardar cambios.
- Al regresar al chat conserva la tarea y el paso, entiende «sí», «ya estoy en Servicios», «ya completé los campos», «¿y luego?» y «no encuentro el botón». Una confirmación tras navegar no vuelve a abrir la misma pantalla.
- Responde con las pantallas visitadas y los registros realmente cargados, excluyendo los datos DEMO. Reconoce la identidad local/remota del propietario al consultar sus publicaciones.
- Solo reconoce un guardado como realizado cuando la aplicación registró una confirmación local o remota posterior al inicio de esa tarea. Si el envío o la fotografía siguen pendientes, lo indica; no confunde guardar localmente con compartir entre teléfonos.
- Los resultados de búsqueda siguen viniendo de los repositorios de Kuska. Elegir un servicio o pedir su perfil abre el registro correspondiente; las consultas de contacto conservan su respuesta y tarjetas.
- Una búsqueda nueva abandona la guía anterior. Las confirmaciones de resultados conservan la selección de proveedores; las respuestas de ayuda no reinician la tarea.
- Se evita volver a imprimir una explicación idéntica: la respuesta pide el punto concreto que falta y mantiene las acciones para avanzar. La recuperación de contraseña se explica como no disponible, acorde con el login actual.

## Contexto y sesión

`App.tsx` proporciona un historial acotado de secciones y los eventos de guardado confirmados. El agente no interpreta un formulario abierto como una publicación guardada. No recibe contraseñas ni la dirección privada para construir las respuestas; la navegación y las guías se resuelven localmente y no se envían como contexto adicional al Worker.

La memoria temporal de la conversación sigue en RAM y conserva su caducidad de treinta minutos. Se añadió una identidad por inicio de sesión en Secure Storage para que renovar el JWT no borre el chat. La renovación conserva esa identidad; otro inicio de sesión o usuario cambia la identidad y descarta la conversación anterior. Las sesiones nativas anteriores se adaptan con una huella del token que se conserva al renovarlo. La huella solo identifica la conversación y no sustituye la validación JWT.

## Archivos principales

- `src/screens/Assistant/appAssistance.ts`: conocimiento local de pantallas, acciones y pasos.
- `AgentChat.tsx`: ejecución de las acciones y continuidad del diálogo.
- `chatConversation.ts`, `chatMemory.ts`, `hybridSearch.ts`: selección de resultados, memoria y nombres de pantallas existentes.
- `src/App.tsx`: contexto real de navegación y confirmaciones de guardado; reutiliza los formularios actuales.
- `src/services/secureSession.ts` y `apiClient.ts`: identidad de conversación estable durante la renovación.
- Pruebas en `appAssistance.test.ts`, `chatMemory.test.ts`, `secureSession.test.ts`, `sessionRenewal.test.ts` y `scripts/qa-experience.mjs`.

## Verificación

TypeScript correcto. 252 pruebas Vitest en 19 archivos aprobadas. Vite correcto, con el aviso previo de tamaño del bundle. Regresión en Edge móvil de 18 escenarios aprobada, con API/Worker simulados y sin escrituras en Azure.

Los escenarios nuevos comprueban que el agente abre Servicios, recuerda la pantalla al regresar, continúa con «sí» y «¿y luego?» sin volver al principio, abre el formulario sin enviarlo y reconoce un servicio guardado mediante el flujo de publicación de la aplicación. También se probaron aislamiento entre sesiones, renovación de tokens, migración de una sesión Android antigua, copia defensiva de acciones y guías, datos DEMO, IDs y fotografías pendientes.

El APK actualizado se publica en `releases/Kuska-debug.apk`, con su SHA-256 junto al archivo. No se cambió código del backend ni configuración de Azure para esta mejora. La ejecución física en Android sigue pendiente de la prueba del usuario.
