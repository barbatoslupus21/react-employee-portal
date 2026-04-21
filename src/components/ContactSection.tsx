"use client";

import ScrollReveal from "./ScrollReveal";
import { Mail, Building2, Headset } from "lucide-react";

export default function ContactSection() {
  return (
    <section
      id="contact"
      className="relative py-24 sm:py-32 px-4 border-t border-[var(--color-border)]"
    >
      <div className="mx-auto max-w-[1400px]">
        <ScrollReveal>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border
            border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-1.5">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              Get In Touch
            </span>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.05}>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold
            text-[var(--color-text-primary)] mb-4">
            Contact Us
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <p className="text-base sm:text-lg text-[var(--color-text-secondary)]
            mb-12 max-w-2xl">
            For inquiries about REPConnect or your employee records, please
            reach out to the appropriate department below.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          <ScrollReveal delay={0.15}>
            <div className="rounded-2xl border border-[var(--color-border)]
              bg-[var(--color-bg-card)] p-6 sm:p-8 h-full">
              <div className="flex h-11 w-11 items-center justify-center
                rounded-xl bg-[#2845D6]/10 text-[#2845D6] mb-4">
                <Building2 size={22} />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-2">
                Ryonan Electric Philippines
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                Ryonan Electric Philippines Corporation
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="rounded-2xl border border-[var(--color-border)]
              bg-[var(--color-bg-card)] p-6 sm:p-8 h-full">
              <div className="flex h-11 w-11 items-center justify-center
                rounded-xl bg-[#2845D6]/10 text-[#2845D6] mb-4">
                <Mail size={22} />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-2">
                HR Department
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                For employee records, payroll inquiries, leave management, and
                general HR concerns.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.25}>
            <div className="rounded-2xl border border-[var(--color-border)]
              bg-[var(--color-bg-card)] p-6 sm:p-8 h-full">
              <div className="flex h-11 w-11 items-center justify-center
                rounded-xl bg-[#2845D6]/10 text-[#2845D6] mb-4">
                <Headset size={22} />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-2">
                MIS / System Administrator
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                For REPConnect portal support, technical issues, and account
                assistance.
              </p>
            </div>
          </ScrollReveal>
        </div>

        {/* Footer */}
        <ScrollReveal delay={0.3}>
          <div className="border-t border-[var(--color-border)] pt-8 flex flex-col
            sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              &copy; {new Date().getFullYear()} Ryonan Electric Philippines Corporation. All rights reserved.
            </p>
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">
              <span className="text-[#2845D6]">REP</span>Connect
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
