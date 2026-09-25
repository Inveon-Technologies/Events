import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('policy pages (needed for payment gateway approval)', () => {
  it.each([
    ['/contact', 'Contact Us'],
    ['/terms', 'Terms & Conditions'],
    ['/privacy', 'Privacy Policy'],
    ['/refund-policy', 'Refunds & Cancellations'],
    ['/cancellation-policy', 'Refunds & Cancellations'],
  ])('%s renders its page', (path, heading) => {
    renderAt(path);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('shows the business contact details and INR pricing terms', () => {
    renderAt('/contact');
    expect(screen.getByText('Inveon Technologies')).toBeInTheDocument();
    expect(screen.getAllByText(/@/).length).toBeGreaterThan(0);
    renderAt('/terms');
    expect(screen.getByText(/All prices are in Indian Rupees/)).toBeInTheDocument();
  });

  it('footer links open the policy pages', async () => {
    const user = userEvent.setup();
    renderAt('/contact');
    const footer = document.querySelector('[data-purpose="site-footer"]') as HTMLElement;
    const link = Array.from(footer.querySelectorAll('a')).find((a) => a.textContent === 'Refunds & Cancellations')!;
    expect(link.getAttribute('href')).toBe('/refund-policy');
    await user.click(link);
    expect(screen.getByRole('heading', { level: 1, name: 'Refunds & Cancellations' })).toBeInTheDocument();
  });
});
