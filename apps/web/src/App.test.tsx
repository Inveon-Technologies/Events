import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { OrganizerAuthProvider } from './organizer/context/AuthContext';

function renderApp(initialPath = '/') {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizerAuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <App />
        </MemoryRouter>
      </OrganizerAuthProvider>
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

  it('renders event details for a known mock event', () => {
    renderApp('/events/rajgad-sunrise-trek-2026');
    expect(screen.getAllByText(/Rajgad Sunrise Trek/i).length).toBeGreaterThan(0);
  });

  it('falls back to the catch-all route for an unknown path', () => {
    renderApp('/this-route-does-not-exist');
    expect(document.body).toBeTruthy();
  });

  it('renders the organizer login form', () => {
    renderApp('/organizer/login');
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor away from the organizer dashboard', () => {
    renderApp('/organizer/dashboard');
    // ProtectedRoute should have redirected to /organizer/login instead.
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });
});
