import { act, render } from '@testing-library/react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import { ScrollToTop } from './ScrollToTop';

let navigate: NavigateFunction;
function Capture() {
  navigate = useNavigate();
  return null;
}

function setup() {
  const scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  render(
    <MemoryRouter initialEntries={['/events']}>
      <ScrollToTop />
      <Capture />
    </MemoryRouter>,
  );
  scrollTo.mockClear();
  return scrollTo;
}

describe('ScrollToTop', () => {
  it('scrolls to the top when a link opens a new page', () => {
    const scrollTo = setup();
    act(() => navigate('/organizers'));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('leaves Back/Forward and hash links alone', () => {
    const scrollTo = setup();
    act(() => navigate('/#explore'));
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => navigate('/organizers'));
    scrollTo.mockClear();
    act(() => navigate(-1));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
