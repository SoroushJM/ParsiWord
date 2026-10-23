import './host';
import '@parsiword/core/styles.css';
import React from "react";
import ReactDOM from "react-dom/client";
import { EditorApp, LocaleProvider } from '@parsiword/core/ui';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider><EditorApp /></LocaleProvider>
  </React.StrictMode>,
);
