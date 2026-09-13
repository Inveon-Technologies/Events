interface IconProps {
  name: string;
  className?: string;
  filled?: boolean;
}

/**
 * Wraps a Material Symbols Outlined glyph. Usage: <Icon name="search" />
 * Full glyph reference: https://fonts.google.com/icons
 */
export function Icon({ name, className = '', filled = false }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
