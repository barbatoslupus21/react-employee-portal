import React from "react";
import { FaFacebook, FaInstagram, FaLinkedin, FaTwitter } from "react-icons/fa";

interface Footer7Props {
  logo?: {
    url: string;
    title: string;
  };
  sections?: Array<{
    title: string;
    links: Array<{ name: string; href: string }>;
  }>;
  description?: string;
  socialLinks?: Array<{
    icon: React.ReactElement;
    href: string;
    label: string;
  }>;
  copyright?: string;
  legalLinks?: Array<{
    name: string;
    href: string;
  }>;
}

const defaultSections = [
  {
    title: "Portal",
    links: [
      { name: "Home", href: "#" },
      { name: "Mission & Vision", href: "#mission-vision" },
      { name: "Company Creed", href: "#creed" },
      { name: "Contact", href: "#contact" },
    ],
  },
  {
    title: "Company",
    links: [
      { name: "About REP", href: "#" },
      { name: "Meet the Team", href: "#" },
      { name: "Careers", href: "#" },
      { name: "Employee Handbook", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { name: "IT Support", href: "#" },
      { name: "HR FAQs", href: "#" },
      { name: "Privacy Policy", href: "#" },
      { name: "Terms of Use", href: "#" },
    ],
  },
];

const defaultSocialLinks = [
  { icon: <FaInstagram className="size-5" />, href: "#", label: "Instagram" },
  { icon: <FaFacebook className="size-5" />, href: "#", label: "Facebook" },
  { icon: <FaTwitter className="size-5" />, href: "#", label: "Twitter" },
  { icon: <FaLinkedin className="size-5" />, href: "#", label: "LinkedIn" },
];

const defaultLegalLinks = [
  { name: "Terms and Conditions", href: "#" },
  { name: "Privacy Policy", href: "#" },
];

export const Footer7 = ({
  logo = {
    url: "#",
    title: "REPConnect",
  },
  sections = defaultSections,
  description = "The unified employee portal of Ryonan Electric Philippines — streamlining HR, payroll, leave, and training in one platform.",
  socialLinks = defaultSocialLinks,
  copyright = `© ${new Date().getFullYear()} Ryonan Electric Philippines Corporation. All rights reserved.`,
  legalLinks = defaultLegalLinks,
}: Footer7Props) => {
  return (
    <section className="py-16 md:py-24 border-t border-[var(--color-border)]">
      <div className="container mx-auto px-6">
        <div className="flex w-full flex-col justify-between gap-10 lg:flex-row lg:items-start lg:text-left">
          {/* Brand + description + socials */}
          <div className="flex w-full flex-col justify-between gap-6 lg:max-w-xs lg:items-start">
            <div className="flex items-center gap-1 lg:justify-start">
              <a href={logo.url} className="flex items-center gap-1">
                <span className="text-[#2845D6] text-xl font-extrabold tracking-tight">REP</span>
                <span className="text-[var(--color-text-primary)] text-xl font-bold tracking-tight">Connect</span>
              </a>
            </div>
            <p className="max-w-[70%] text-sm text-[var(--color-text-secondary)]">
              {description}
            </p>
            <ul className="flex items-center space-x-5 text-[var(--color-text-muted)]">
              {socialLinks.map((social, idx) => (
                <li key={idx} className="font-medium hover:text-[#2845D6] transition-colors">
                  <a href={social.href} aria-label={social.label}>
                    {social.icon}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Link sections */}
          <div className="grid w-full gap-6 md:grid-cols-3 lg:gap-16">
            {sections.map((section, sectionIdx) => (
              <div key={sectionIdx}>
                <h3 className="mb-4 text-sm font-bold text-[var(--color-text-primary)]">
                  {section.title}
                </h3>
                <ul className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                  {section.links.map((link, linkIdx) => (
                    <li key={linkIdx} className="font-medium hover:text-[#2845D6] transition-colors">
                      <a href={link.href}>{link.name}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col justify-between gap-4 border-t border-[var(--color-border)] py-8 text-xs font-medium text-[var(--color-text-muted)] md:flex-row md:items-center md:text-left">
          <p className="order-2 lg:order-1">{copyright}</p>
          <ul className="order-1 flex flex-col gap-2 md:order-2 md:flex-row">
            {legalLinks.map((link, idx) => (
              <li key={idx} className="hover:text-[#2845D6] transition-colors">
                <a href={link.href}>{link.name}</a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
