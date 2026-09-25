import { useBranding } from '../lib/branding';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  variant?: 'light' | 'dark';
}

export function Logo({ size = 'md', showWordmark = true, variant = 'light' }: LogoProps) {
  const dims = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  const branding = useBranding();
  if (branding?.logoUrl) {
    const h = size === 'sm' ? 'h-6' : size === 'lg' ? 'h-10' : 'h-8';
    return <img src={branding.logoUrl} alt={branding.platformName} className={`${h} w-auto object-contain`} />;
  }

  return (
    <span className="inline-flex items-center gap-2.5">
      <svg className={dims} fill="none" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 6L16 11V25L7 20V6Z" fill="#0066FF" />
        <path d="M19 11L28 6V20L19 25V11Z" fill="#0052CC" />
        <path d="M16 27L7 22L16 17L25 22L16 27Z" fill="#F59E0B" />
        <path d="M16 11L25 6L16 1L7 6L16 11Z" fill="#0080FF" />
      </svg>
      {showWordmark && (
        <span className="flex flex-col justify-center leading-tight">
          <span
            className={`font-extrabold tracking-tight ${
              variant === 'dark' ? 'text-white' : 'text-primary'
            } ${size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-xl'}`}
          >
            INVEON
            <span
              className={`font-normal ml-1 ${
                variant === 'dark' ? 'text-slate-300' : 'text-slate-900'
              }`}
            >
              EVENTS
            </span>
          </span>
          <span
            className={`text-[9px] font-semibold tracking-wider uppercase ${
              variant === 'dark' ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            by Inveon Technologies
          </span>
        </span>
      )}
    </span>
  );
}

