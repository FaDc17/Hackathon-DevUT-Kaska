import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeDatabase } from './database/init';
import { describeError } from './database/connection';

async function startApp() {
  console.log('[KUSKA SQLITE] Inicio de la aplicacion.');
  const root = ReactDOM.createRoot(document.getElementById('root')!);

  try {
    console.log('[KUSKA SQLITE] Ejecutando initializeDatabase antes de renderizar App.');
    await initializeDatabase();
    console.log('[KUSKA SQLITE] initializeDatabase completado; renderizando App.');

    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    const errorDetails = describeError(error);
    console.error('[KUSKA SQLITE] Error completo:', errorDetails);
    console.error('[KUSKA SQLITE] Error original:', error);

    root.render(
      <div style={{ padding: '24px', color: 'red' }}>
        No se pudo inicializar la base de datos de Kuska.
        Revisa la consola.
        <pre style={{ color: '#111827', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {errorDetails}
        </pre>
      </div>
    );
  }
}

startApp();