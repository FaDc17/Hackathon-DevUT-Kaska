# Mapa real para Kuska (Leaflet + OpenStreetMap, gratis y sin API key)

## 1. Copiar archivos
Descomprime este ZIP sobre la raíz de tu proyecto y acepta reemplazar.

## 2. Instalar dependencias (en la raíz del proyecto)
npm i leaflet react-leaflet @capacitor/geolocation
npm i -D @types/leaflet

## 3. Probar en el navegador
npm run dev

## 4. Probar en Android
npm run android:sync
npm run android:open      (o: npm run apk:debug)

## Archivos
NUEVOS:      src/utils/geo.ts, src/components/map/KuskaMap.tsx
REEMPLAZAR:  src/screens/Map/MapScreen.tsx
             src/screens/Services/ServiceDetail.tsx, CreateService.tsx
             src/screens/Posts/PostDetail.tsx, CreatePost.tsx
             src/screens/Emergency/CreateEmergency.tsx
             src/types/index.ts, src/data/demo.ts
             src/index.css (original + CSS del mapa al final)
             android/app/src/main/AndroidManifest.xml (permisos de ubicación)
NO TOCADOS:  App.tsx (las props no cambiaron). DemoMap.tsx se conserva solo para el tutorial.

## Si los mosaicos salen en blanco en el APK
Cambia TILE_URL en src/components/map/KuskaMap.tsx por otro proveedor de mosaicos.
