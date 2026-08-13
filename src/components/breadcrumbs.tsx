"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const pathLabels: Record<string, string> = {
  "/": "Dashboard",
  "/x": "X",
  "/x-content": "Tweets",
  "/x-analytics": "X Analytics",
  "/watchlist-radar": "Trend Radar",
  "/youtube": "YouTube",
  "/longform": "Longform",
  "/articles": "Articles",
  "/client-pulse": "Client Pulse",
  "/floor": "Floor",
  "/agents": "Agents",
  "/ideas": "Ideas",
  "/garden": "Garden",
  "/tasks": "Tasks",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  
  // Don't show breadcrumbs on dashboard
  if (pathname === "/") return null;
  
  const currentLabel = pathLabels[pathname] || "Page";
  
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--text-3)] mb-6">
      <Link 
        href="/" 
        className="hover:text-neutral-300 transition-colors"
      >
        Dashboard
      </Link>
      <span>/</span>
      <span className="text-neutral-400">{currentLabel}</span>
    </div>
  );
}
