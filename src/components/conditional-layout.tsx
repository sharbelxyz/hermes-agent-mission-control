'use client';

import { Sidebar } from '@/components/sidebar';
import { CommandPalette } from '@/components/command-palette';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      {/* One app-level ambient at the root — outside the scrolling/transformed
          main, so it's truly viewport-fixed and never scrolls away. */}
      <div className="hq-ambient" aria-hidden />
      <Sidebar />
      <main className="relative flex-1 overflow-auto pt-16 md:pt-0 pb-20 md:pb-0 px-4 sm:px-6 md:px-10 lg:px-12 py-4 md:py-8 page-enter">
        <div className="pb-safe">
          {children}
        </div>
      </main>
      <CommandPalette />
    </div>
  );
}
