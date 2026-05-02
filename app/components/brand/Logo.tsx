import Image from 'next/image';

/**
 * Cooperatr full wordmark — renders the official designed PNG asset.
 *
 * The actual artwork lives in /public:
 *   - cooperatr-logo-lighttext.png — white wordmark (use on dark surfaces)
 *   - cooperatr-logo-darktext.png  — black wordmark (use on light surfaces)
 *
 * Both PNGs are 2072×704 (aspect ratio ~2.94 : 1) with the 3-bar mark
 * inline replacing the "e" in "cooperatr".
 *
 * We render via next/image so Next.js optimizes the asset (correct
 * dimensions for the device, lazy-load by default, blur placeholder).
 */

type LogoSize = 'sm' | 'md' | 'lg';
type LogoVariant = 'light' | 'dark';

interface LogoProps {
  /** Visual size — sm (footer), md (nav, default), lg (auth/hero). */
  size?: LogoSize;
  /**
   * Which artwork to render.
   *  - 'light' (default): white wordmark, for use on dark surfaces.
   *  - 'dark': black wordmark, for use on light surfaces.
   */
  variant?: LogoVariant;
  className?: string;
  style?: React.CSSProperties;
  /** Render eagerly without lazy-loading. Use for above-the-fold logos. */
  priority?: boolean;
}

// Source PNG aspect ratio — 2072×704 ≈ 2.94 : 1.
const ASPECT = 2072 / 704;

const HEIGHTS: Record<LogoSize, number> = {
  sm: 24,
  md: 36,
  lg: 56,
};

export function Logo({
  size = 'md',
  variant = 'light',
  className,
  style,
  priority = false,
}: LogoProps) {
  const height = HEIGHTS[size];
  const width = Math.round(height * ASPECT);
  const src =
    variant === 'dark'
      ? '/cooperatr-logo-darktext.png'
      : '/cooperatr-logo-lighttext.png';

  return (
    <Image
      src={src}
      alt="Cooperatr"
      width={width}
      height={height}
      className={className}
      style={{ display: 'inline-block', height, width: 'auto', ...style }}
      priority={priority}
    />
  );
}

export default Logo;
