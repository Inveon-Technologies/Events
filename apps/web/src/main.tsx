import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { OrganizerAuthProvider } from './organizer/context/AuthContext';
import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <OrganizerAuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </OrganizerAuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
