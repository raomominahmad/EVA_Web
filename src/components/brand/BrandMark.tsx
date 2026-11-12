interface BrandMarkProps {
  className?: string | undefined;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="5" fill="currentColor" />
      <path d="M9 10h14v2.5H9zM9 15h9v2.5H9zM9 20h12v2.5H9z" fill="#ffffff" />
      <circle cx="23.5" cy="21.25" r="1.5" fill="#9db2d4" />
    </svg>
  );
}
