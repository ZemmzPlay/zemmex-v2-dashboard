import { code39Bars } from '@zemmz/shared';

/** Code 39 barcode as SVG. Scanners in keyboard mode type the ID into the scan field. */
export function Barcode({ value, height = 56, className = '', label = true }: { value: string | number; height?: number; className?: string; label?: boolean }) {
  const { bars, width } = code39Bars(String(value));
  const quiet = 10;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width + quiet * 2} ${height + (label ? 16 : 0)}`}
      role="img"
      aria-label={`Barcode for ${value}`}
      preserveAspectRatio="none"
      style={{ background: '#fff', width: '100%', height: 'auto', maxWidth: 360 }}
    >
      {bars.map((b, i) => (
        <rect key={i} x={b.x + quiet} y={0} width={b.w} height={height} fill="#000" />
      ))}
      {label && (
        <text x={(width + quiet * 2) / 2} y={height + 13} textAnchor="middle" fontSize="12" fontFamily="ui-monospace, monospace" fill="#000" letterSpacing="3">
          {value}
        </text>
      )}
    </svg>
  );
}
