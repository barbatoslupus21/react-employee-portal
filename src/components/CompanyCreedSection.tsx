"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { FeatureCard } from "@/components/ui/grid-feature-cards";
import {
  Users,
  Timer,
  Factory,
  MessageCircle,
  Heart,
  Lightbulb,
  Shield,
} from "lucide-react";

const CREEDS = [
  {
    icon: Users,
    title: "Customer First Principle",
    description: "We prioritize customer needs, delivering responsive, value-driven service.",
  },
  {
    icon: Timer,
    title: "Speed",
    description: "We act swiftly, resolve issues fast, and uphold deadlines.",
  },
  {
    icon: Factory,
    title: "Genba Principle",
    description: "We ensure a safe, quality-focused workplace through real-world engagement.",
  },
  {
    icon: MessageCircle,
    title: "Communication",
    description: "We build strong relationships through open, respectful communication.",
  },
  {
    icon: Heart,
    title: "Gratitude",
    description: "We express gratitude, respect, and celebrate mutual growth.",
  },
  {
    icon: Lightbulb,
    title: "Challenge",
    description: "We embrace innovation, exploring new fields and technologies.",
  },
  {
    icon: Shield,
    title: "Corporate Culture",
    description: "We uphold compliance, respect, and social responsibility in all we do.",
  },
];

type AnimatedContainerProps = {
  delay?: number;
  className?: string;
  children: React.ReactNode;
};

function AnimatedContainer({ className, delay = 0.1, children }: AnimatedContainerProps) {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ filter: "blur(4px)", translateY: -8, opacity: 0 }}
      whileInView={{ filter: "blur(0px)", translateY: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.8 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function CompanyCreedSection() {
  return (
    <section id="creed" className="py-16 md:py-32">
      <div className="mx-auto w-full max-w-5xl space-y-8 px-4">
        {/* Header */}
        <AnimatedContainer className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-1.5">
            <span className="text-xs font-medium text-[var(--color-text-muted)] text-filled">
              Our Values
            </span>
          </div>
          <h2 className="text-3xl font-bold tracking-wide text-balance md:text-4xl lg:text-5xl xl:font-extrabold text-filled">
            Company Creed
          </h2>
          <p className="mt-4 text-sm tracking-wide text-balance md:text-base text-[var(--color-text-secondary)] text-filled">
            The core beliefs that shape our culture, drive our decisions, and define who we are as a company.
          </p>
        </AnimatedContainer>

        {/* Feature card grid */}
        <AnimatedContainer
          delay={0.4}
          className="grid grid-cols-1 divide-x divide-y divide-dashed border border-dashed border-[var(--color-border-strong)] sm:grid-cols-2 md:grid-cols-3"
        >
          {CREEDS.map((creed, i) => (
            <FeatureCard
              key={i}
              feature={creed}
              className="bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-card)] transition-colors duration-200"
            />
          ))}
        </AnimatedContainer>
      </div>
    </section>
  );
}
