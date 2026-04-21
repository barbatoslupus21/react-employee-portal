'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { CheckCircle, TrendingUp, Globe, Lightbulb } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { InteractiveGlobe } from '@/components/ui/interactive-globe';

// ── Types ────────────────────────────────────────────
interface FeatureMetric {
  label: string;
  icon: LucideIcon;
}

interface PanelData {
  id: string;
  label: string;
  title: string;
  description: string;
  barColor: string;
}

// ── Data ─────────────────────────────────────────────
const MISSION: PanelData = {
  id: 'mission',
  label: '',
  title: 'Our Mission',
  description:
    'To provide excellent Quality, Cost, Delivery, Service, and Response Speed for customers to be impressed. To continuously improve safety, clean facilities, and employee happiness.',
  barColor: '#5989f5',
};

const VISION: PanelData = {
  id: 'vision',
  label: '',
  title: 'Vision 2030',
  description:
    'Ryonan Group possesses extensive global capabilities, providing new value that customers demand. We aim to be a company that excites everyone.',
  barColor: '#8b5cf6',
};

// ── Panel Text Details ────────────────────────────────
function PanelDetails({
  panel,
  align,
}: {
  panel: PanelData;
  align: 'left' | 'right';
}) {
  return (
    <div
      className={`flex flex-col max-w-sm ${
        align === 'right' ? 'items-end text-right' : 'items-start text-left'
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)] mb-2 text-filled">
        {panel.label}
      </p>
      <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-5 text-[var(--color-text-primary)]">
        {panel.title}
      </h2>
      <p className="text-[var(--color-text-secondary)] mb-8 leading-relaxed text-filled">
        {panel.description}
      </p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────
export function MissionVisionShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // ── Delay: first 0.38 of scroll (≈ 2 full viewport heights) is blank ──
  // Animation begins at 0.38 and runs to 1.0 (compressed from original keyframes)

  // ── Phase 1: Mission emerges as globe drifts right ──
  const missionOpacity = useTransform(scrollYProgress, [0, 0.38, 0.44, 0.56, 0.62, 1.0], [0, 0, 1, 1, 0, 0]);
  const missionX = useTransform(scrollYProgress, [0, 0.38, 0.47, 0.56, 1.0], ['20%', '20%', '0%', '0%', '0%']);

  // ── Phase 2: Globe stays center → drifts right → returns → drifts left ──
  const globeX = useTransform(
    scrollYProgress,
    [0, 0.38, 0.47, 0.59, 0.68, 0.79, 0.91, 1.0],
    ['0%', '0%', '30%', '30%', '0%', '-30%', '-30%', '-30%']
  );
  const globeScale = useTransform(
    scrollYProgress,
    [0, 0.38, 0.59, 0.68, 1.0],
    [1, 1, 1, 1.08, 1]
  );

  // ── Phase 3: Vision emerges as globe drifts left ──
  const visionOpacity = useTransform(scrollYProgress, [0, 0.74, 0.82, 0.91, 1.0], [0, 0, 1, 1, 1]);
  const visionX = useTransform(scrollYProgress, [0, 0.74, 0.88, 1.0], ['-20%', '-20%', '0%', '0%']);

  return (
    <div ref={containerRef} className="relative" style={{ height: '500vh' }}>
      {/* Sticky viewport */}
       <div className="sticky top-0 h-screen flex items-center justify-center overflow-visible">
        <div className="relative w-full max-w-6xl mx-auto px-4">
          {/* Mission text — left side */}
          <motion.div
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-[100%]"
            style={{ opacity: missionOpacity, x: missionX }}
          >
            <PanelDetails panel={MISSION} align="left" />
          </motion.div>

          {/* Globe — center anchor */}
          <motion.div
            className="relative z-20 flex items-center justify-center mx-auto w-100"
            style={{
              x: globeX,
              scale: globeScale,
               width: 700,
               height: 700,
            }}
          >
              <InteractiveGlobe size={800} />
          </motion.div>

          {/* Vision text — right side */}
          <motion.div
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-[40%]"
            style={{ opacity: visionOpacity, x: visionX }}
          >
            <PanelDetails panel={VISION} align="right" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
