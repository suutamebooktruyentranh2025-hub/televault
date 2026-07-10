import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './context/I18nContext';
import { ThemeProvider } from './context/ThemeContext';
import { DialogProvider } from './context/DialogContext';
import { ToastProvider } from './context/ToastContext';
import { initConsoleInterceptor } from './utils/logger';
import './index.css';

initConsoleInterceptor();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <DialogProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </DialogProvider>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>,
);
