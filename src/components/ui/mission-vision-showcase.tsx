'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Globe } from '@/components/ui/globe';

const MISSION = {
  tag: 'Our Mission',
  title: 'Excellence in\nEvery Delivery',
  description:
    'To provide excellent Quality, Cost, Delivery, Service, and Response Speed for customers to be impressed. To continuously improve safety, clean facilities, and employee happiness.',
  accent: '#5989f5',
};

const VISION = {
  tag: 'Vision 2030',
  title: 'A Company That\nExcites Everyone',
  description:
    'Ryonan Group possesses extensive global capabilities, providing new value that customers demand. We aim to be a company that excites everyone.',
  accent: '#8b5cf6',
};

const GLOBE_MARKERS = [
  { id: 'jp', location: [36.2, 138.25] as [number, number], label: 'Japan' },
  { id: 'ph', location: [12.88, 121.77] as [number, number], label: 'Philippines' },
  { id: 'cn', location: [35.86, 104.2] as [number, number], label: 'China' },
  { id: 'vn', location: [14.06, 108.28] as [number, number], label: 'Vietnam' },
  { id: 'sg', location: [1.35, 103.82] as [number, number], label: 'Singapore' },
  { id: 'in', location: [20.59, 78.96] as [number, number], label: 'India' },
  { id: 'cz', location: [49.82, 15.47] as [number, number], label: 'Czech Republic' },
  { id: 'th', location: [15.87, 100.99] as [number, number], label: 'Thailand' },
  { id: 'id', location: [-0.79, 113.92] as [number, number], label: 'Indonesia' },
];

const GLOBE_ARCS = [
  { id: 'jp-ph', from: [36.2, 138.25] as [number, number], to: [12.88, 121.77] as [number, number] },
  { id: 'jp-cn', from: [36.2, 138.25] as [number, number], to: [35.86, 104.2] as [number, number] },
  { id: 'jp-vn', from: [36.2, 138.25] as [number, number], to: [14.06, 108.28] as [number, number] },
  { id: 'jp-sg', from: [36.2, 138.25] as [number, number], to: [1.35, 103.82] as [number, number] },
  { id: 'jp-in', from: [36.2, 138.25] as [number, number], to: [20.59, 78.96] as [number, number] },
  { id: 'jp-cz', from: [36.2, 138.25] as [number, number], to: [49.82, 15.47] as [number, number] },
  { id: 'ph-sg', from: [12.88, 121.77] as [number, number], to: [1.35, 103.82] as [number, number] },
  { id: 'ph-id', from: [12.88, 121.77] as [number, number], to: [-0.79, 113.92] as [number, number] },
];

function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => setIsDark(root.getAttribute('data-theme') === 'dark');
    applyTheme();
    const observer = new MutationObserver(applyTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function SectionTag({ label, color }: { label: string; color: string }) {
  return (
    <div className="inline-flex items-center gap-2 mb-4">
      <span
        className="h-0.5 w-6 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span
        className="text-[11px] font-bold uppercase tracking-[0.18em]"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Mobile layout — simple stacked with whileInView animations ────────────────

function MobileLayout({ isDark }: { isDark: boolean }) {
  return (
    <div className="px-6 py-24 space-y-20 lg:hidden">
      {/* Mission */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-4 text-center"
      >
        <SectionTag label={MISSION.tag} color={MISSION.accent} />
        <h2 className="text-4xl font-black tracking-tight text-[var(--color-text-primary)] whitespace-pre-line">
          {MISSION.title}
        </h2>
        <p className="text-[var(--color-text-secondary)] leading-relaxed text-filled max-w-sm mx-auto">
          {MISSION.description}
        </p>
      </motion.div>

      {/* Globe */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto w-72 h-72 sm:w-80 sm:h-80"
      >
        {/* Glow ring */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-[#5989f5]/20 to-[#8b5cf6]/10 blur-2xl -z-10 scale-110" />
        <Globe
          className="w-full h-full"
          markers={GLOBE_MARKERS}
          arcs={GLOBE_ARCS}
          dark={isDark ? 1 : 0}
          baseColor={isDark ? [0.15, 0.2, 0.36] : [1, 1, 1]}
          glowColor={isDark ? [0.16, 0.24, 0.44] : [0.94, 0.93, 0.91]}
          mapBrightness={isDark ? 9 : 10}
          markerColor={isDark ? [0.42, 0.62, 1.0] : [0.3, 0.45, 0.85]}
          arcColor={isDark ? [0.42, 0.62, 1.0] : [0.3, 0.45, 0.85]}
        />
      </motion.div>

      {/* Vision */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-4 text-center"
      >
        <SectionTag label={VISION.tag} color={VISION.accent} />
        <h2 className="text-4xl font-black tracking-tight text-[var(--color-text-primary)] whitespace-pre-line">
          {VISION.title}
        </h2>
        <p className="text-[var(--color-text-secondary)] leading-relaxed text-filled max-w-sm mx-auto">
          {VISION.description}
        </p>
      </motion.div>
    </div>
  );
}

// ── Desktop layout — scroll-driven with sticky globe ─────────────────────────

function DesktopLayout({ isDark }: { isDark: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Mission: appears earlier and holds longer before transitioning to vision
  const missionOpacity = useTransform(
    scrollYProgress,
    [0, 0.32, 0.4, 0.68, 0.76, 1.0],
    [0, 0, 1, 1, 0, 0]
  );
  const missionX = useTransform(
    scrollYProgress,
    [0, 0.32, 0.42, 0.68, 1.0],
    ['24%', '24%', '0%', '0%', '0%']
  );

  // Globe: center → shifts right (mission phase) → back → shifts left (vision phase)
  const globeX = useTransform(
    scrollYProgress,
    [0, 0.32, 0.42, 0.7, 0.78, 0.88, 0.95, 1.0],
    ['0%', '0%', '30%', '30%', '0%', '-30%', '-30%', '-30%']
  );
  const globeScale = useTransform(
    scrollYProgress,
    [0, 0.32, 0.64, 0.74, 1.0],
    [1, 1, 1, 1.06, 1]
  );
    const globeOpacity = useTransform(
      scrollYProgress,
      [0, 0.36, 0.64, 0.8, 0.92, 1.0],
      [1, 0.86, 0.78, 0.78, 0.9, 1]
  );
  const glowOpacity = useTransform(
    scrollYProgress,
    [0, 0.36, 0.64, 0.82, 0.94, 1.0],
    [1, 0.35, 0.25, 0.25, 0.7, 1]
  );

  // Vision: delayed so mission remains visible longer
  const visionOpacity = useTransform(
    scrollYProgress,
    [0, 0.82, 0.9, 1.0],
    [0, 0, 1, 1]
  );
  const visionX = useTransform(
    scrollYProgress,
    [0, 0.82, 0.93, 1.0],
    ['-24%', '-24%', '0%', '0%']
  );

  return (
    <div
      ref={containerRef}
      className="relative hidden lg:block"
      style={{ height: '380vh' }}
    >
      <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden">
        <div className="relative w-full max-w-6xl mx-auto px-8">

          {/* Mission — left */}
          <motion.div
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-[38%]"
            style={{ opacity: missionOpacity, x: missionX }}
          >
            <SectionTag label={MISSION.tag} color={MISSION.accent} />
            <h2 className="text-5xl font-black tracking-tight text-[var(--color-text-primary)] whitespace-pre-line leading-[1.05] mb-5">
              {MISSION.title}
            </h2>
            <p className="text-[var(--color-text-secondary)] leading-relaxed text-filled text-base max-w-sm">
              {MISSION.description}
            </p>
          </motion.div>

          {/* Globe — center */}
          <motion.div
            className="relative z-20 flex items-center justify-center mx-auto"
            style={{
              x: globeX,
              scale: globeScale,
              opacity: globeOpacity,
              width: 620,
              height: 620,
            }}
          >
            {/* Ambient glow */}
            <motion.div
              className="absolute inset-0 rounded-full bg-gradient-to-b from-[#5989f5]/15 to-[#8b5cf6]/10 blur-3xl scale-110 -z-10"
              style={{ opacity: glowOpacity }}
            />
            <Globe
              className="w-full h-full"
              markers={GLOBE_MARKERS}
              arcs={GLOBE_ARCS}
              dark={isDark ? 1 : 0}
                baseColor={isDark ? [0.15, 0.2, 0.36] : [1, 1, 1]}
                glowColor={isDark ? [0.16, 0.24, 0.44] : [0.94, 0.93, 0.91]}
                mapBrightness={isDark ? 9 : 10}
                markerColor={isDark ? [0.42, 0.62, 1.0] : [0.3, 0.45, 0.85]}
                arcColor={isDark ? [0.42, 0.62, 1.0] : [0.3, 0.45, 0.85]}
            />
          </motion.div>

          {/* Vision — right */}
          <motion.div
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-[38%]"
            style={{ opacity: visionOpacity, x: visionX }}
          >
            <div className="flex flex-col items-end text-right">
              <SectionTag label={VISION.tag} color={VISION.accent} />
              <h2 className="text-5xl font-black tracking-tight text-[var(--color-text-primary)] whitespace-pre-line leading-[1.05] mb-5">
                {VISION.title}
              </h2>
              <p className="text-[var(--color-text-secondary)] leading-relaxed text-filled text-base max-w-sm">
                {VISION.description}
              </p>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export function MissionVisionShowcase() {
  const isDark = useIsDarkTheme();

  return (
    <div>
      <MobileLayout isDark={isDark} />
      <DesktopLayout isDark={isDark} />
    </div>
  );
}
