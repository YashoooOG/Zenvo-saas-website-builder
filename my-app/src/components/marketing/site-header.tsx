"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeSelect } from "@/components/theme-select";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  return (
    <header className="site-header" onKeyDown={event => {
      if (event.key === "Escape" && open) { setOpen(false); menuButton.current?.focus(); }
    }}>
      <div className="site-width header-inner">
        <Brand />
        <nav className="desktop-navigation" aria-label="Main navigation">
          <a href="#platform">Platform</a><a href="#workflow">How it works</a><a href="#questions">Questions</a>
        </nav>
        <div className="header-actions"><ThemeSelect /><Link className="sign-in-link" href="/sign-in">Sign in</Link><Link href="/sign-up" className="action action-small header-cta">Get started</Link>
          <button ref={menuButton} type="button" className="mobile-menu-button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>{open ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}</button>
        </div>
      </div>
      {open && <nav id="mobile-navigation" className="mobile-navigation" aria-label="Mobile navigation" onClick={() => setOpen(false)}>
        <a href="#platform">Platform</a><a href="#workflow">How it works</a><a href="#questions">Questions</a><Link href="/sign-in">Sign in</Link><Link href="/sign-up">Create an account</Link>
      </nav>}
    </header>
  );
}
