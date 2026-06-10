"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";

const menuItems: { name: string; href: string }[] = [];

const REPConnectLogo = () => (
  <span className="text-lg font-black tracking-tight">
    <span className="text-[#2845D6]">REP</span>
    <span className="text-filled text-[var(--color-text-primary)]">Connect</span>
  </span>
);

interface NavbarProps {
  onLoginClick: () => void;
}

export default function Navbar({ onLoginClick }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full">
      <nav className="w-full px-2">
        <div
          className={cn(
            "mx-auto mt-2 max-w-6xl rounded-2xl bg-transparent px-4 transition-all duration-300 sm:px-6 lg:px-12",
            isScrolled && "backdrop-blur-xl shadow-md shadow-black/10"
          )}
        >
          <div className="flex items-center justify-between gap-4 py-3 sm:gap-6 lg:py-4">
            <a
              href="#hero"
              aria-label="home"
              onClick={(e) => {
                e.preventDefault();
                const el = document.querySelector("#hero");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              className="flex items-center"
            >
              <REPConnectLogo />
            </a>

            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl px-3 text-[11px] sm:px-4 sm:text-xs md:text-sm text-filled"
                onClick={onLoginClick}
              >
                Login
              </Button>
              <ThemeSwitch />
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
