import { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';

interface LayoutProps {
  children: ReactNode;
  /** Skip the header/footer chrome — used for full-bleed states like payment processing */
  bare?: boolean;
}

export function Layout({ children, bare = false }: LayoutProps) {
  if (bare) {
    return <div className="min-h-screen bg-surface flex flex-col">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col">{children}</main>
      <Footer />
    </div>
  );
}
