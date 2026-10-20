import { MONOGRAM_GLYPH, MONOGRAM_SQUARE, MONOGRAM_VIEWBOX } from '@/lib/brandMarkPaths';

export const FIRM_NAME = 'Perchstone & Graeys';
export const PRODUCT_NAME = 'Perchstone & Graeys Legal AI';

/**
 * The pillar monogram from the firm's lockup. `tile` keeps the orange square;
 * `glyph` draws the pillar alone in the current text color, for small sizes
 * on an already-colored ground.
 */
export function BrandMark({
  size,
  variant = 'tile',
  label,
  className = '',
}: {
  /** Pixel size; omit to size the mark with CSS. */
  size?: number;
  variant?: 'tile' | 'glyph';
  label?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MONOGRAM_VIEWBOX}
      className={`shrink-0 ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {variant === 'tile' && <path fill="#D6512C" fillRule="evenodd" d={MONOGRAM_SQUARE} />}
      <path fill={variant === 'tile' ? '#fff' : 'currentColor'} fillRule="evenodd" d={MONOGRAM_GLYPH} />
    </svg>
  );
}

/** The full lockup: monogram, firm name and "Solicitors. Advocates. Arbitrators." */
export function BrandLockup({
  tone = 'light',
  className = '',
}: {
  /** The ground it sits on. Dark grounds get the off-white wordmark. */
  tone?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <img
      src={tone === 'dark' ? '/brand/lockup-dark.svg' : '/brand/lockup.svg'}
      alt="Perchstone & Graeys — Solicitors. Advocates. Arbitrators."
      width={2000}
      height={563}
      className={`h-auto ${className}`}
    />
  );
}
