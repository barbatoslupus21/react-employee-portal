'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

const getRandom = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const generateSmoothPath = (points: number[], width: number, height: number): string => {
  if (!points || points.length < 2) {
    return `M 0 ${height}`;
  }

  const xStep = width / (points.length - 1);
  const pathData = points.map((point, i) => {
    const x = i * xStep;
    const y = height - (point / 100) * (height * 0.8) - height * 0.1;
    return [x, y] as const;
  });

  let path = `M ${pathData[0][0]} ${pathData[0][1]}`;

  for (let i = 0; i < pathData.length - 1; i += 1) {
    const x1 = pathData[i][0];
    const y1 = pathData[i][1];
    const x2 = pathData[i + 1][0];
    const y2 = pathData[i + 1][1];
    const midX = (x1 + x2) / 2;
    path += ` C ${midX},${y1} ${midX},${y2} ${x2},${y2}`;
  }

  return path;
};

interface StatsState {
  amount: number;
  change: number;
  chartData: number[];
}

export function StatsWidget() {
  const [stats, setStats] = useState<StatsState>({
    amount: 283,
    change: 36,
    chartData: [30, 55, 45, 75, 60, 85, 70],
  });
  const linePathRef = useRef<SVGPathElement | null>(null);
  const areaPathRef = useRef<SVGPathElement | null>(null);

  const updateStats = () => {
    const newAmount = getRandom(100, 999);
    const newChange = getRandom(-50, 100);
    const newChartData = Array.from({ length: 7 }, () => getRandom(10, 90));

    setStats({
      amount: newAmount,
      change: newChange,
      chartData: newChartData,
    });
  };

  useEffect(() => {
    const intervalId = window.setInterval(updateStats, 3000);
    return () => window.clearInterval(intervalId);
  }, []);

  const svgWidth = 150;
  const svgHeight = 60;

  const linePath = useMemo(
    () => generateSmoothPath(stats.chartData, svgWidth, svgHeight),
    [stats.chartData],
  );

  const areaPath = useMemo(() => {
    if (!linePath.startsWith('M')) return '';
    return `${linePath} L ${svgWidth} ${svgHeight} L 0 ${svgHeight} Z`;
  }, [linePath]);

  useEffect(() => {
    const path = linePathRef.current;
    const area = areaPathRef.current;

    if (path && area) {
      const length = path.getTotalLength();

      path.style.transition = 'none';
      path.style.strokeDasharray = `${length} ${length}`;
      path.style.strokeDashoffset = `${length}`;

      area.style.transition = 'none';
      area.style.opacity = '0';

      path.getBoundingClientRect();

      path.style.transition = 'stroke-dashoffset 0.8s ease-in-out, stroke 0.5s ease';
      path.style.strokeDashoffset = '0';

      area.style.transition = 'opacity 0.8s ease-in-out 0.2s, fill 0.5s ease';
      area.style.opacity = '1';
    }
  }, [linePath]);

  const isPositiveChange = stats.change >= 0;
  const changeColorClass = isPositiveChange ? 'text-success' : 'text-destructive';
  const graphStrokeColor = isPositiveChange ? 'var(--success-stroke)' : 'var(--destructive-stroke)';
  const gradientId = isPositiveChange ? 'areaGradientSuccess' : 'areaGradientDestructive';

  return (
    <div className="w-full max-w-md bg-card text-card-foreground rounded-3xl shadow-lg p-6 border">
      <div className="flex justify-between items-center">
        <div className="flex flex-col w-1/2">
          <div className="flex items-center text-muted-foreground text-md">
            <span>This Week</span>
            <span className={`ml-2 flex items-center font-semibold ${changeColorClass}`}>
              {Math.abs(stats.change)}%
              {isPositiveChange ? <ArrowUp size={16} className="ml-1" /> : <ArrowDown size={16} className="ml-1" />}
            </span>
          </div>
          <p className="text-4xl font-bold text-foreground mt-2">${stats.amount}</p>
        </div>
        <div className="w-1/2 h-16">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="areaGradientSuccess" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--success-stroke)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--success-stroke)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="areaGradientDestructive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--destructive-stroke)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--destructive-stroke)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path ref={areaPathRef} d={areaPath} fill={`url(#${gradientId})`} />
            <path
              ref={linePathRef}
              d={linePath}
              fill="none"
              stroke={graphStrokeColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
