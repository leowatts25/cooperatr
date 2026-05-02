/**
 * Cooperatr LogoMark — the standalone three-bar "E" symbol.
 *
 * Three horizontal rectangles in a 22×22 viewBox at descending opacity
 * (100 / 75 / 55). Reads as a layered platform stack and replaces the
 * letter "e" inside the wordmark.
 */

interface LogoMarkProps {
  size?: number;
  className?: string;
  /** Override the accent color (defaults to brand sky-blue). */
  color?: string;
  style?: React.CSSProperties;
}

export function LogoMark({
  size = 32,
  className = '',
  color = '#4a9eff',
  style,
}: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="18" height="3" fill={color} />
      <rect x="2" y="9.5" width="14" height="3" fill={color} opacity="0.75" />
      <rect x="2" y="17" width="18" height="3" fill={color} opacity="0.55" />
    </svg>
  );
}

export default LogoMark;
