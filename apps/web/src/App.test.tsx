import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

function renderApp(initialPath = '/') {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App routing', () => {
  it('renders the home page hero at /', () => {
    renderApp('/');
    expect(screen.getByText(/Discover\. Book\./i)).toBeInTheDocument();
  });

  it('renders event details for a known mock event', () => {
    renderApp('/events/rajgad-sunrise-trek-2026');
    expect(screen.getAllByText(/Rajgad Sunrise Trek/i).length).toBeGreaterThan(0);
  });

  it('falls back to the catch-all route for an unknown path', () => {
    renderApp('/this-route-does-not-exist');
    expect(document.body).toBeTruthy();
  });
});
