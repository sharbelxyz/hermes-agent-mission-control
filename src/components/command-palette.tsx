"use client";

/* ───────────────────────────────────────────────────────────
   Hermy HQ · Command Palette (⌘K / Ctrl-K)
   Globally mounted. Fuzzy nav + dispatch-to-Hermes fallback.
   Calm Luxury tokens, no external deps beyond lucide-react.
   ─────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Twitter,
  FileText,
  Youtube,
  Activity,
  Bot,
  Network,
  Lightbulb,
  Sprout,
  ListChecks,
  Sparkles,
  CornerDownLeft,
  Search,
  Check,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "X", href: "/x", icon: Twitter },
  { label: "Articles", href: "/articles", icon: FileText },
  { label: "YouTube", href: "/youtube", icon: Youtube },
  { label: "Client Pulse", href: "/client-pulse", icon: Activity },
  { label: "Floor", href: "/floor", icon: Network },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Ideas", href: "/ideas", icon: Lightbulb },
  { label: "Garden", href: "/garden", icon: Sprout },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Hermes", href: "/hermes", icon: Sparkles },
];

type Row =
  | { kind: "nav"; item: NavItem }
  | { kind: "dispatch"; query: string };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [dispatched, setDispatched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── global open/close hotkey ──────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── reset + focus when opening ────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setDispatched(false);
      // focus after paint so the trap works reliably
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // ── lock scroll while open ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ── fuzzy (case-insensitive substring) nav filter ─────────
  const navMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV;
    return NAV.filter(
      (n) => n.label.toLowerCase().includes(q) || n.href.toLowerCase().includes(q),
    );
  }, [query]);

  // Build the flat row list. Dispatch shows as the last option whenever
  // there's a query, or as the sole option when nothing matches nav.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = navMatches.map((item) => ({ kind: "nav", item }));
    if (query.trim()) out.push({ kind: "dispatch", query: query.trim() });
    return out;
  }, [navMatches, query]);

  // keep highlight in range as rows shrink/grow
  useEffect(() => {
    setActive((a) => (rows.length === 0 ? 0 : Math.min(a, rows.length - 1)));
  }, [rows.length]);

  const close = useCallback(() => setOpen(false), []);

  const runDispatch = useCallback(async (q: string) => {
    // Route anything that acts on the outside world to the Approval Inbox
    // instead of running it immediately.
    const sideEffecting = /\b(post|tweet|send|dm|message|reply|email|buy|purchase|order|pay|transfer|withdraw|deposit|trade|delete|remove|publish|schedule|book|cancel|unsubscribe)\b/i.test(q);
    try {
      await fetch("/api/hermes/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "oneshot", title: q, prompt: q, sideEffecting }),
      });
    } catch {
      /* non-blocking — dispatch is best-effort */
    }
  }, []);

  const run = useCallback(
    async (row: Row | undefined) => {
      if (!row) return;
      if (row.kind === "nav") {
        close();
        router.push(row.item.href);
        return;
      }
      // dispatch: confirm briefly, then jump to the Hermes page so you can
      // watch it run in the Dispatches panel.
      setDispatched(true);
      await runDispatch(row.query);
      setTimeout(() => { setOpen(false); router.push("/hermes"); }, 650);
    },
    [close, router, runDispatch],
  );

  // ── keyboard nav within the palette ───────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (rows.length ? (a + 1) % rows.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (rows.length ? (a - 1 + rows.length) % rows.length : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      run(rows[active]);
    }
  };

  // scroll the active row into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  const navRows = rows.filter((r) => r.kind === "nav") as Extract<Row, { kind: "nav" }>[];
  const dispatchRow = rows.find((r) => r.kind === "dispatch") as
    | Extract<Row, { kind: "dispatch" }>
    | undefined;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start justify-center px-4 pt-[18vh] motion-safe:animate-[hq-rise_0.18s_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="elevated w-full max-w-[560px] overflow-hidden"
        style={{ borderRadius: "var(--r-md)" }}
        onKeyDown={onKeyDown}
      >
        {/* input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--line)]">
          <Search className="w-4 h-4 text-[var(--text-3)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search, or ask Hermes…"
            spellCheck={false}
            autoComplete="off"
            className="num flex-1 bg-transparent border-0 outline-none text-[15px] text-[var(--text)] placeholder-[var(--text-3)]"
          />
        </div>

        {/* results */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {navRows.length > 0 && (
            <div className="px-2 pb-1">
              <div className="eyebrow px-3 py-1.5">Navigate</div>
              {navRows.map((r) => {
                const idx = rows.indexOf(r);
                return (
                  <PaletteRow
                    key={r.item.href}
                    idx={idx}
                    active={active === idx}
                    onHover={() => setActive(idx)}
                    onSelect={() => run(r)}
                    icon={<r.item.icon className="w-4 h-4" />}
                  >
                    <span className="text-[var(--text)]">{r.item.label}</span>
                    <span className="num ml-auto text-[11px] text-[var(--text-4)]">
                      {r.item.href}
                    </span>
                  </PaletteRow>
                );
              })}
            </div>
          )}

          {dispatchRow && (
            <div className="px-2 pt-1">
              <div className="eyebrow px-3 py-1.5">Dispatch to Hermes</div>
              {(() => {
                const idx = rows.indexOf(dispatchRow);
                return (
                  <PaletteRow
                    idx={idx}
                    active={active === idx}
                    onHover={() => setActive(idx)}
                    onSelect={() => run(dispatchRow)}
                    icon={
                      dispatched ? (
                        <Check className="w-4 h-4" style={{ color: "var(--up)" }} />
                      ) : (
                        <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
                      )
                    }
                  >
                    {dispatched ? (
                      <span style={{ color: "var(--up)" }}>Dispatched ✓</span>
                    ) : (
                      <span className="text-[var(--text)] truncate">
                        Ask Hermes:{" "}
                        <span className="text-[var(--text-2)]">
                          &ldquo;{dispatchRow.query}&rdquo;
                        </span>
                      </span>
                    )}
                  </PaletteRow>
                );
              })()}
            </div>
          )}

          {rows.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px] text-[var(--text-3)]">
              No matches.
            </div>
          )}
        </div>

        {/* hint bar */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[var(--line)] text-[11px] num text-[var(--text-3)]">
          <span className="inline-flex items-center gap-1.5">
            <CornerDownLeft className="w-3 h-3" /> to run
          </span>
          <span aria-hidden>·</span>
          <span>esc to close</span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <kbd className="rounded px-1.5 py-0.5 bg-[var(--surface-1)] border border-[var(--line)]">
              ↑↓
            </kbd>
            to move
          </span>
        </div>
      </div>
    </div>
  );
}

function PaletteRow({
  idx,
  active,
  onHover,
  onSelect,
  icon,
  children,
}: {
  idx: number;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-idx={idx}
      onMouseMove={onHover}
      onClick={onSelect}
      className="relative flex w-full items-center gap-3 rounded-[var(--r-sm)] px-3 py-2 text-left text-[13.5px] transition-colors"
      style={active ? { background: "var(--surface-1)" } : undefined}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2.5px] rounded-full"
          style={{ background: "var(--accent)" }}
        />
      )}
      <span className="text-[var(--text-3)] shrink-0">{icon}</span>
      <span className="flex flex-1 items-center gap-2 min-w-0">{children}</span>
    </button>
  );
}
