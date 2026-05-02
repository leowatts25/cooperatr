/**
 * Cooperatr brand mark — three layered horizontal bars in the brand accent
 * color, evoking layered public catalytic finance, sector specialisation,
 * and impact reporting (the platform's three-stage pipeline).
 *
 * Inline SVG so it scales crisply and inherits its color from the surrounding
 * theme. Uses currentColor so the mark adapts to dark/light/accent contexts.
 */

interface CooperatrMarkProps {
  size?: number;
  /**
   * If provided, overrides currentColor. Use 'var(--accent)' or any CSS color.
   * Pass 'currentColor' (default) to inherit from the parent text color.
   */
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function CooperatrMark({
  size = 22,
  color = 'currentColor',
  className,
  style,
}: CooperatrMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 22 22"
      width={size}
      height={size}
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
