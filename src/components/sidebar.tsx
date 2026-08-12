"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Activity,
  ChartNoAxesCombined,
  Home,
  Twitter,
  Play,
  Bot,
  Network,
  Lightbulb,
  Flower2,
  FileText,
  ClipboardList,
  HeartPulse,
  Cpu,
  BookOpen,
  Workflow,
  Menu,
  X,
} from "lucide-react";

const navGroups = [
  {
    name: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: Home },
      { href: "/hermes", label: "Hermes", icon: Cpu },
      { href: "/tasks", label: "Tasks", icon: ClipboardList },
    ],
  },
  {
    name: "Content",
    items: [
      { href: "/x", label: "X", icon: Twitter },
      { href: "/content-os", label: "Pipeline", icon: Workflow },
      { href: "/articles", label: "Articles", icon: FileText },
      { href: "/youtube", label: "YouTube", icon: Play },
    ],
  },
  {
    name: "Data",
    items: [
      { href: "/client-pulse", label: "Client Pulse", icon: HeartPulse },
    ],
  },
  {
    name: "System",
    items: [
      { href: "/floor", label: "Floor", icon: Network },
      { href: "/observability", label: "Observability", icon: Activity },
      { href: "/oversight", label: "Oversight", icon: ChartNoAxesCombined },
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/memory-wiki", label: "Memory Wiki", icon: BookOpen },
      { href: "/ideas", label: "Ideas", icon: Lightbulb },
      { href: "/garden", label: "Garden", icon: Flower2 },
    ],
  },
];

// Mobile tab bar - only show the 5 most important
const mobileTabsRaw = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/x", label: "X", icon: Twitter },
  { href: "/youtube", label: "YouTube", icon: Play },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/agents", label: "Agents", icon: Bot },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsOpen(false));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  // Close sidebar when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setIsOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const Logo = () => (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-[10px] bg-[var(--text)] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
        <span className="text-[#0a0b0d] font-bold text-[13px] tracking-tight">H</span>
      </div>
      <span className="font-semibold text-[var(--text)] tracking-[-0.01em] text-[15px]">Hermy HQ</span>
    </div>
  );

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[var(--bg)]/90 backdrop-blur-xl border-b border-[var(--line)] px-4 py-3 flex items-center justify-between">
        <Logo />
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-[var(--text-2)] hover:text-[var(--text)] transition-colors rounded-lg hover:bg-[var(--surface-1)]"
          aria-label="Toggle menu"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg)]/90 backdrop-blur-xl border-t border-[var(--line)] px-2 py-2 safe-area-pb">
        <nav className="flex justify-around">
          {mobileTabsRaw.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 p-2 px-3 rounded-lg transition-all ${
                  isActive
                    ? "text-[var(--text)] bg-[var(--surface-2)]"
                    : "text-[var(--text-3)] hover:text-[var(--text-2)] active:scale-95"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Desktop Sidebar */}
      <aside
        className={`
          fixed md:relative z-50 md:z-10
          w-64 md:w-[15rem] h-full
          bg-[var(--bg)] md:bg-transparent border-r border-[var(--line)]
          flex flex-col
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          top-0 left-0
        `}
      >
        {/* Logo */}
        <div className="hidden md:block px-5 pt-6 pb-8">
          <Logo />
        </div>

        {/* Spacer for mobile header */}
        <div className="h-16 md:hidden" />

        {/* Nav */}
        <nav className="flex-1 px-3 overflow-y-auto">
          <div className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.name}>
                <h3 className="eyebrow px-3 mb-1.5 !text-[10px] !text-[var(--text-4)]">
                  {group.name}
                </h3>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive =
                      pathname === item.href || pathname.startsWith(item.href + "/");
                    const Icon = item.icon;
                    return (
                      <div key={item.href}>
                        <Link
                          href={item.href}
                          className={`group relative flex items-center gap-3 px-3 py-[7px] rounded-[10px] transition-all duration-150 ${
                            isActive
                              ? "bg-[var(--surface-2)] text-[var(--text)]"
                              : "text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-1)]"
                          }`}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-[var(--accent)]" />
                          )}
                          <Icon
                            className={`w-[17px] h-[17px] shrink-0 ${
                              isActive ? "text-[var(--text)]" : "text-[var(--text-3)] group-hover:text-[var(--text-2)]"
                            }`}
                          />
                          <span className="text-[13.5px] font-medium">{item.label}</span>
                        </Link>
                        {"anchors" in group &&
                          isActive &&
                          (group as { anchors?: { href: string; label: string }[] }).anchors && (
                            <div className="ml-[26px] mt-0.5 space-y-0.5 border-l border-[var(--line)] pl-3">
                              {(group as { anchors: { href: string; label: string }[] }).anchors.map(
                                (a) => (
                                  <a
                                    key={a.href}
                                    href={a.href}
                                    className="block text-[12px] text-[var(--text-3)] hover:text-[var(--text-2)] py-1 transition-colors"
                                  >
                                    {a.label}
                                  </a>
                                )
                              )}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-[var(--line)]">
          <div className="flex items-center gap-2 text-[var(--text-3)] text-[11.5px]">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--up)] opacity-60 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-[var(--up)]" />
            </span>
            <span>All systems online</span>
          </div>
        </div>
      </aside>
    </>
  );
}
