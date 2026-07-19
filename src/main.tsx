import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { App } from './App';
import { queryClient } from '@/lib/query/queryClient';
import { ErrorBoundary } from './ErrorBoundary';
import { initFirebase } from '@/lib/firebase/app';

import './index.css';

initFirebase();

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');
const root = createRoot(container);

root.render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
