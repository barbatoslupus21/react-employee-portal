"use client";

import React, { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";

const menuItems = [
  { name: "Home", href: "#hero" },
  { name: "Mission & Vision", href: "#mission-vision" },
  { name: "Creed", href: "#creed" },
  { name: "Contact", href: "#contact" },
];

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
  const [menuState, setMenuState] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (href: string) => {
    setMenuState(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header>
      <nav
        data-state={menuState ? "active" : undefined}
        className="fixed z-50 w-full px-2 group"
      >
        <div
          className={cn(
            "mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12",
            isScrolled &&
              "bg-[var(--color-navbar-bg)] max-w-4xl rounded-2xl backdrop-blur-xl shadow-md shadow-black/10 lg:px-5"
          )}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
            {/* Left: Logo */}
            <div className="flex w-full justify-between lg:w-auto">
              <a
                href="#hero"
                aria-label="home"
                onClick={(e) => { e.preventDefault(); handleNavClick("#hero"); }}
                className="flex items-center"
              >
                <REPConnectLogo />
              </a>

              {/* Mobile hamburger */}
              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState ? "Close Menu" : "Open Menu"}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden text-[var(--color-text-primary)]"
              >
                <Menu
                  className={cn(
                    "m-auto size-6 duration-200 transition-all",
                    menuState && "scale-0 opacity-0 rotate-180"
                  )}
                />
                <X
                  className={cn(
                    "absolute inset-0 m-auto size-6 duration-200 transition-all -rotate-180 scale-0 opacity-0",
                    menuState && "rotate-0 scale-100 opacity-100"
                  )}
                />
              </button>
            </div>

            {/* Center: Desktop nav links */}
            <div className="absolute inset-0 m-auto hidden size-fit lg:block">
              <ul className="flex gap-8 text-sm">
                {menuItems.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={(e) => { e.preventDefault(); handleNavClick(item.href); }}
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]
                        block duration-150 transition-colors text-filled"
                    >
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: Theme toggle + CTA */}
            <div
              className={cn(
                "bg-[var(--color-bg-elevated)] group-data-[state=active]:block lg:group-data-[state=active]:flex",
                "mb-6 hidden w-full flex-wrap items-center justify-end space-y-8",
                "rounded-3xl border border-[var(--color-border)] p-6 shadow-2xl shadow-zinc-300/20",
                "md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-4 lg:space-y-0",
                "lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none"
              )}
            >
              {/* Mobile-only nav links */}
              <div className="lg:hidden w-full">
                <ul className="space-y-4 text-base">
                  {menuItems.map((item) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        onClick={(e) => { e.preventDefault(); handleNavClick(item.href); }}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]
                          block duration-150 transition-colors text-filled"
                      >
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex w-full items-center gap-3 sm:flex-row md:w-fit">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("rounded-xl text-filled", isScrolled && "lg:hidden")}
                  onClick={onLoginClick}
                >
                  Login
                </Button>
                <Button
                  size="sm"
                  className={cn("rounded-xl", isScrolled ? "lg:inline-flex" : "hidden")}
                  onClick={onLoginClick}
                >
                  Get Started
                </Button>
                <ThemeSwitch />
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
