import * as React from 'react';

const Meter = {
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
  }: {
    className?: string;
  }) => <div className={className} />,
};

export default function ExampleMeter() {
  return (
    <Meter.Root className="box-border grid w-48 grid-cols-2 gap-y-2" value={24}>
      <Meter.Label className="text-sm font-medium text-gray-900">
        Storage Used
      </Meter.Label>
      <Meter.Value className="col-start-2 m-0 text-right text-sm leading-5 text-gray-900" value={24} />
      <Meter.Track className="col-span-2 block h-2 w-48 overflow-hidden rounded-full bg-gray-100 shadow-[inset_0_0_0_1px] shadow-gray-200">
        <Meter.Indicator className="block bg-emerald-500 transition-all duration-500" />
      </Meter.Track>
    </Meter.Root>
  );
}
