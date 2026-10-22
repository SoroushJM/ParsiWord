import './globals.css';
import './App.css';
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LocaleProvider } from './locale';
import './locale.css';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider><App /></LocaleProvider>
  </React.StrictMode>,
);
