"use client";

import { AnimatedGroup } from "@/components/ui/animated-group";
import { DottedSurface } from "@/components/ui/dotted-surface";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { TypingAnimation } from "@/components/ui/typing-animation";
import { ArrowRight } from "lucide-react";
import { type Variants } from "motion/react";

const transitionVariants: Variants = {
  hidden: { opacity: 0, filter: "blur(12px)", y: 12 },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: { type: "spring", bounce: 0.3, duration: 1.5 },
  },
};

const WORDS = [
  "Connect",
  "Coordinate",
  "Community",
  "Collaborate",
  "Communicate",
  "Correspond",
];

interface HeroSectionProps {
  onLoginClick: () => void;
}

export default function HeroSection({ onLoginClick }: HeroSectionProps) {
  return (
    <>
      <div
        aria-hidden
        className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block"
      >
        <div className="w-[35rem] h-[80rem] -translate-y-[350px] absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
        <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
        <div className="h-[80rem] -translate-y-[350px] absolute left-0 top-0 w-56 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
      </div>

      {/* Hero section — relative so DottedSurface (absolute) is clipped to it */}
      <section
        id="hero"
        className="relative overflow-hidden isolate"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-46rem] hidden h-[99rem] w-[99rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,#6366f150_0%,rgba(99,102,241,0.18)_28%,rgba(99,102,241,0.08)_48%,transparent_72%)] dark:block"
        />
        {/* Dotted surface scoped only to this section */}
        <DottedSurface className="-top-70" />

        <div className="relative pt-24 md:pt-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
              <AnimatedGroup
                variants={{
                  container: { visible: { transition: { staggerChildren: 0.12 } } },
                  item: transitionVariants,
                }}
              >
                {/* Announcement badge */}
                <a
                  href="#mission-vision"
                  onClick={(e) => {
                    e.preventDefault();
                    document.querySelector("#mission-vision")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="hover:bg-[var(--color-bg-card)] bg-[var(--color-bg-card)] group mx-auto flex w-fit
                    items-center gap-4 rounded-full border border-[var(--color-border)]
                    p-1 pl-4 shadow-md shadow-black/5 transition-all duration-300"
                >
                  <span className="text-[var(--color-text-secondary)] text-sm text-filled">
                    Ryonan Electric Philippines Employee Portal
                  </span>
                  <span className="block h-4 w-0.5 border-l border-[var(--color-border-strong)]" />
                  <div className="bg-[var(--color-bg-elevated)] group-hover:bg-[var(--color-bg-card)] size-6 overflow-hidden rounded-full duration-500">
                    <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                      <span className="flex size-6"><ArrowRight className="m-auto size-3" /></span>
                      <span className="flex size-6"><ArrowRight className="m-auto size-3" /></span>
                    </div>
                  </div>
                </a>

                {/* Hero heading — bold, tight leading */}
                <h1 className="mt-8 mx-auto text-4xl sm:text-5xl md:text-6xl lg:mt-12 xl:text-[4rem] font-black leading-[1.04] tracking-tight">
                  One Workplace
                  <br />
                  One Platform
                  <br />
                  {/*
                    Wrap REP + typed word together so they share
                    one vertical gradient and stay baseline-aligned.
                    WebkitTextStroke: 0px overrides globals.css outline rule.
                  */}
                  <span
                    className="whitespace-nowrap bg-gradient-to-b from-[#5989f5] to-white bg-clip-text"
                    style={{ WebkitTextFillColor: "transparent", WebkitTextStroke: "0px" }}
                  >
                    REP<TypingAnimation
                      words={WORDS}
                      typeSpeed={80}
                      deleteSpeed={45}
                      pauseDuration={2000}
                      waitDuration={250}
                      cursorClassName="text-[#4872f1]"
                    />
                  </span>
                </h1>

                {/* Subtext */}
                <p className="mx-auto mt-6 max-w-2xl text-balance text-md text-[var(--color-text-secondary)] text-filled">
                  A unified employee portal of Ryonan Electric Philippines —
                  streamlining payroll, leave, training, and everything in between.
                </p>
              </AnimatedGroup>

              {/* CTA Buttons */}
              <AnimatedGroup
                variants={{
                  container: { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.75 } } },
                  item: transitionVariants,
                }}
                className="mt-10 flex flex-row flex-wrap items-center justify-center gap-3 sm:gap-4"
              >
                <InteractiveHoverButton
                  text="Login to Portal"
                  onClick={onLoginClick}
                  className="min-w-[140px] px-4 py-2 text-xs sm:min-w-[160px] sm:px-5 sm:py-2.5 sm:text-sm md:min-w-[180px] md:px-6 md:py-2.5 md:text-xs"
                />
                <InteractiveHoverButton
                  text="Learn More"
                  onClick={() => document.querySelector("#mission-vision")?.scrollIntoView({ behavior: "smooth" })}
                  className="min-w-[128px] border-[var(--color-border)] bg-transparent px-4 py-2 text-xs text-[var(--color-text-secondary)] hover:text-white sm:min-w-[144px] sm:px-5 sm:py-2.5 sm:text-sm md:min-w-[164px] md:px-6 md:py-2.5 md:text-xs"
                />
              </AnimatedGroup>
            </div>
          </div>

          {/* App mockup screenshot */}
          <AnimatedGroup
            variants={{
              container: { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.75 } } },
              item: transitionVariants,
            }}
          >
            <div className="relative -mr-56 mt-8 overflow-hidden px-2 sm:mr-0 sm:mt-12 md:mt-20">
              <div
                aria-hidden
                className="bg-gradient-to-b to-[var(--color-bg)] absolute inset-0 z-10 from-transparent from-35%"
              />
              <div
                className="bg-[var(--color-bg-elevated)] relative mx-auto w-full max-w-[72rem] overflow-hidden
                  rounded-2xl border border-[var(--color-border)] shadow-lg shadow-black/15"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="bg-[var(--color-bg-card)] aspect-[15/8] w-full relative hidden rounded-2xl object-cover dark:block"
                  src="/dashboard-hr-dark.png"
                  alt="REPConnect HR dashboard preview"
                  width="1440"
                  height="900"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="z-2 border-[var(--color-border)] aspect-[15/8] w-full relative rounded-2xl border object-cover dark:hidden"
                  src="/dashboard-hr-light.png"
                  alt="REPConnect HR dashboard preview"
                  width="1440"
                  height="900"
                />
              </div>
            </div>
          </AnimatedGroup>
        </div>
      </section>
    </>
  );
}

