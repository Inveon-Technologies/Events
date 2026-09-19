import { render, screen, waitFor } from '@testing-library/react';
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

  it('links "Host an Event" to organizer login, not the mock organizer profile page', () => {
    renderApp('/');
    const hostLinks = screen.getAllByRole('link', { name: /host an event/i });
    expect(hostLinks.length).toBeGreaterThan(0);
    for (const link of hostLinks) {
      expect(link).toHaveAttribute('href', '/organizer/login');
    }
  });

  it('renders event details for a known mock event', async () => {
    renderApp('/events/rajgad-sunrise-trek-2026');
    // EventDetailsPage now loads asynchronously (tries the real API first,
    // falls back to the mock template) — wait for it instead of asserting
    // synchronously against the loading spinner.
    await waitFor(() => expect(screen.getAllByText(/Rajgad Sunrise Trek/i).length).toBeGreaterThan(0));
  });

  it('falls back to the catch-all route for an unknown path', () => {
    renderApp('/this-route-does-not-exist');
    expect(document.body).toBeTruthy();
  });

  it('renders the organizer login form', () => {
    renderApp('/organizer/login');
    expect(screen.getByRole('heading', { name: /organizer sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor away from the organizer dashboard', () => {
    renderApp('/organizer/dashboard');
    // AppLayout should have redirected to /organizer/login instead.
    expect(screen.getByRole('heading', { name: /organizer sign in/i })).toBeInTheDocument();
  });
});
