import React from 'react';

// The organizer's uploaded logo, or their initials when there isn't one.
export function initialsFor(name) {
  return (name || '')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
}

export default function UserAvatar({ src, name, className = 'w-8 h-8 text-xs' }) {
  if (src) {
    return <img src={src} alt={name || 'Profile photo'} className={`${className} rounded-full object-cover`} />;
  }
  return (
    <div className={`${className} rounded-full bg-gradient-to-tr from-brand-600 to-cyan-400 text-white font-bold flex items-center justify-center`}>
      {initialsFor(name)}
    </div>
  );
}
