import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the Inveon Events heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /inveon events/i })).toBeInTheDocument();
  });
});
