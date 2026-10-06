import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient();

// Icons stay invisible (see .material-symbols-outlined in index.css)
// until the icon font has loaded, so their names never show as text.
document.fonts
  ?.load('24px "Material Symbols Outlined"')
  .then(() => document.documentElement.classList.add('icons-ready'))
  .catch(() => {});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
