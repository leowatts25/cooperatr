import { LogoMark } from './LogoMark';

/**
 * Cooperatr full wordmark.
 *
 * Reads "co<bar-mark>op<bar-mark>ratr" — wait, no:
 * The wordmark is "co" (700) + "op" (200) + [3-bar mark replacing the "e"] +
 * "ratr" (200), all lowercase, mixed-weight Inter.
 *
 * The text inherits its color from the parent (currentColor) so the wordmark
 * adapts to dark/light surfaces. The 3-bar mark stays sky-blue (#4a9eff)
 * across both modes — that's the brand constant.
 *
 * Inter font is loaded once at the layout level via next/font/google with
 * weights 200 + 700, so this component just references the CSS variable.
 */

type LogoSize = 'sm' | 'md' | 'lg';

interface LogoProps {
  size?: LogoSize;
  className?: string;
  style?: React.CSSProperties;
}

const SIZES: Record<LogoSize, { font: number; bar: number }> = {
  sm: { font: 18, bar: 14 },
  md: { font: 28, bar: 22 },
  lg: { font: 40, bar: 32 },
};

export function Logo({ size = 'md', className = '', style }: LogoProps) {
  const { font, bar } = SIZES[size];
  return (
    <span
      className={`font-brand ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        userSelect: 'none',
        fontSize: font,
        letterSpacing: '0.01em',
        lineHeight: 1,
        ...style,
      }}
      role="img"
      aria-label="Cooperatr"
    >
      <span style={{ fontWeight: 700 }}>co</span>
      <span style={{ fontWeight: 200 }}>op</span>
      <LogoMark size={bar} style={{ margin: '0 2px' }} />
      <span style={{ fontWeight: 200 }}>ratr</span>
    </span>
  );
}

export default Logo;
