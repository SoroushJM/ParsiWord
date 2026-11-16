import './host';
import '@parsiword/core/styles.css';
import React from "react";
import ReactDOM from "react-dom/client";
import { EditorApp, LocaleProvider } from '@parsiword/core/ui';
import { isTauri } from '@tauri-apps/api/core';

if (import.meta.env.PROD && !isTauri() && 'serviceWorker' in navigator && window.isSecureContext) {
  const register = () => {
    const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
    if (entry) void navigator.serviceWorker.register(new URL('../sw.js', entry.src)).catch(error => {
      console.warn('ParsiWord offline installation failed:', error);
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider><EditorApp /></LocaleProvider>
  </React.StrictMode>,
);
