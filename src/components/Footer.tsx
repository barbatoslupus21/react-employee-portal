"use client";
import React from "react";
import { Mail, Phone, MapPin, Facebook, Linkedin, Twitter, Globe, Youtube } from "lucide-react";
import { FooterBackgroundGradient, TextHoverEffect } from "@/components/ui/hover-footer";

function Footer() {
  const footerLinks = [
    {
      title: "About Us",
      links: [
        { label: "Company History", href: "#" },
        { label: "Meet the Team", href: "#" },
        { label: "Employee Handbook", href: "#" },
        { label: "Careers", href: "#" },
      ],
    },
    {
      title: "Helpful Links",
      links: [
        { label: "FAQs", href: "#" },
        { label: "IT Support", href: "#" },
        { label: "Live Chat", href: "#", pulse: true },
      ],
    },
  ];

  const contactInfo = [
    {
      icon: <Mail size={18} className="text-[#2845D6]" />,
      text: "hr@ryonanelectric.com.ph",
      href: "mailto:hr@ryonanelectric.com.ph",
    },
    {
      icon: <Phone size={18} className="text-[#2845D6]" />,
      text: "+63 (45) 888-0000",
      href: "tel:+6345888000",
    },
    {
      icon: <MapPin size={18} className="text-[#2845D6]" />,
      text: "Angeles City, Pampanga, Philippines",
    },
  ];

  const socialLinks = [
    { icon: <Facebook size={20} />, label: "Facebook", href: "#" },
    { icon: <Linkedin size={20} />, label: "LinkedIn", href: "#" },
    { icon: <Twitter size={20} />, label: "Twitter", href: "#" },
    { icon: <Youtube size={20} />, label: "YouTube", href: "#" },
    { icon: <Globe size={20} />, label: "Website", href: "#" },
  ];

  return (
    <footer className="bg-[var(--color-bg-card)]/10 relative h-fit rounded-3xl overflow-hidden m-4 sm:m-8 border border-[var(--color-border)]">
      <div className="max-w-7xl mx-auto p-8 sm:p-14 z-40 relative">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 md:gap-8 lg:gap-16 pb-12">
          {/* Brand section */}
          <div className="flex flex-col space-y-4">
            <div className="flex items-center space-x-1">
              <span className="text-lg font-black tracking-tight">
                    <span className="text-[#2845D6]">REP</span>
                    <span className="text-filled text-[var(--color-text-primary)]">sdcsd</span>
                </span>
            </div>
            <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
              The unified employee portal of Ryonan Electric Philippines —
              streamlining HR, payroll, leave, and training in one place.
            </p>
          </div>

          {/* Footer link sections */}
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h4 className="text-[var(--color-text-primary)] text-base font-semibold mb-5">
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label} className="relative">
                    <a
                      href={link.href}
                      className="text-sm text-[var(--color-text-secondary)] hover:text-[#2845D6] transition-colors"
                    >
                      {link.label}
                    </a>
                    {link.pulse && (
                      <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#2845D6] animate-pulse" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact section */}
          <div>
            <h4 className="text-[var(--color-text-primary)] text-base font-semibold mb-5">
              Contact Us
            </h4>
            <ul className="space-y-4">
              {contactInfo.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">{item.icon}</span>
                  {item.href ? (
                    <a
                      href={item.href}
                      className="text-sm text-[var(--color-text-secondary)] hover:text-[#2845D6] transition-colors"
                    >
                      {item.text}
                    </a>
                  ) : (
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      {item.text}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <hr className="border-t border-[var(--color-border)] my-6" />

        {/* Footer bottom */}
        <div className="flex flex-col md:flex-row justify-between items-center text-sm gap-4">
          {/* Social icons */}
          <div className="flex gap-5 text-[var(--color-text-muted)]">
            {socialLinks.map(({ icon, label, href }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="hover:text-[#2845D6] transition-colors"
              >
                {icon}
              </a>
            ))}
          </div>

          {/* Copyright */}
          <p className="text-[var(--color-text-muted)] text-center">
            &copy; {new Date().getFullYear()} Ryonan Electric Philippines Corporation. All rights reserved.
          </p>
        </div>
      </div>

      {/* Big text hover effect */}
      <div className="lg:flex hidden h-[28rem] -mt-48 -mb-32">
        <TextHoverEffect text="REPConnect" className="z-50" />
      </div>

      <FooterBackgroundGradient />
    </footer>
  );
}

export default Footer;
