import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Uso offline: solo sul sito vero e proprio (dentro Claude i service worker non sono ammessi).
if (import.meta.env.PROD && import.meta.env.VITE_MODEL_FORMAT !== 'json' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}); });
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
