"use client";

import { useEffect, useState, useCallback, useRef, memo } from "react";
import { EmptyState } from "@/components/ui/kit";

// ── shared calm-luxury chip styling ─────────────────────────────────────────
const CHIP = "text-[11px] px-2.5 py-1 rounded-[var(--r-sm)] font-medium transition-colors inline-flex items-center gap-1";
const GHOST_CHIP = `${CHIP} text-[var(--text-2)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--line)]`;
function toneStyle(c: string): React.CSSProperties {
  return { color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 22%, transparent)` };
}

// ── Trend Radar types ──────────────────────────────────────────────────────
interface Trend {
  id: string; topic: string; summary: string;
  source: "x_search" | "rss" | "breaking";
  velocity: "forming" | "rising" | "peaking" | "fading";
  velocityScore: number; ageMinutes: number;
  relevance: "crypto" | "ai" | "creator" | "other";
  url: string | null; sageAngle: string | null; detectedAt: string;
}
interface TrendsData { trends: Trend[]; lastUpdated: string; nextUpdate: string; }

const VELOCITY_META: Record<string, { color: string; badge: string }> = {
  forming: { color: "var(--up)",     badge: "Forming" },
  rising:  { color: "var(--warn)",   badge: "Rising" },
  peaking: { color: "var(--down)",   badge: "Peaking" },
  fading:  { color: "var(--text-3)", badge: "Fading" },
};
const RELEVANCE_LABELS: Record<string, string> = { crypto: "Crypto", ai: "AI", creator: "Creator", other: "Other" };
const SOURCE_LABELS: Record<string, string> = { x_search: "X", rss: "RSS", breaking: "Breaking" };

function formatTimeAgo(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function TrendRadarSection() {
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "crypto" | "ai" | "creator">("all");
  const [snipedId, setSnipedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trends", { cache: "no-store" });
      if (res.ok) setTrendsData(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const handleSnipe = useCallback(async (trend: Trend) => {
    setSnipedId(trend.id);
    try {
      await fetch("/api/trends/snipe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": "296cfa48ad6963eb21ac9deb4981ad0c982cff51631bda9cf43fd0fa7217088b" },
        body: JSON.stringify({ trendId: trend.id, topic: trend.topic, sageAngle: trend.sageAngle, url: trend.url }),
      });
    } finally { setTimeout(() => setSnipedId(null), 2000); }
  }, []);

  const filtered = (trendsData?.trends ?? []).filter(t => filter === "all" || t.relevance === filter);

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => <div key={i} className="sk h-52 rounded-[var(--r-lg)]" />)}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[12px] text-[var(--text-3)]">
          {trendsData?.lastUpdated ? `Updated ${formatTimeAgo(Math.floor((Date.now() - new Date(trendsData.lastUpdated).getTime()) / 60000))}` : "No data yet"}
          {" · "}
          <span className="num text-[var(--text-2)]">{filtered.length} signal{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <button onClick={load} className="btn-ghost px-3 py-1.5 text-[12px] font-medium">Refresh</button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "ai", "crypto", "creator"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`${CHIP} ${filter === f
              ? "text-[var(--text)] bg-[var(--surface-3)] border border-[var(--line-strong)]"
              : "text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-2)] border border-transparent"}`}>
            {f === "all" ? "All" : f === "ai" ? "AI" : f === "crypto" ? "Crypto" : "Creator"}
          </button>
        ))}
      </div>

      {/* Trend cards */}
      {filtered.length === 0 ? (
        <EmptyState title="No fresh signals right now" hint="Radar updates every 15 min." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(trend => {
            const meta = VELOCITY_META[trend.velocity] ?? VELOCITY_META["forming"];
            return (
              <div key={trend.id} className="panel panel-interactive overflow-hidden"
                style={{ borderLeft: `2px solid ${meta.color}` }}>
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-[var(--text)] leading-snug flex-1">{trend.topic}</h3>
                    <span className={`${CHIP} whitespace-nowrap shrink-0`} style={toneStyle(meta.color)}>{meta.badge}</span>
                  </div>
                  <p className="text-[12px] text-[var(--text-2)] leading-relaxed">{trend.summary}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-3)]">
                    <span className="num text-[var(--text-2)] font-semibold">{trend.velocityScore}<span className="text-[var(--text-3)] font-normal"> score</span></span>
                    <span className="num">{formatTimeAgo(trend.ageMinutes)}</span>
                    <span>{RELEVANCE_LABELS[trend.relevance]}</span>
                    <span className="ml-auto text-[var(--text-4)]">{SOURCE_LABELS[trend.source]}</span>
                  </div>
                  {trend.sageAngle && (
                    <div className="rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-2.5 space-y-1">
                      <div className="eyebrow" style={{ color: "var(--up)" }}>Draft angle</div>
                      <div className="text-[11px] text-[var(--text-2)] italic">{trend.sageAngle}</div>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    {trend.url && (
                      <a href={trend.url} target="_blank" rel="noopener noreferrer"
                        className="btn-ghost flex-1 justify-center py-2 text-[12px] font-medium text-center">
                        View Tweet
                      </a>
                    )}
                    <button onClick={() => handleSnipe(trend)}
                      className={`${CHIP} flex-1 justify-center py-2 text-[12px] font-semibold`}
                      style={toneStyle(snipedId === trend.id ? "var(--up)" : "var(--accent)")}>
                      {snipedId === trend.id ? "Sniped" : "Snipe"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export async function fetchDrafts() {
  const res = await fetch("/api/x-content", { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}`);
  return await res.json();
}

const TIME_SLOTS = [
  { label: "Morning (9:00)", value: "09:00" },
  { label: "Midday (12:00)", value: "12:00" },
  { label: "Afternoon (15:00)", value: "15:00" },
  { label: "Evening (18:00)", value: "18:00" },
  { label: "Night (21:00)", value: "21:00" }
];

const REJECT_REASONS = [
  "Too AI", "Too Vague", "No Value",
  "Inaccurate", "Not My Voice", "Boring"
];

interface WeekDay {
  date: string; label: string; dayName: string; isToday: boolean; isPast: boolean;
}

interface Draft {
  id: string;
  text: string;
  title?: string;
  model: string;
  type?: "tweet" | "article" | "idea" | "content idea" | "industry idea";
  status: "pending" | "approved" | "rejected" | "posted" | "scheduled";
  feedback: { rating: string | null; reason: string };
  viralScore: number | null;
  hookType?: string;
  category?: string;
  scheduledDate: string | null;
  scheduledTime?: string | null;
  createdAt: string;
  postedAt?: string;
  quoteUrl?: string;
  quoteText?: string;
  postedUrl?: string;
  postedText?: string;
  visualUrl?: string;
  metrics?: {
    views?: number; likes?: number; retweets?: number;
    replies?: number; bookmarks?: number; updatedAt?: string;
  };
  tweakRequested?: { comment: string; requestedAt: string; status: "pending" | "processing" | "done"; };
  editHistory?: { original: string; edited: string; editedAt: string }[];
  variantGroup?: string;
  impressionScore?: number;
}

interface DraftCardProps {
  draft: Draft;
  isEditing: boolean;
  isTweaking: boolean;
  tweakComment: string;
  isShowingRejectPicker: boolean;
  isShowingSchedulePicker: boolean;
  isShowingPostedUrl: boolean;
  postedUrlValue: string;
  weekDays: WeekDay[];
  onSetEditing: (id: string | null) => void;
  onSetTweaking: (id: string | null) => void;
  onSetTweakComment: (v: string) => void;
  onSetRejectPicker: (id: string | null) => void;
  onSetSchedulePicker: (id: string | null) => void;
  onSetPostedUrlDraft: (id: string | null) => void;
  onSetPostedUrlValue: (v: string) => void;
  onEditSubmit: (id: string, text: string) => void;
  onTweak: (id: string, comment: string) => void;
  onFeedback: (id: string, rating: string, reason?: string) => void;
  onSchedule: (id: string, date: string | null) => void;
  onMarkPosted: (id: string, url?: string) => void;
  onAttachVisual: (id: string) => void;
  onGenerateVisual: (id: string) => void;
  onRemoveVisual: (id: string) => void;
  onLightbox: (url: string | null) => void;
  onLoadDrafts: () => void;
}

function getWeekDays(): WeekDay[] {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days: WeekDay[] = [];
  for (let i = -2; i <= 4; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: dateStr, label: `${d.getDate()}/${d.getMonth() + 1}`, dayName: dayNames[d.getDay()], isToday: dateStr === todayStr, isPast: i < 0 });
  }
  return days;
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, string> = {
    pending: "var(--warn)",
    approved: "var(--up)",
    rejected: "var(--down)",
    posted: "var(--accent)",
    scheduled: "var(--accent)",
  };
  return <span className="text-[10px] font-medium px-2.5 py-1 rounded-full" style={toneStyle(tones[status] || tones.pending)}>{status}</span>;
}

// ─── DraftCard (top-level, memo'd) ───────────────────────────────────
const DraftCard = memo(function DraftCard({
  draft, isEditing, isTweaking, tweakComment, isShowingRejectPicker,
  isShowingSchedulePicker, isShowingPostedUrl, postedUrlValue, weekDays,
  onSetEditing, onSetTweaking, onSetTweakComment, onSetRejectPicker,
  onSetSchedulePicker, onSetPostedUrlDraft, onSetPostedUrlValue,
  onEditSubmit, onTweak, onFeedback, onSchedule, onMarkPosted,
  onAttachVisual, onGenerateVisual, onRemoveVisual, onLightbox, onLoadDrafts,
}: DraftCardProps) {
  const editTextRef = useRef<HTMLTextAreaElement>(null);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("text/plain", draft.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const isArticle = draft.type === "article";

  return (
    <div
      id={`draft-${draft.id}`}
      draggable="true"
      onDragStart={handleDragStart}
      className="panel overflow-hidden transition-all"
      style={isArticle ? { borderColor: "color-mix(in srgb, var(--accent) 26%, transparent)" } : undefined}
    >
      {/* Top row: pills + status */}
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <div className="flex items-center gap-1.5">
          {draft.category && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium text-[var(--text-3)] border border-[var(--line)]">
              {draft.category}
            </span>
          )}
          {isArticle && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={toneStyle("var(--accent)")}>article</span>
          )}
          {draft.impressionScore != null && (
            <span className="num text-[10px] text-[var(--text-4)]">~{draft.impressionScore.toLocaleString()} imp</span>
          )}
        </div>
        <StatusBadge status={draft.status} />
      </div>

      {draft.status === "rejected" && draft.feedback?.reason && (
        <div className="mx-5 mt-2 text-[12px] px-3 py-1.5 rounded-[var(--r-sm)]" style={toneStyle("var(--down)")}>{draft.feedback.reason}</div>
      )}

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {/* Text: read-only or editable */}
        {isEditing ? (
          <div className="space-y-1.5">
            <textarea
              ref={editTextRef}
              defaultValue={draft.text}
              className={`w-full bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-[var(--r-md)] p-3 text-[14px] text-[var(--text)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)] ${
                isArticle ? "min-h-[200px]" : "min-h-[100px]"
              }`}
              autoFocus
            />
            <div className="flex gap-1.5">
              <button onClick={() => { if (editTextRef.current) onEditSubmit(draft.id, editTextRef.current.value); }}
                className={CHIP} style={toneStyle("var(--up)")}>Save</button>
              <button onClick={() => onSetEditing(null)} className={GHOST_CHIP}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-[var(--text)]">
            {isArticle && draft.title && <div className="font-semibold text-[var(--accent)] mb-1">{draft.title}</div>}
            {draft.text}
            {isArticle && <div className="num text-[10px] text-[var(--text-4)] mt-1">{draft.text.split(/\s+/).length} words</div>}
          </div>
        )}

        {/* Quote tweet preview — Twitter-style embedded card */}
        {draft.quoteUrl && (() => {
          const match = draft.quoteUrl.match(/x\.com\/([^/]+)\/status\/(\d+)/);
          const handle = match ? `@${match[1]}` : "quoted tweet";
          return (
            <a href={draft.quoteUrl} target="_blank" rel="noreferrer" className="block border border-[var(--line)] rounded-[var(--r-md)] p-3 hover:border-[var(--line-strong)] transition-colors bg-[var(--surface-2)]">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-4 h-4 rounded-full bg-[var(--surface-3)] flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="10" height="10" fill="currentColor" className="text-[var(--text-3)]"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </div>
                <span className="text-[12px] font-semibold text-[var(--text-2)]">{handle}</span>
                <span className="text-[10px] text-[var(--text-3)] ml-auto">Quoted tweet ↗</span>
              </div>
              {draft.quoteText ? (
                <p className="text-[12px] text-[var(--text-2)] leading-relaxed whitespace-pre-wrap line-clamp-5">{draft.quoteText}</p>
              ) : (
                <p className="text-[11px] text-[var(--text-3)] italic">Tweet text not loaded</p>
              )}
              <p className="text-[10px] text-[var(--text-4)] mt-2 truncate">{draft.quoteUrl}</p>
            </a>
          );
        })()}

        {/* Visual */}
        {draft.visualUrl ? (
          <div className="relative group">
            <img src={draft.visualUrl} alt="Visual" className="w-full rounded-[var(--r-md)] cursor-pointer"
              onClick={() => onLightbox(draft.visualUrl || null)} />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-1)]/90 text-[var(--text-2)] hover:text-[var(--text)]"
                onClick={() => { navigator.clipboard.writeText(draft.visualUrl || ""); }}>Copy HD</button>
              <button className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-1)]/90 text-[var(--text-2)] hover:text-[var(--text)]"
                onClick={async () => { await onRemoveVisual(draft.id); await onGenerateVisual(draft.id); }}>Regenerate</button>
              <button className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-1)]/90 text-[var(--down)] hover:brightness-110"
                onClick={() => onRemoveVisual(draft.id)}>Remove</button>
            </div>
          </div>
        ) : null}

        {/* Metrics (posted) */}
        {draft.status === "posted" && draft.metrics && (
          <div className="flex gap-4 num text-[12px] text-[var(--text-3)] border-t border-[var(--line)] pt-3">
            <span>{(draft.metrics.views || 0).toLocaleString()} views</span>
            <span>{(draft.metrics.likes || 0).toLocaleString()} likes</span>
            <span>{(draft.metrics.retweets || 0).toLocaleString()} RT</span>
            <span>{(draft.metrics.replies || 0).toLocaleString()} rep</span>
            <span>{(draft.metrics.bookmarks || 0).toLocaleString()} bk</span>
          </div>
        )}

        {/* Schedule info */}
        {draft.scheduledDate && (
          <div className="num text-[12px] flex justify-between items-center" style={{ color: "var(--accent)" }}>
            <span>{draft.scheduledDate} {draft.scheduledTime || ""}</span>
            <button className="text-[var(--text-3)] hover:text-[var(--down)] text-[10px]" onClick={() => onSchedule(draft.id, null)}>Unschedule</button>
          </div>
        )}

        {draft.variantGroup && <div className="num text-[10px] text-[var(--text-4)]">Variant: {draft.variantGroup}</div>}

        {/* Meta */}
        <div className="flex items-center justify-between num text-[11px] text-[var(--text-4)]">
          <span>{draft.model} · {new Date(draft.createdAt).toLocaleDateString()} {new Date(draft.createdAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
          {draft.postedUrl && <a href={draft.postedUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:brightness-110">View on X ↗</a>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-1.5 px-5 py-3 border-t border-[var(--line)]">
          <button onClick={() => { const copyText = draft.quoteUrl ? `${draft.text}\n\n${draft.quoteUrl}` : (draft.text || ""); navigator.clipboard.writeText(copyText); const btn = document.activeElement as HTMLButtonElement; if (btn) { btn.textContent = "Copied"; setTimeout(() => { btn.textContent = "Copy"; }, 1500); } }} className={GHOST_CHIP}>Copy</button>
          {!isEditing && draft.status !== "posted" && (
            <button onClick={() => onSetEditing(draft.id)} className={GHOST_CHIP}>Edit</button>
          )}

          {/* Tweak */}
          {draft.status !== "posted" && draft.status !== "rejected" && (
            isTweaking ? (
              <div className="flex gap-1 w-full">
                <input value={tweakComment} onChange={(e) => onSetTweakComment(e.target.value)}
                  placeholder="What should I change?" autoFocus
                  className="flex-1 bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-[var(--r-sm)] px-2.5 py-1.5 text-[12px] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  onKeyDown={(e) => { if (e.key === "Enter" && tweakComment.trim()) onTweak(draft.id, tweakComment); }}
                />
                <button onClick={() => { if (tweakComment.trim()) onTweak(draft.id, tweakComment); }}
                  className={CHIP} style={toneStyle("var(--accent)")}>Send</button>
                <button onClick={() => { onSetTweaking(null); onSetTweakComment(""); }}
                  className={GHOST_CHIP}>✕</button>
              </div>
            ) : (
              <button onClick={() => onSetTweaking(draft.id)} className={GHOST_CHIP}>Tweak</button>
            )
          )}

          {/* Visual buttons */}
          {!draft.visualUrl && draft.status !== "posted" && (
            <>
              <button onClick={() => onAttachVisual(draft.id)} className={GHOST_CHIP}>Attach Image</button>
              <button onClick={() => onGenerateVisual(draft.id)} className={CHIP} style={toneStyle("var(--accent)")}>Generate Visual</button>
            </>
          )}

          {/* Reject from approved/scheduled */}
          {(draft.status === "approved" || draft.status === "scheduled") && (
            isShowingRejectPicker ? (
              <div className="flex flex-wrap gap-1 w-full mt-1">
                {REJECT_REASONS.map(reason => (
                  <button key={reason} onClick={() => { onFeedback(draft.id, "rejected", reason); onSetRejectPicker(null); }}
                    className="text-[10px] px-2.5 py-1 rounded-[var(--r-sm)]" style={toneStyle("var(--down)")}>{reason}</button>
                ))}
                <form className="flex gap-1 w-full mt-1" onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.currentTarget.elements.namedItem("customReason") as HTMLInputElement);
                  if (input.value.trim()) { onFeedback(draft.id, "rejected", input.value.trim()); onSetRejectPicker(null); }
                }}>
                  <input name="customReason" placeholder="Custom reason..." autoFocus
                    className="flex-1 bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-[var(--r-sm)] px-2.5 py-1 text-[10px] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--down)]" />
                  <button type="submit" className="text-[10px] px-2.5 py-1 rounded-[var(--r-sm)]" style={toneStyle("var(--down)")}>Reject</button>
                </form>
                <button onClick={() => onSetRejectPicker(null)} className="text-[10px] text-[var(--text-3)] px-2 py-0.5">Cancel</button>
              </div>
            ) : (
              <button onClick={() => onSetRejectPicker(draft.id)} className={CHIP} style={toneStyle("var(--down)")}>Reject</button>
            )
          )}

          {/* Approve / Reject */}
          {draft.status === "pending" && (
            <>
              <button onClick={() => onFeedback(draft.id, "approved")} className={CHIP} style={toneStyle("var(--up)")}>Approve</button>
              {isShowingRejectPicker ? (
                <div className="flex flex-wrap gap-1 w-full mt-1">
                  {REJECT_REASONS.map(reason => (
                    <button key={reason} onClick={() => { onFeedback(draft.id, "rejected", reason); onSetRejectPicker(null); }}
                      className="text-[10px] px-2.5 py-1 rounded-[var(--r-sm)]" style={toneStyle("var(--down)")}>{reason}</button>
                  ))}
                  <form className="flex gap-1 w-full mt-1" onSubmit={(e) => {
                    e.preventDefault();
                    const input = (e.currentTarget.elements.namedItem("customReason") as HTMLInputElement);
                    if (input.value.trim()) { onFeedback(draft.id, "rejected", input.value.trim()); onSetRejectPicker(null); }
                  }}>
                    <input name="customReason" placeholder="Custom reason..." autoFocus
                      className="flex-1 bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-[var(--r-sm)] px-2.5 py-1 text-[10px] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--down)]" />
                    <button type="submit" className="text-[10px] px-2.5 py-1 rounded-[var(--r-sm)]" style={toneStyle("var(--down)")}>Reject</button>
                  </form>
                  <button onClick={() => onSetRejectPicker(null)} className="text-[10px] text-[var(--text-3)] px-2 py-0.5">Cancel</button>
                </div>
              ) : (
                <button onClick={() => onSetRejectPicker(draft.id)} className={CHIP} style={toneStyle("var(--down)")}>Reject</button>
              )}
            </>
          )}

          {/* Schedule */}
          {draft.status === "approved" && !draft.scheduledDate && (
            isShowingSchedulePicker ? (
              <div className="flex flex-wrap gap-1 w-full mt-1">
                {weekDays.filter(d => !d.isPast).map(day => (
                  <button key={day.date} onClick={() => { onSchedule(draft.id, day.date); onSetSchedulePicker(null); }}
                    className="text-[10px] px-2 py-0.5 rounded-[var(--r-sm)] hover:brightness-125"
                    style={day.isToday ? toneStyle("var(--accent)") : { color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--line)" }}>
                    {day.dayName} {day.label}
                  </button>
                ))}
                <button onClick={() => onSetSchedulePicker(null)} className="text-[10px] text-[var(--text-3)] px-2 py-0.5">Cancel</button>
              </div>
            ) : (
              <button onClick={() => onSetSchedulePicker(draft.id)} className={CHIP} style={toneStyle("var(--accent)")}>Schedule</button>
            )
          )}

          {/* Mark posted */}
          {(draft.status === "approved" || draft.status === "scheduled") && (
            isShowingPostedUrl ? (
              <div className="flex gap-1 w-full mt-1">
                <input value={postedUrlValue} onChange={(e) => onSetPostedUrlValue(e.target.value)}
                  placeholder="Tweet URL (optional)"
                  className="flex-1 bg-[var(--surface-2)] border border-[var(--line-strong)] rounded-[var(--r-sm)] px-2.5 py-1.5 text-[12px] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                <button onClick={() => onMarkPosted(draft.id, postedUrlValue || undefined)}
                  className={CHIP} style={toneStyle("var(--accent)")}>Done</button>
                <button onClick={() => { onSetPostedUrlDraft(null); onSetPostedUrlValue(""); }}
                  className="text-[11px] text-[var(--text-3)] px-1">✕</button>
              </div>
            ) : (
              <button onClick={() => onSetPostedUrlDraft(draft.id)} className={CHIP} style={toneStyle("var(--accent)")}>Mark Posted</button>
            )
          )}

          {/* Restore */}
          {draft.status === "rejected" && (
            <button onClick={() => onFeedback(draft.id, "pending")} className={CHIP} style={toneStyle("var(--warn)")}>Restore</button>
          )}
      </div>

      {/* Tweak status */}
      {draft.tweakRequested && (
        <div className="text-[10px] px-5 py-2 border-t border-[var(--line)]" style={{ color: "var(--warn)", background: "color-mix(in srgb, var(--warn) 6%, transparent)" }}>
          Tweak requested: &ldquo;{draft.tweakRequested.comment}&rdquo; — {draft.tweakRequested.status}
        </div>
      )}
    </div>
  );
});

// ─── DroppableDay (top-level, memo'd) ────────────────────────────────
const DroppableDay = memo(function DroppableDay({
  day, scheduledDrafts, dragOverDate, onDragOver, onDragLeave, onDrop, onClickDraft,
}: {
  day: WeekDay;
  scheduledDrafts: Draft[];
  dragOverDate: string | null;
  onDragOver: (date: string) => void;
  onDragLeave: () => void;
  onDrop: (draftId: string, date: string) => void;
  onClickDraft: (draft: Draft) => void;
}) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver(day.date); }}
      onDragLeave={() => onDragLeave()}
      onDrop={(e) => {
        e.preventDefault(); onDragLeave();
        const draftId = e.dataTransfer.getData("text/plain");
        if (draftId && !day.isPast) onDrop(draftId, day.date);
      }}
      className={`rounded-[var(--r-md)] p-3 space-y-2 border min-h-[100px] transition-all ${
        day.isToday ? "" : day.isPast ? "opacity-60" : ""
      } ${dragOverDate === day.date && !day.isPast ? "ring-2 ring-[var(--accent)]/50" : ""}`}
      style={day.isToday
        ? { background: "color-mix(in srgb, var(--accent) 8%, transparent)", borderColor: "color-mix(in srgb, var(--accent) 26%, transparent)" }
        : { background: "var(--surface-1)", borderColor: "var(--line)" }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-semibold" style={{ color: day.isToday ? "var(--accent)" : "var(--text-2)" }}>{day.dayName}</span>
        <span className="num text-[10px]" style={{ color: day.isToday ? "var(--accent)" : "var(--text-3)" }}>{day.label}</span>
        {day.isToday && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] ml-auto" />}
      </div>
      <div className="space-y-1.5">
        {scheduledDrafts.map(d => (
          <div key={d.id} onClick={() => onClickDraft(d)}
            className="text-[11px] px-2 py-1.5 rounded-[var(--r-sm)] border cursor-pointer hover:brightness-125 transition-all"
            style={
              d.status === "scheduled" ? toneStyle("var(--accent)") :
              d.status === "approved" ? toneStyle("var(--up)") :
              { color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--line)" }
            }>
            <div className="flex justify-between items-center">
              <p className="line-clamp-2 leading-tight pr-1">{d.text.slice(0, 60)}{d.text.length > 60 ? "…" : ""}</p>
              {d.scheduledTime && <span className="num text-[9px] text-[var(--text-3)] ml-1">{d.scheduledTime}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── Main Page ───────────────────────────────────────────────────────
export default function XContentPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "posted" | "scheduled" | "visuals">("pending");
  const [showRejected, setShowRejected] = useState(false);
  const [contentFilter, setContentFilter] = useState<"all" | "tweet" | "article">("all");
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [tweakDraft, setTweakDraft] = useState<string | null>(null);
  const [tweakComment, setTweakComment] = useState("");
  const [showRejectPicker, setShowRejectPicker] = useState<string | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState<string | null>(null);
  const [postedUrlDraft, setPostedUrlDraft] = useState<string | null>(null);
  const [postedUrlValue, setPostedUrlValue] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [contentRequest, setContentRequest] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);

  const weekDays = getWeekDays();

  const loadDrafts = useCallback(async () => {
    try {
      setFetchError(null);
      setDrafts(await fetchDrafts());
    } catch (e: any) {
      setFetchError(e?.message || "Failed to load drafts");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  const filterByType = useCallback((list: Draft[]) => {
    if (contentFilter === "all") return list;
    if (contentFilter === "article") return list.filter(d => d.type === "article");
    return list.filter(d => d.type !== "article");
  }, [contentFilter]);

  // Exclude ideas — those belong on the Ideas page
  const nonIdeas = drafts.filter(d => d.type !== "idea" && d.type !== "content idea" && d.type !== "industry idea");
  const pending = filterByType(nonIdeas.filter(d => d.status === "pending"));
  const approved = filterByType(nonIdeas.filter(d => d.status === "approved" && !d.scheduledDate));
  const scheduled = filterByType(nonIdeas.filter(d => d.status === "scheduled" || (d.status === "approved" && d.scheduledDate)));
  const posted = filterByType(nonIdeas.filter(d => d.status === "posted"));
  const rejected = filterByType(nonIdeas.filter(d => d.status === "rejected"));

  const tabCounts: Record<string, number> = { pending: pending.length, approved: approved.length, scheduled: scheduled.length, posted: posted.length };

  const handleFeedback = useCallback(async (draftId: string, rating: string, reason?: string) => {
    const res = await fetch("/api/x-content/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId, rating, reason }) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[feedback] POST failed", res.status, err);
      alert(`Save failed (${res.status}): ${err?.error || "unknown error"}. Try refreshing the page.`);
      return;
    }
    loadDrafts();
  }, [loadDrafts]);

  const handleScheduleDraft = useCallback(async (draftId: string, scheduledDate: string | null, scheduledTime?: string | null) => {
    await fetch("/api/x-content/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId, scheduledDate, scheduledTime }) });
    loadDrafts();
  }, [loadDrafts]);

  const handleTweak = useCallback(async (draftId: string, comment: string) => {
    await fetch("/api/x-content/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId, tweakComment: comment }) });
    setTweakDraft(null); setTweakComment("");
    loadDrafts();
  }, [loadDrafts]);

  const handleEditSubmit = useCallback(async (draftId: string, newText: string) => {
    await fetch("/api/x-content/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId, editText: newText }) });
    setEditingDraft(null);
    loadDrafts();
  }, [loadDrafts]);

  const handleMarkPosted = useCallback(async (draftId: string, url?: string) => {
    await fetch("/api/x-content/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId, rating: "posted", postedUrl: url }) });
    setPostedUrlDraft(null); setPostedUrlValue("");
    loadDrafts();
  }, [loadDrafts]);

  const handleAttachVisual = useCallback((draftId: string) => {
    const fileInput = document.createElement("input");
    fileInput.type = "file"; fileInput.accept = ".png,.jpg,.jpeg";
    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { alert("File too large. Max 10MB."); return; }
      const formData = new FormData();
      formData.append("draftId", draftId); formData.append("file", file);
      try { await fetch("/api/x-content/visual", { method: "POST", body: formData }); loadDrafts(); }
      catch (err) { console.error("Upload failed", err); }
    };
    fileInput.click();
  }, [loadDrafts]);

  const handleGenerateVisual = useCallback(async (draftId: string) => {
    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return;
    try {
      const res = await fetch("/api/x-content/generate-visual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId }) });
      if (!res.ok) { const err = await res.json(); console.error("Generation failed:", err); alert("Visual generation failed: " + (err.error || "unknown")); }
      else { loadDrafts(); }
    }
    catch (err) { console.error("Generation failed", err); alert("Visual generation failed"); }
  }, [drafts, loadDrafts]);

  const handleRemoveVisual = useCallback(async (draftId: string) => {
    await fetch("/api/x-content/visual", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId }) });
    loadDrafts();
  }, [loadDrafts]);

  const handleCalendarDraftClick = useCallback((draft: Draft) => {
    const tab = draft.status === "posted" ? "posted" : "scheduled";
    setActiveTab(tab as typeof activeTab);
    setTimeout(() => {
      const el = document.getElementById(`draft-${draft.id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("ring-2", "ring-sky-500/50");
      setTimeout(() => el?.classList.remove("ring-2", "ring-sky-500/50"), 2000);
    }, 100);
  }, []);

  const handleDragOver = useCallback((date: string) => setDragOverDate(date), []);
  const handleDragLeave = useCallback(() => setDragOverDate(null), []);

  const handleContentRequest = useCallback(async () => {
    if (!contentRequest.trim() || requestLoading) return;
    setRequestLoading(true);
    try {
      await fetch("/api/x-content/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: contentRequest.trim() }),
      });
      setContentRequest("");
    } catch (err) { console.error("Request failed", err); }
    setRequestLoading(false);
  }, [contentRequest, requestLoading]);

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="sk h-48 rounded-[var(--r-lg)]" />)}
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <EmptyState
        title="Failed to load drafts"
        hint={fetchError}
        action={<button onClick={loadDrafts} className="btn-ghost px-4 py-2 text-[13px]">Retry</button>}
      />
    );
  }

  const activeDrafts = activeTab === "pending" ? pending : activeTab === "approved" ? approved : activeTab === "scheduled" ? scheduled : posted;

  const renderCard = (draft: Draft) => (
    <DraftCard
      key={draft.id}
      draft={draft}
      isEditing={editingDraft === draft.id}
      isTweaking={tweakDraft === draft.id}
      tweakComment={tweakDraft === draft.id ? tweakComment : ""}
      isShowingRejectPicker={showRejectPicker === draft.id}
      isShowingSchedulePicker={showSchedulePicker === draft.id}
      isShowingPostedUrl={postedUrlDraft === draft.id}
      postedUrlValue={postedUrlDraft === draft.id ? postedUrlValue : ""}
      weekDays={weekDays}
      onSetEditing={setEditingDraft}
      onSetTweaking={setTweakDraft}
      onSetTweakComment={setTweakComment}
      onSetRejectPicker={setShowRejectPicker}
      onSetSchedulePicker={setShowSchedulePicker}
      onSetPostedUrlDraft={setPostedUrlDraft}
      onSetPostedUrlValue={setPostedUrlValue}
      onEditSubmit={handleEditSubmit}
      onTweak={handleTweak}
      onFeedback={handleFeedback}
      onSchedule={handleScheduleDraft}
      onMarkPosted={handleMarkPosted}
      onAttachVisual={handleAttachVisual}
      onGenerateVisual={handleGenerateVisual}
      onRemoveVisual={handleRemoveVisual}
      onLightbox={setLightboxUrl}
      onLoadDrafts={loadDrafts}
    />
  );

  return (
    <div className="p-4 md:p-6 space-y-5 overflow-x-hidden">
      {/* Content Request Bar */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            value={contentRequest}
            onChange={(e) => setContentRequest(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleContentRequest(); }}
            placeholder="Request content... e.g. 'quote retweet my last tweet about bookmarks with an update'"
            className="w-full bg-[var(--surface-1)] border border-[var(--line)] rounded-[var(--r-md)] px-4 py-3 text-[13px] text-[var(--text)] placeholder-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
          />
          <span className="absolute right-3 top-3.5 text-[10px] text-[var(--text-3)]">Sage</span>
        </div>
        <button
          onClick={handleContentRequest}
          disabled={requestLoading || !contentRequest.trim()}
          className={`px-4 py-3 rounded-[var(--r-md)] text-[13px] font-medium transition-colors ${
            !contentRequest.trim() || requestLoading ? "opacity-40 cursor-not-allowed" : ""
          } ${contentRequest.trim() && !requestLoading ? "btn-primary" : "btn-ghost"}`}
        >
          {requestLoading ? "Sending..." : "Request"}
        </button>
      </div>

      {/* Tabs */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
          {(["pending", "approved", "scheduled", "posted"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`${CHIP} shrink-0 px-3 py-1.5 text-[13px] ${
                activeTab === tab
                  ? "text-[var(--text)] bg-[var(--surface-3)] border border-[var(--line-strong)]"
                  : "text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-2)] border border-transparent"
              }`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className="num text-[10px] px-1.5 py-0.5 rounded-full text-[var(--text-3)] bg-[var(--surface-2)]">{tabCounts[tab]}</span>
            </button>
          ))}
          <button onClick={() => setActiveTab("visuals")}
            className={`${CHIP} shrink-0 px-3 py-1.5 text-[13px] ${
              activeTab === "visuals"
                ? "text-[var(--text)] bg-[var(--surface-3)] border border-[var(--line-strong)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-2)] border border-transparent"
            }`}>
            Visuals
          </button>
          <div className="shrink-0 border-l border-[var(--line)] ml-1 pl-2">
            <button onClick={() => setShowRejected(!showRejected)}
              className={`${CHIP} px-2.5 py-1.5 text-[12px]`}
              style={showRejected ? toneStyle("var(--down)") : { color: "var(--text-3)", background: "transparent", border: "1px solid transparent" }}>
              Rejected
              <span className="num text-[10px] px-1.5 py-0.5 rounded-full text-[var(--text-3)] bg-[var(--surface-2)]">{rejected.length}</span>
            </button>
          </div>
          <select value={contentFilter} onChange={(e) => setContentFilter(e.target.value as typeof contentFilter)}
            className="shrink-0 ml-auto bg-[var(--surface-2)] text-[var(--text-2)] px-2.5 py-1.5 rounded-[var(--r-sm)] text-[13px] border border-[var(--line)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]">
            <option value="all">All</option>
            <option value="tweet">Tweets</option>
            <option value="article">Articles</option>
          </select>
        </div>
      </div>

      {/* Visuals Tab */}
      {activeTab === "visuals" && (() => {
        const articleVisuals = [
          // ── 40 hours article ──
          { id: "40h-hero", label: "40hrs — Hero / Thumbnail", desc: "Article header — use this when sharing the link on X", url: "/article-visuals/1d706cf0-e41d-4e6d-9cc5-14e4301b1e2b-hero.html", thumb: null },
          { id: "40h-comparison", label: "40hrs — Prompting vs Delegating", desc: "Core contrast card — place after the intro section", url: "/article-visuals/1d706cf0-e41d-4e6d-9cc5-14e4301b1e2b-comparison.html", thumb: null },
          { id: "40h-steps", label: "40hrs — 3-Step Framework", desc: "Step-by-step delegation guide — place before the CTA", url: "/article-visuals/1d706cf0-e41d-4e6d-9cc5-14e4301b1e2b-steps.html", thumb: null },
          // ── Google Workspace article ──
          { id: "hero", label: "GWS — Hero / Thumbnail", desc: "Article header — use this when sharing the link on X", url: "/article-visuals/hero.html", thumb: null },
          { id: "skills-grid", label: "GWS — Skills Overview Grid", desc: "All 50 skills organized by app — place after the intro", url: "/article-visuals/skills-grid.html", thumb: null },
          { id: "setup-flow", label: "GWS — Setup Flow", desc: "4-step install guide — place in the setup section", url: "/article-visuals/setup-flow.html", thumb: null },
          { id: "before-after", label: "GWS — Before / After", desc: "Emotional payoff card — place before the conclusion", url: "/article-visuals/before-after.html", thumb: null },
          { id: "cc-hero", label: "Claude Code — Hero / Thumbnail", desc: "Article header — use when sharing the link on X", url: "/article-visuals/claude-code-hero.html", thumb: null },
          { id: "cc-skills", label: "Claude Code — Agent Skills", desc: "Screenshot 1 — SKILL.md setup", url: "/draft-visuals/claude-code-skills-skill-md.png", thumb: "/draft-visuals/claude-code-skills-skill-md.png" },
          { id: "cc-hook", label: "Claude Code — SessionStart Hook", desc: "Screenshot 2 — settings.json hook config", url: "/draft-visuals/claude-code-session-hook.png", thumb: "/draft-visuals/claude-code-session-hook.png" },
          { id: "cc-aws", label: "Claude Code — AWS CloudFormation", desc: "Screenshot 3 — retroactive IaC import session", url: "/draft-visuals/claude-code-aws-cloudformation.png", thumb: "/draft-visuals/claude-code-aws-cloudformation.png" },
          { id: "cc-gsd", label: "Claude Code — GSD Context Manager", desc: "Screenshot 4 — context pruning in action", url: "/draft-visuals/claude-code-gsd-context.png", thumb: "/draft-visuals/claude-code-gsd-context.png" },
          { id: "cc-gws", label: "Claude Code — Google Workspace CLI", desc: "Screenshot 5 — inbox + email draft session", url: "/draft-visuals/claude-code-google-workspace.png", thumb: "/draft-visuals/claude-code-google-workspace.png" },
        ];
        const draftVisuals = drafts.filter(d => d.visualUrl).map(d => ({
          id: d.id, label: d.text?.slice(0, 60) + "…", desc: `Draft visual · ${d.status}`, url: d.visualUrl!, thumb: d.visualUrl,
        }));
        const allVisuals = [...articleVisuals, ...draftVisuals];
        return (
          <div className="space-y-8">
            <div>
              <span className="eyebrow">Article Visuals</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {articleVisuals.map(v => (
                  <div key={v.id} className="panel overflow-hidden">
                    <div className="relative bg-[var(--bg)]" style={{ height: 200 }}>
                      <iframe src={v.url} className="w-full h-full border-0 pointer-events-none" style={{ transform: "scale(0.38)", transformOrigin: "top left", width: "263%", height: "263%" }} />
                      <a href={v.url} target="_blank" rel="noreferrer"
                        className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition group">
                        <span className="opacity-0 group-hover:opacity-100 text-[var(--text)] text-[13px] font-medium bg-[var(--surface-3)] px-3 py-1.5 rounded-[var(--r-sm)] transition">
                          Open full size
                        </span>
                      </a>
                    </div>
                    <div className="p-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-[var(--text)]">{v.label}</div>
                        <div className="text-[12px] text-[var(--text-3)] mt-0.5">{v.desc}</div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <a href={v.url} target="_blank" rel="noreferrer"
                          className={`${CHIP} whitespace-nowrap`} style={toneStyle("var(--accent)")}>
                          Open HD ↗
                        </a>
                        <button onClick={() => { navigator.clipboard.writeText(window.location.origin + v.url); }}
                          className={GHOST_CHIP}>
                          Copy URL
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {draftVisuals.length > 0 && (
              <div>
                <span className="eyebrow">Draft Visuals (PNG)</span>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-4">
                  {draftVisuals.map(v => (
                    <div key={v.id} className="panel overflow-hidden">
                      <div className="relative bg-[var(--bg)] h-36 cursor-pointer" onClick={() => setLightboxUrl(v.url)}>
                        <img src={v.thumb!} alt={v.label} className="w-full h-full object-cover opacity-80 hover:opacity-100 transition" />
                      </div>
                      <div className="p-2.5 flex items-center justify-between gap-2">
                        <div className="text-[12px] text-[var(--text-2)] truncate">{v.label}</div>
                        <a href={v.url} download target="_blank" rel="noreferrer"
                          className={`${GHOST_CHIP} shrink-0 !px-2`}>
                          DL
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Main grid */}
      {activeTab !== "visuals" && (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {activeDrafts.map(renderCard)}
        {activeDrafts.length === 0 && (
          <div className="col-span-1 md:col-span-2 xl:col-span-3">
            <EmptyState title={`No ${activeTab} drafts${contentFilter !== "all" ? ` (${contentFilter}s)` : ""}`} />
          </div>
        )}
      </div>
      )}

      {/* Rejected (collapsible) */}
      {showRejected && rejected.length > 0 && (
        <div className="border-t border-[var(--line)] pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow" style={{ color: "var(--down)" }}>Rejected ({rejected.length})</span>
            <button onClick={() => setShowRejected(false)} className="text-[12px] text-[var(--text-3)] hover:text-[var(--text-2)]">Hide</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 opacity-80">{rejected.map(renderCard)}</div>
        </div>
      )}

      {/* Calendar */}
      <div className="border-t border-[var(--line)] pt-5">
        <div className="eyebrow mb-3">Schedule · drag drafts here</div>
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => (
            <DroppableDay key={day.date} day={day}
              scheduledDrafts={drafts.filter(d => d.scheduledDate === day.date)}
              dragOverDate={dragOverDate}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave}
              onDrop={(draftId, date) => handleScheduleDraft(draftId, date)}
              onClickDraft={handleCalendarDraftClick} />
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Visual Preview" className="max-w-full max-h-full object-contain" />
        </div>
      )}

    </div>
  );
}
