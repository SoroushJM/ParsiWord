import './host';
import '@parsiword/core/globals.css';
import '@parsiword/core/App.css';
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@parsiword/core/App";
import { LocaleProvider } from '@parsiword/core/locale';
import '@parsiword/core/locale.css';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider><App /></LocaleProvider>
  </React.StrictMode>,
);
