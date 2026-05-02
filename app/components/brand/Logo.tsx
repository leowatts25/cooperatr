import { LogoMark } from './LogoMark';

/**
 * Cooperatr full wordmark — reverse-engineered from the official PNG
 * (cooperatr_logo_on_white.png in the GRAPHIC LOGO NEW folder).
 *
 * Reads "co<bar-mark>op<bar-mark>ratr" — wait, no:
 * The wordmark is "co" (800 / extra-bold) + "op" (200 / thin) +
 * [3-bar mark replacing the lowercase "e"] + "ratr" (200 / thin),
 * all lowercase, mixed-weight Inter, very tight letter-spacing.
 *
 * The mark sits INLINE between "op" and "ratr", sized so its visual
 * height (the bars area, which is 18 in the 22-viewBox) matches the
 * lowercase x-height of the surrounding letters. mark element ≈ 65%
 * of font-size yields a visual height ≈ 53% of font-size, which is
 * about right for Inter's x-height.
 *
 * Wordmark text inherits its color from the parent (currentColor) so
 * it adapts to dark/light surfaces. The 3-bar mark stays sky-blue
 * (#4a9eff) across both modes — that's the brand constant.
 *
 * Inter is loaded once at the layout level via next/font/google with
 * weights 200 + 800 and exposed as --font-inter-brand on <html>;
 * .font-brand references it.
 */

type LogoSize = 'sm' | 'md' | 'lg';

interface LogoProps {
  size?: LogoSize;
  className?: string;
  style?: React.CSSProperties;
}

// font is the wordmark size; mark is the SVG element size.
// mark : font ratio ≈ 0.65 so the visual content (18 of the 22 viewBox)
// matches the lowercase x-height of the surrounding letters.
const SIZES: Record<LogoSize, { font: number; mark: number }> = {
  sm: { font: 18, mark: 12 },
  md: { font: 28, mark: 18 },
  lg: { font: 44, mark: 28 },
};

export function Logo({ size = 'md', className = '', style }: LogoProps) {
  const { font, mark } = SIZES[size];
  return (
    <span
      className={`font-brand ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        userSelect: 'none',
        fontSize: font,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        ...style,
      }}
      role="img"
      aria-label="Cooperatr"
    >
      <span style={{ fontWeight: 800 }}>co</span>
      <span style={{ fontWeight: 200 }}>op</span>
      {/* Use vertical-align middle on the mark so it visually sits at the
          x-height baseline of the surrounding lowercase letters. The
          inline-flex with align-items: baseline puts the mark on the
          same baseline as the text — the negative margin nudges it up
          slightly to optically center against the x-height. */}
      <span
        style={{
          display: 'inline-flex',
          alignSelf: 'center',
          // shift slightly up so the mark optically aligns with the
          // x-height rather than the baseline
          transform: `translateY(${-font * 0.18}px)`,
        }}
      >
        <LogoMark size={mark} />
      </span>
      <span style={{ fontWeight: 200 }}>ratr</span>
    </span>
  );
}

export default Logo;
