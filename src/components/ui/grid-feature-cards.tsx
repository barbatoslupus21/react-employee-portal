import { cn } from '@/lib/utils';
import React from 'react';

type FeatureType = {
  title: string;
  // allow either a ready-made React node (e.g. <Icon />) or a component/type (e.g. Icon)
  icon: React.ReactNode | React.ElementType;
  description: string;
};

type FeatureCardProps = React.ComponentProps<'div'> & {
  feature: FeatureType;
};

export function FeatureCard({ feature, className, ...props }: FeatureCardProps) {
  const p = React.useMemo(() => genRandomPattern(5, hashString(feature.title)), [feature.title]);

  return (
    <div className={cn('relative overflow-hidden p-6', className)} {...props}>
      <div className="pointer-events-none absolute top-0 right-0 w-1/2 h-36 md:h-44 lg:h-52 opacity-50 p-0 [mask-image:linear-gradient(white,transparent)]">
        <div className="from-foreground/5 to-foreground/1 absolute inset-0 bg-gradient-to-r [mask-image:radial-gradient(farthest-side_at_top,white,transparent)] opacity-80">
          <GridPattern
            width={25}
            height={25}
            x="-8"
            y="0"
            className="fill-foreground/5 stroke-foreground/25 absolute inset-0 h-full w-full mix-blend-overlay"
          />
        </div>
      </div>
      {/* Decorative large grid block (top-right) matching reference design */}
      <div className="opacity-90" style={{ color: 'var(--color-text-primary)' }} aria-hidden>
        {(() => {
          const Icon = feature.icon as any;
          if (React.isValidElement(Icon)) return Icon;
          if (typeof Icon === 'function' || typeof Icon === 'object') {
            try {
              return <Icon />;
            } catch (e) {
              return null;
            }
          }
          return Icon;
        })()}
      </div>
      <h3 className="mt-10 text-sm md:text-base font-semibold text-[var(--color-text-primary)] text-filled">
        {feature.title}
      </h3>
      <p className="relative z-20 mt-2 text-xs font-light text-[var(--color-text-secondary)] text-filled">
        {feature.description}
      </p>
    </div>
  );
}

function GridPattern({
  width,
  height,
  x,
  y,
  squares,
  ...props
}: React.ComponentProps<'svg'> & {
  width: number;
  height: number;
  x: string;
  y: string;
  squares?: number[][];
}) {
  const patternId = React.useId();

  return (
    <svg aria-hidden="true" {...props}>
      <defs>
        <pattern
          id={patternId}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M.5 ${height}V.5H${width}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.6}
            strokeLinecap="square"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${patternId})`} />
      {squares && (
        <svg x={x} y={y} className="overflow-visible">
          {squares.map(([sx, sy], index) => (
            <rect
              fill="currentColor"
              strokeWidth="0"
              key={index}
              width={width + 1}
              height={height + 1}
              x={sx * width}
              y={sy * height}
            />
          ))}
        </svg>
      )}
    </svg>
  );
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genRandomPattern(length?: number, seed?: number): number[][] {
  length = length ?? 5;
  const rng = mulberry32(seed ?? 1);
  return Array.from({ length }, () => [Math.floor(rng() * 4) + 7, Math.floor(rng() * 6) + 1]);
}
