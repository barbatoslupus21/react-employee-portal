"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import MissionVisionSection from "@/components/MissionVisionSection";
import CompanyCreedSection from "@/components/CompanyCreedSection";
import LoginModal from "@/components/LoginModal";
import PrivacyConsentModal from "@/components/PrivacyConsentModal";
import { ThreePromises } from "@/components/ui/three-promises";
import { Features } from "@/components/blocks/features-6";
import { Footer7 } from "@/components/ui/footer-7";

export default function Home() {
  const [loginOpen, setLoginOpen] = useState(false);

  // Seed the Django CSRF cookie so the login form can include X-CSRFToken.
  useEffect(() => {
    fetch('/api/auth/csrf', { credentials: 'include' }).catch(() => {});
  }, []);

  return (
    <>
      <PrivacyConsentModal />
      <Navbar onLoginClick={() => setLoginOpen(true)} />
      <main>
        <HeroSection onLoginClick={() => setLoginOpen(true)} />
        <Features />
        <MissionVisionSection />
        <section id="three-promises" className="relative py-24 sm:py-32 px-4 overflow-hidden">
          <div className="mx-auto max-w-6xl">
            <div className="mb-16 sm:mb-30 text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-1.5">
                <span className="text-xs font-medium text-[var(--color-text-muted)] text-filled">
                  Our Commitments
                </span>
              </div>
              <h2 className="text-3xl font-bold tracking-wide text-balance md:text-4xl lg:text-5xl xl:font-extrabold text-filled">Our Three Promises</h2>
              <p className="mt-4 text-sm md:text-base text-[var(--color-text-secondary)] text-filled max-w-xl mx-auto">
                Every partnership, every project, every day — guided by our commitment to speed, people, and technology.
              </p>
            </div>
            <ThreePromises />
          </div>
        </section>
        <CompanyCreedSection />
      </main>
      <Footer7 />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
