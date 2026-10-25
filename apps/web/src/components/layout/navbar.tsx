"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthMenu } from "@/components/layout/auth-menu";

const links = [
  { href: "/explore", label: "Explore" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ink-950/85 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded focus:bg-pitch-500 focus:px-3 focus:py-1 focus:text-ink-950">Skip to content</a>
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-display text-2xl font-extrabold tracking-tight">Pitch<span className="text-pitch-400">side</span></Link>
        <ul className="hidden items-center gap-8 text-sm md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}
                className={cn("transition-colors hover:text-chalk", path.startsWith(l.href) ? "text-chalk" : "text-mute")}>{l.label}</Link>
            </li>
          ))}
        </ul>
        <div className="hidden md:block"><AuthMenu /></div>
        <button className="rounded-full p-2 md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}>
          {open ? <X /> : <Menu />}
        </button>
      </nav>
      {open && (
        <div id="mobile-menu" className="border-t border-line bg-ink-950 px-4 pb-5 pt-2 md:hidden">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}><Link href={l.href} className="block border-b border-line py-3 text-chalk">{l.label}</Link></li>
            ))}
            <li><AuthMenu stacked /></li>
          </ul>
        </div>
      )}
    </header>
  );
}
