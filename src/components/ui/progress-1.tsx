import * as React from 'react';

const Progress = {
  Root: ({
    className,
    value,
    children,
  }: {
    className?: string;
    value: number;
    children: React.ReactNode;
  }) => (
    <div className={className} data-value={value}>
      {children}
    </div>
  ),
  Label: ({
    className,
    children,
  }: {
    className?: string;
    children: React.ReactNode;
  }) => <div className={className}>{children}</div>,
  Value: ({
    className,
    value,
  }: {
    className?: string;
    value: number;
  }) => <div className={className}>{value}%</div>,
  Track: ({
    className,
    children,
  }: {
    className?: string;
    children: React.ReactNode;
  }) => <div className={className}>{children}</div>,
  Indicator: ({
    className,
    style,
  }: {
    className?: string;
    style?: React.CSSProperties;
  }) => <div className={className} style={style} />,
};

interface ExampleProgressProps {
  completed: number;
  total: number;
}

export default function ExampleProgress({ completed, total }: ExampleProgressProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const [animatedPct, setAnimatedPct] = React.useState(0);
  const hasAnimated = React.useRef(false);

  React.useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    if (pct > 0) {
      requestAnimationFrame(() => {
        setAnimatedPct(pct);
      });
    }
  }, [pct]);

  const currentWidth = pct === 0 ? 0 : animatedPct;
  const barColor = pct === 0 ? 'bg-gray-400' : 'bg-emerald-500';

  return (
    <Progress.Root className="grid w-full grid-cols-2 gap-y-1" value={pct}>
      <Progress.Label className="text-[10px] font-medium text-gray-500">
        {completed} / {total}
      </Progress.Label>
      <Progress.Value className="col-start-2 text-right text-[10px] text-gray-500" value={pct} />
      <Progress.Track className="col-span-full h-2 overflow-hidden rounded-full bg-gray-200 shadow-[inset_0_0_0_1px] shadow-gray-200">
        <Progress.Indicator
          className={`block h-full rounded-full transition-[width] duration-700 ease-out ${barColor}`}
          style={{ width: `${currentWidth}%` }}
        />
      </Progress.Track>
    </Progress.Root>
  );
}
