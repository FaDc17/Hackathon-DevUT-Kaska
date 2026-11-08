# Kuska para Android

[Descargar APK de pruebas](https://github.com/FaDc17/Hackathon-DevUT-Kaska/raw/refs/heads/main/releases/Kuska-debug.apk)

APK debug de `main`, preparado el 8 de noviembre de 2026. Incluye las mejoras de experiencia, sincronización, sesión, mapas, agente y compresión de fotografías, junto con las correcciones recientes de Servicios del equipo.

Actualización del inicio de sesión: se retiró el enlace «¿Perdiste tu contraseña?» porque la recuperación no está disponible. Para este cambio se verificaron TypeScript, Vite y la compilación Android, y se actualizó la huella del APK.

El agente ahora abre pantallas y formularios reales, recuerda el paso al regresar y responde con la actividad y los datos cargados de Kuska. La conversación se conserva durante la renovación del token. Detalles en [navegación del agente](../docs/KUSKA_AGENTE_NAVEGACION.md).

Descarga `Kuska-debug.apk` en el celular, abre el archivo y permite la instalación desde ese navegador o administrador de archivos si Android lo solicita. Es una compilación de pruebas firmada con la clave debug, no una publicación de Play Store.

La aplicación se conecta al backend existente:

```text
https://kuska-api-fadc-akd8fkcrfpcwdgdj.eastus2-01.azurewebsites.net
```

La huella SHA-256 está en [Kuska-debug.sha256](Kuska-debug.sha256). La copia generada localmente está en `android/app/build/outputs/apk/debug/app-debug.apk`.

Validación de la actualización del agente: TypeScript correcto, 252 pruebas Vitest aprobadas, Vite y Gradle `assembleDebug` correctos, y 18 escenarios de navegador con API simulada. El backend pasó 65 pruebas Maven/Spring en la revisión anterior; esta actualización del agente no modifica el backend. No se ejecutó una prueba física en un teléfono.

Instalar este APK no despliega el backend. Para aplicar en Azure el nuevo límite de fotografías y la renovación de sesión hace falta publicar el JAR actualizado y revisar las variables multipart. Los límites preparados son 10 MB por archivo y 11 MB por petición. Tampoco se ha certificado la configuración Always On ni la subida real a Blob entre dos teléfonos.

Detalles: [corrección de fotografías](../docs/KUSKA_LIMITE_FOTOGRAFIAS.md) e [informe de mejoras](../docs/KUSKA_MEJORAS_EXPERIENCIA.md). Los informes anteriores conservan sus resultados e identificadores de compilación históricos; para esta descarga utiliza la huella situada junto al APK.
