import type { AvatarShape } from '@zemmz/shared';
import { hue, initials } from '@/lib/format';

const RADIUS: Record<AvatarShape, string> = { hex: '0', square: '8px', circle: '50%', round: '30%' };
const HEX = 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%)';

/** Initials on a colour derived from the name; the shape comes from the event type. */
export function Avatar({ name, size = 32, shape = 'circle', src }: { name: string; size?: number; shape?: AvatarShape; src?: string }) {
  const h = hue(name);
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `hsl(${h} 70% 92%)`,
        color: `hsl(${h} 55% 30%)`,
        borderRadius: RADIUS[shape],
        clipPath: shape === 'hex' ? HEX : undefined,
        overflow: 'hidden',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}
