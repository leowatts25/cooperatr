import { LogoMark } from './LogoMark';

/**
 * Cooperatr full lockup — mark on the left, "cooperatr" wordmark on the right.
 *
 * Reverse-engineered from the official logo_lockup.svg in the brand asset
 * folder. The wordmark is a single solid bold (700) lowercase string with
 * tight negative letter-spacing; the mark sits to its left at ~1.5x the
 * font-size, scaled to match the visual height of the type.
 *
 * Text inherits its color from the parent (currentColor) so the wordmark
 * adapts to dark/light surfaces. The 3-bar mark stays sky-blue (#4a9eff)
 * across both modes — that's the brand constant.
 *
 * Inter is loaded once at the layout level via next/font/google with
 * weights 200 + 700 and exposed as --font-inter-brand on <html>; .font-brand
 * references it.
 */

type LogoSize = 'sm' | 'md' | 'lg';

interface LogoProps {
  size?: LogoSize;
  className?: string;
  style?: React.CSSProperties;
}

// font is the wordmark size; mark is the SVG height/width.
// Mark : font ratio ≈ 1.45–1.5x to match the official lockup's proportions.
const SIZES: Record<LogoSize, { font: number; mark: number; gap: number }> = {
  sm: { font: 16, mark: 24, gap: 8 },
  md: { font: 22, mark: 32, gap: 10 },
  lg: { font: 36, mark: 52, gap: 14 },
};

export function Logo({ size = 'md', className = '', style }: LogoProps) {
  const { font, mark, gap } = SIZES[size];
  return (
    <span
      className={`font-brand ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap,
        userSelect: 'none',
        lineHeight: 1,
        ...style,
      }}
      role="img"
      aria-label="Cooperatr"
    >
      <LogoMark size={mark} />
      <span
        style={{
          fontWeight: 700,
          fontSize: font,
          letterSpacing: '-0.02em',
        }}
      >
        cooperatr
      </span>
    </span>
  );
}

export default Logo;
