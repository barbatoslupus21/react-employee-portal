'use client';

import { motion, useReducedMotion } from 'motion/react';
import {
  SuccessIcon,
  LockUnlockIcon,
  EyeToggleIcon,
  PlayPauseIcon,
  NotificationIcon,
  SendIcon,
} from '@/components/ui/animated-state-icons';
import { FeatureCard } from '@/components/ui/grid-feature-cards';

const features = [
  {
    title: 'Real-time Sync',
    icon: <SuccessIcon size={28} duration={2200} />,
    description: 'Payroll and attendance data update instantly — no delays, no manual reconciliation.',
  },
  {
    title: 'Full HR Suite',
    icon: <EyeToggleIcon size={28} duration={3000} />,
    description: 'Manage leave requests, training schedules, and employee records in one place.',
  },
  {
    title: 'Secure Access',
    icon: <LockUnlockIcon size={28} duration={2600} />,
    description: 'Enterprise-grade security protects every employee record and sensitive HR data.',
  },
  {
    title: 'Smart Analytics',
    icon: <SendIcon size={28} duration={2800} />,
    description: 'Actionable workforce reports and insights to help HR teams make better decisions.',
  },
  {
    title: 'Training Center',
    icon: <PlayPauseIcon size={28} duration={2400} />,
    description: 'Track employee training programs, certifications, and learning progress in one hub.',
  },
  {
    title: 'Leave Management',
    icon: <NotificationIcon size={28} duration={3200} />,
    description: 'Submit, approve, and monitor leave requests with full audit trail and calendar view.',
  },
];

type ViewAnimationProps = {
  delay?: number;
  className?: string;
  children: React.ReactNode;
};

function AnimatedContainer({ className, delay = 0.1, children }: ViewAnimationProps) {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) return <>{children}</>;
  return (
    <motion.div
      initial={{ filter: 'blur(4px)', translateY: -8, opacity: 0 }}
      whileInView={{ filter: 'blur(0px)', translateY: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.8 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Features() {
  return (
    <section className="py-16 md:py-32">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-6">
        <AnimatedContainer className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-wide text-balance text-[var(--color-text-primary)] md:text-4xl lg:text-5xl xl:font-extrabold">
            Seamless. Secure. Smart.
          </h2>
          <p className="mt-4 text-sm tracking-wide text-balance text-[var(--color-text-secondary)] md:text-base">
            Everything your team needs — payroll, leave, training, and HR — unified in one intelligent platform.
          </p>
        </AnimatedContainer>

        <AnimatedContainer
          delay={0.4}
          className="relative grid grid-cols-1 divide-x divide-y divide-dashed divide-[var(--features-border)] sm:grid-cols-2 md:grid-cols-3 rounded-2xl overflow-hidden"
        >
          {features.map((feature, i) => (
            <FeatureCard key={i} feature={feature} />
          ))}

          {/* overlay dashed border so outer border sits above inner dividers */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl border border-dashed border-[var(--features-border)] z-50" />
        </AnimatedContainer>
      </div>
    </section>
  );
}