"use client";

import React, { useEffect, useState, useCallback } from "react";
import { EmptyState } from "@/components/ui/kit";

interface LongformScript {
  id: string;
  title: string;
  status: "draft" | "approved" | "tofilm" | "filmed" | "posted" | "rejected";
  platforms: string[];
  targetLength: string;
  hook: string;
  outline: string;
  fullScript: string;
  factCheck: { status: string; verified: string[]; issues: string[] };
  createdAt: string;
  notes: string;
  rejectedReason?: string;
  type?: "article" | "video";
  youtubeUrl?: string;
  thumbnailUrl?: string;
  tweetUrl?: string;
  youtubeViews?: number;
  youtubeLikes?: number;
  youtubeComments?: number;
  tweetViews?: number;
  tweetLikes?: number;
  tweetBookmarks?: number;
  tweetRetweets?: number;
  tweetReplies?: number;
}

/* ── presentational tone helpers (Calm Luxury) ── */
const BTN_BASE = "text-[12px] px-3 py-1.5 rounded-[var(--r-md)] font-medium transition-colors";
const TONE: Record<string, string> = {
  up: "bg-[color-mix(in_srgb,var(--up)_12%,transparent)] text-[var(--up)] hover:bg-[color-mix(in_srgb,var(--up)_20%,transparent)]",
  down: "bg-[color-mix(in_srgb,var(--down)_12%,transparent)] text-[var(--down)] hover:bg-[color-mix(in_srgb,var(--down)_20%,transparent)]",
  warn: "bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-[var(--warn)] hover:bg-[color-mix(in_srgb,var(--warn)_20%,transparent)]",
  accent: "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]",
  ghost: "bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]",
};
const INPUT = "bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text)] placeholder-[var(--text-3)] rounded-[var(--r-md)] focus:outline-none focus:border-[var(--accent)]";

export default function LongFormPage() {
  const [scripts, setScripts] = useState<LongformScript[]>([]);
  const [activeView, setActiveView] = useState<"ideas" | "scripts" | "tofilm" | "filmed" | "posted">("ideas");
  const [generating, setGenerating] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "article" | "video">("all");
  const [newType, setNewType] = useState<"article" | "video">("article");
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const [expandedOutline, setExpandedOutline] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; title: string } | null>(null);
  const [postModal, setPostModal] = useState<{ id: string; title: string } | null>(null);
  const [postForm, setPostForm] = useState({ youtubeUrl: "", finalTitle: "", finalScript: "", thumbnailUrl: "" });
  const rejectRef = React.useRef<HTMLTextAreaElement>(null);

  const fetchScripts = useCallback(async () => {
    try { setScripts(await (await fetch("/api/longform", { cache: "no-store" })).json()); } catch { /* empty */ }
  }, []);

  useEffect(() => { fetchScripts(); }, [fetchScripts]);

  async function updateScript(id: string, updates: Partial<LongformScript>) {
    try {
      const res = await fetch("/api/longform", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[longform] PATCH failed", res.status, err);
        alert(`Save failed (${res.status}): ${err?.error || "unknown error"}`);
        return;
      }
      await fetchScripts();
    } catch (e) {
      console.error("[longform] updateScript error", e);
    }
  }

  // deleteScript removed — use reject instead to preserve data

  async function generateScript() {
    if (!topicInput.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/longform/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicInput, type: newType }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetch("/api/longform", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        setTopicInput("");
        fetchScripts();
      }
    } catch { /* empty */ }
    setGenerating(false);
  }

  const [generatingId, setGeneratingId] = useState<string | null>(null);

  async function approveAndGenerate(id: string, title: string, hook: string) {
    setGeneratingId(id);
    try {
      // First update status
      await updateScript(id, { status: "approved" });
      // Then generate script
      const res = await fetch("/api/longform/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: title, hook, id }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update the existing script with generated content
        await fetch("/api/longform", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            status: "approved",
            title: data.title || title,
            hook: data.hook || hook,
            outline: data.outline || "",
            fullScript: data.fullScript || "",
            targetLength: data.targetLength || "10-15 min",
            factCheck: data.factCheck || { status: "pending", verified: [], issues: [] },
          }),
        });
        fetchScripts();
      }
    } catch { /* empty */ }
    setGeneratingId(null);
  }

  const filteredScripts = typeFilter === "all" ? scripts : scripts.filter(s => (s.type || "article") === typeFilter);
  const draftScripts = filteredScripts.filter(s => s.status === "draft");
  const approvedScripts = filteredScripts.filter(s => s.status === "approved");
  const tofilmScripts = filteredScripts.filter(s => s.status === "tofilm");
  const filmedScripts = filteredScripts.filter(s => s.status === "filmed");
  const postedScripts = filteredScripts.filter(s => s.status === "posted").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const rejectedScripts = filteredScripts.filter(s => s.status === "rejected");

  function copySpokenText(script: LongformScript) {
    if (!script.fullScript) return;
    // Extract only spoken text: lines in quotes, remove headers/stage directions
    const lines = script.fullScript.split("\n");
    const spoken = lines
      .filter(l => !l.startsWith("#") && !l.startsWith("*[") && !l.startsWith("**Target") && !l.startsWith("**Format") && !l.startsWith("**Tone") && !l.startsWith("---") && l.trim() !== "")
      .map(l => l.replace(/^\*\[.*?\]\*\s*/, "").replace(/^[">]\s*/, "").replace(/^- /, "• "))
      .filter(l => l.trim() !== "")
      .join("\n");
    navigator.clipboard.writeText(spoken);
  }

  function RejectModal() {
    if (!rejectModal) return null;
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
        <div dir="ltr" className="panel p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
          <h3 className="text-sm font-semibold text-[var(--text)] mb-1">Reject: {rejectModal.title}</h3>
          <p className="text-xs text-[var(--text-3)] mb-3">Why? This helps improve future scripts.</p>
          <textarea
            ref={rejectRef}
            defaultValue=""
            placeholder="e.g. hook is weak, topic isn't right, needs more research..."
            className={`w-full ${INPUT} p-3 text-sm resize-none h-20 focus:border-[var(--down)]`}
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                const reason = rejectRef.current?.value || "";
                updateScript(rejectModal.id, { status: "rejected", rejectedReason: reason });
                setRejectModal(null);
              }}
              className={`flex-1 text-sm py-2 rounded-[var(--r-md)] ${TONE.down} transition-colors font-medium`}
            >Reject</button>
            <button onClick={() => setRejectModal(null)} className={`flex-1 text-sm py-2 rounded-[var(--r-md)] ${TONE.ghost} transition-colors`}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  function PostModal() {
    const [scraping, setScraping] = useState(false);
    const [scraped, setScraped] = useState(false);
    const [scrapeError, setScrapeError] = useState("");

    async function scrapeYoutube(url: string) {
      if (!url.includes("youtube.com") && !url.includes("youtu.be")) return;
      setScraping(true);
      setScrapeError("");
      setScraped(false);
      try {
        const res = await fetch("/api/youtube-scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!res.ok) throw new Error("Scrape failed");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setPostForm({
          youtubeUrl: url,
          finalTitle: data.title || "",
          thumbnailUrl: data.thumbnail || "",
          finalScript: data.transcript || "",
        });
        setScraped(true);
      } catch (e) {
        setScrapeError(e instanceof Error ? e.message : "Could not scrape video — fill in manually");
      } finally {
        setScraping(false);
      }
    }

    function handleUrlChange(url: string) {
      setPostForm(f => ({ ...f, youtubeUrl: url }));
      // Auto-scrape when a full YouTube URL is pasted
      if ((url.includes("youtube.com/watch") || url.includes("youtu.be/")) && url.length > 20) {
        scrapeYoutube(url);
      }
    }

    if (!postModal) return null;
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPostModal(null)}>
        <div dir="ltr" className="panel p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <h3 className="text-sm font-semibold text-[var(--text)] mb-1">Mark as Posted</h3>
          <p className="text-xs text-[var(--text-3)] mb-4">{postModal.title}</p>

          <div className="space-y-3">
            <div>
              <label className="eyebrow mb-1 block">YouTube URL *</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={postForm.youtubeUrl}
                  onChange={e => handleUrlChange(e.target.value)}
                  onPaste={e => { setTimeout(() => handleUrlChange((e.target as HTMLInputElement).value), 50); }}
                  placeholder="Paste YouTube URL — auto-fills everything"
                  className={`flex-1 ${INPUT} p-3 text-sm`}
                />
                <button
                  onClick={() => scrapeYoutube(postForm.youtubeUrl)}
                  disabled={scraping || !postForm.youtubeUrl}
                  className={`px-3 py-2 rounded-[var(--r-md)] ${TONE.accent} text-xs font-medium disabled:opacity-40 transition-colors whitespace-nowrap`}
                >{scraping ? "Scraping..." : "Fetch"}</button>
              </div>
              {scrapeError && <p className="text-xs text-[var(--down)] mt-1">{scrapeError}</p>}
              {scraped && <p className="text-xs text-[var(--up)] mt-1">Auto-filled from YouTube</p>}
            </div>

            <div>
              <label className="eyebrow mb-1 block">Video Title</label>
              <input
                value={postForm.finalTitle}
                onChange={e => setPostForm(f => ({ ...f, finalTitle: e.target.value }))}
                placeholder="Auto-filled from YouTube"
                className={`w-full ${INPUT} p-3 text-sm`}
              />
            </div>

            {postForm.thumbnailUrl && (
              <div>
                <label className="eyebrow mb-1 block">Thumbnail</label>
                <img src={postForm.thumbnailUrl} alt="Thumbnail" className="w-full rounded-[var(--r-md)] border border-[var(--line)]" />
              </div>
            )}

            <div>
              <label className="eyebrow mb-1 block">Transcript / Script</label>
              <textarea
                value={postForm.finalScript}
                onChange={e => setPostForm(f => ({ ...f, finalScript: e.target.value }))}
                placeholder="Auto-filled from YouTube captions..."
                className={`w-full ${INPUT} p-3 text-sm resize-none h-32`}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => {
                if (!postForm.youtubeUrl) return;
                updateScript(postModal.id, {
                  status: "posted",
                  youtubeUrl: postForm.youtubeUrl,
                  thumbnailUrl: postForm.thumbnailUrl,
                  title: postForm.finalTitle || postModal.title,
                  fullScript: postForm.finalScript,
                });
                setPostModal(null);
              }}
              disabled={!postForm.youtubeUrl}
              className={`flex-1 text-sm py-2 rounded-[var(--r-md)] ${TONE.accent} transition-colors font-medium disabled:opacity-40`}
            >Post</button>
            <button onClick={() => setPostModal(null)} className={`flex-1 text-sm py-2 rounded-[var(--r-md)] ${TONE.ghost} transition-colors`}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  function ScriptCard({ script }: { script: LongformScript; compact?: boolean }) {
    const isExpanded = expandedScript === script.id;
    const isOutlineExpanded = expandedOutline === script.id;
    const [notesValue, setNotesValue] = useState(script.notes || "");
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState(script.title);
    const [tweakOpen, setTweakOpen] = useState(false);
    const [tweakMsg, setTweakMsg] = useState("");
    const [tweaking, setTweaking] = useState(false);

    return (
      <div className="panel panel-interactive overflow-hidden">
        <div className="p-4">
          {/* Title + meta */}
          <div className="flex items-center justify-between mb-2">
            {editingTitle ? (
              <input
                autoFocus
                value={titleValue}
                onChange={e => setTitleValue(e.target.value)}
                onBlur={() => { if (titleValue !== script.title) updateScript(script.id, { title: titleValue }); setEditingTitle(false); }}
                onKeyDown={e => { if (e.key === "Enter") { if (titleValue !== script.title) updateScript(script.id, { title: titleValue }); setEditingTitle(false); } if (e.key === "Escape") { setTitleValue(script.title); setEditingTitle(false); } }}
                className={`text-sm font-semibold flex-1 pr-2 ${INPUT} px-2 py-1`}
              />
            ) : (
              <span onClick={() => { if (script.status !== "posted") setEditingTitle(true); }} className={`text-sm font-semibold text-[var(--text)] flex-1 pr-2 ${script.status !== "posted" ? "cursor-pointer hover:text-[var(--accent)]" : ""}`} title={script.status !== "posted" ? "Click to edit title" : ""}>{script.title}</span>
            )}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--text-2)]">{(script.type || "article") === "video" ? "🎬 Video" : "📝 Article"}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--text-3)] num">{script.targetLength}</span>
            </div>
          </div>

          {/* Platform badges */}
          <div className="flex items-center gap-1.5 mb-3">
            {script.platforms?.map(p => (
              <span key={p} className="text-[9px] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--text-2)]">
                {p === "youtube" ? "▶ YouTube" : "𝕏 Twitter"}
              </span>
            ))}
          </div>

          {/* Fact check */}
          {script.factCheck && (
            <div
              className="rounded-[var(--r-md)] p-2 mb-3 border"
              style={{
                background: `color-mix(in srgb, ${script.factCheck.status === "✅" ? "var(--up)" : "var(--warn)"} 8%, transparent)`,
                borderColor: `color-mix(in srgb, ${script.factCheck.status === "✅" ? "var(--up)" : "var(--warn)"} 22%, transparent)`,
              }}
            >
              <p className="text-[11px] text-[var(--text-2)]">
                <span className="font-medium text-[var(--text)]">{script.factCheck.status} Fact Check</span>
                {script.factCheck.verified?.length > 0 && <span className="text-[var(--up)] ml-1 num">— {script.factCheck.verified.length} verified</span>}
              </p>
              {script.factCheck.issues?.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {script.factCheck.issues.map((issue, i) => (
                    <p key={i} className="text-[10px] text-[var(--warn)]">• {issue}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {script.rejectedReason && (
            <div className="rounded-[var(--r-md)] p-2 mb-3 border border-[color-mix(in_srgb,var(--down)_22%,transparent)] bg-[color-mix(in_srgb,var(--down)_8%,transparent)]">
              <p className="text-[10px] text-[var(--down)]">💬 {script.rejectedReason}</p>
            </div>
          )}

          {/* Hook */}
          <div className="bg-[var(--surface-2)] rounded-[var(--r-md)] p-3 border border-[var(--line)] mb-3">
            <p className="eyebrow mb-1">Hook</p>
            <p className="text-[13px] text-[var(--text)] whitespace-pre-line leading-relaxed">{script.hook}</p>
          </div>

          {/* Outline (collapsible) */}
          <div className="mb-3">
            <button
              onClick={() => setExpandedOutline(isOutlineExpanded ? null : script.id)}
              className="flex items-center gap-2 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
            >
              <span>{isOutlineExpanded ? "▴" : "▾"}</span>
              <span className="font-medium uppercase tracking-wider">Outline</span>
            </button>
            {isOutlineExpanded && (
              <div className="mt-2 bg-[var(--surface-2)] rounded-[var(--r-md)] p-3">
                <p className="text-xs text-[var(--text-2)] leading-relaxed">{script.outline}</p>
              </div>
            )}
          </div>

          {/* Full Script (collapsible) */}
          <div className="mb-3">
            <button
              onClick={() => setExpandedScript(isExpanded ? null : script.id)}
              className="flex items-center gap-2 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
            >
              <span>{isExpanded ? "▴" : "▾"}</span>
              <span className="font-medium uppercase tracking-wider">Full Script</span>
            </button>
            {isExpanded && script.fullScript && (
              <div className="mt-2 bg-[var(--surface-2)] rounded-[var(--r-md)] p-5 border border-[var(--line)] max-h-[70vh] overflow-y-auto">
                <div className="max-w-none">
                  {script.fullScript.split("\n").map((line, i) => {
                    if (line.startsWith("# ")) return <h1 key={i} className="text-lg font-bold text-[var(--text)] mt-4 mb-2">{line.slice(2)}</h1>;
                    if (line.startsWith("## ")) return <h2 key={i} className="text-base font-bold text-[var(--text)] mt-6 mb-2 border-b border-[var(--line)] pb-1">{line.slice(3)}</h2>;
                    if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-bold text-[var(--text-2)] mt-4 mb-1">{line.slice(4)}</h3>;
                    if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="text-sm font-bold text-[var(--text)] mt-3 mb-1">{line.slice(2, -2)}</p>;
                    if (line.startsWith("- ")) return <p key={i} className="text-xs text-[var(--text-2)] leading-relaxed ml-4">• {line.slice(2)}</p>;
                    if (line.startsWith("*[") || line.startsWith("*[")) return <p key={i} className="text-xs text-[var(--text-3)] italic leading-relaxed">{line.replace(/\*/g, "")}</p>;
                    if (line.startsWith(">") || line.startsWith('"')) return <blockquote key={i} className="text-sm text-[var(--text)] border-l-2 border-[var(--accent)] pl-3 my-2 italic">{line.replace(/^>?\s*"?/, "").replace(/"$/, "")}</blockquote>;
                    if (line.startsWith("---")) return <hr key={i} className="border-[var(--line)] my-4" />;
                    if (line.trim() === "") return <div key={i} className="h-2" />;
                    return <p key={i} className="text-xs text-[var(--text-2)] leading-relaxed">{line}</p>;
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="mb-3">
            <p className="eyebrow mb-1">Notes</p>
            <textarea
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              onBlur={() => { if (notesValue !== script.notes) updateScript(script.id, { notes: notesValue }); }}
              placeholder="Filming notes..."
              className={`w-full ${INPUT} p-2 text-xs text-[var(--text-2)] resize-none h-16`}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => copySpokenText(script)}
              className={`${BTN_BASE} ${TONE.ghost}`}
            >Copy Full Script</button>

            {script.status === "draft" && !script.fullScript && (
              <>
                <button
                  onClick={() => approveAndGenerate(script.id, script.title, script.hook)}
                  disabled={generatingId === script.id}
                  className={`${BTN_BASE} ${TONE.up} disabled:opacity-50`}
                >{generatingId === script.id ? "Generating..." : "Approve & Generate Script"}</button>
                <button
                  onClick={() => setTweakOpen(!tweakOpen)}
                  className={`${BTN_BASE} ${TONE.warn}`}
                >Tweak</button>
                <button
                  onClick={() => setRejectModal({ id: script.id, title: script.title })}
                  className={`${BTN_BASE} ${TONE.down}`}
                >Reject</button>
              </>
            )}
            {script.status === "draft" && script.fullScript && (
              <>
                <button
                  onClick={() => updateScript(script.id, { status: "approved" })}
                  className={`${BTN_BASE} ${TONE.up}`}
                >Approve Script</button>
                <button
                  onClick={() => setRejectModal({ id: script.id, title: script.title })}
                  className={`${BTN_BASE} ${TONE.down}`}
                >Reject</button>
              </>
            )}

            {script.status === "approved" && (
              <>
                <button
                  onClick={() => updateScript(script.id, { status: "tofilm" })}
                  className={`${BTN_BASE} ${TONE.accent}`}
                >Ready to Film</button>
                <button
                  onClick={() => setTweakOpen(!tweakOpen)}
                  className={`${BTN_BASE} ${TONE.warn}`}
                >Tweak</button>
                <button
                  onClick={() => setRejectModal({ id: script.id, title: script.title })}
                  className={`${BTN_BASE} ${TONE.down}`}
                >Reject</button>
                <button
                  onClick={() => updateScript(script.id, { status: "draft" })}
                  className={`${BTN_BASE} ${TONE.ghost}`}
                >↩ Back to Ideas</button>
              </>
            )}

            {script.status === "tofilm" && (
              <>
                <button
                  onClick={() => updateScript(script.id, { status: "filmed" })}
                  className={`${BTN_BASE} ${TONE.accent}`}
                >Filmed</button>
                <button
                  onClick={() => setRejectModal({ id: script.id, title: script.title })}
                  className={`${BTN_BASE} ${TONE.down}`}
                >Reject</button>
                <button
                  onClick={() => updateScript(script.id, { status: "approved" })}
                  className={`${BTN_BASE} ${TONE.ghost}`}
                >↩ Back to Scripts</button>
              </>
            )}

            {script.status === "filmed" && (
              <>
                <button
                  onClick={() => { setPostModal({ id: script.id, title: script.title }); setPostForm({ youtubeUrl: "", finalTitle: script.title, finalScript: script.fullScript || "", thumbnailUrl: "" }); }}
                  className={`${BTN_BASE} ${TONE.accent}`}
                >Mark as Posted</button>
                <button
                  onClick={() => updateScript(script.id, { status: "tofilm" })}
                  className={`${BTN_BASE} ${TONE.ghost}`}
                >↩ Back to To Film</button>
              </>
            )}

            {script.status === "posted" && (
              <button
                onClick={() => updateScript(script.id, { status: "filmed" })}
                className={`${BTN_BASE} ${TONE.ghost}`}
              >↩ Back to Filmed</button>
            )}

            {script.status === "rejected" && (
              <button
                onClick={() => updateScript(script.id, { status: "draft" })}
                className={`${BTN_BASE} ${TONE.ghost}`}
              >↩ Restore to Draft</button>
            )}
          </div>

          {/* Tweak request panel */}
          {tweakOpen && (
            <div className="mt-3 bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] border border-[color-mix(in_srgb,var(--warn)_22%,transparent)] rounded-[var(--r-md)] p-3">
              <p className="eyebrow mb-2" style={{ color: "var(--warn)" }}>Send tweak to Nova</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tweakMsg}
                  onChange={e => setTweakMsg(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && tweakMsg.trim()) {
                      setTweaking(true);
                      fetch("/api/longform/tweak", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: script.id, title: script.title, hook: script.hook, outline: script.outline, message: tweakMsg.trim() }),
                      }).then(() => { setTweaking(false); setTweakOpen(false); setTweakMsg(""); }).catch(() => setTweaking(false));
                    }
                  }}
                  placeholder="e.g. 'make the hook more outcome-based' or 'change title to focus on results'"
                  className={`flex-1 ${INPUT} px-3 py-2 text-sm focus:border-[var(--warn)]`}
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (!tweakMsg.trim()) return;
                    setTweaking(true);
                    fetch("/api/longform/tweak", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: script.id, title: script.title, hook: script.hook, outline: script.outline, message: tweakMsg.trim() }),
                    }).then(() => { setTweaking(false); setTweakOpen(false); setTweakMsg(""); fetchScripts(); }).catch(() => setTweaking(false));
                  }}
                  disabled={!tweakMsg.trim() || tweaking}
                  className={`px-4 py-2 rounded-[var(--r-md)] text-xs font-medium transition-colors ${tweakMsg.trim() && !tweaking ? TONE.warn : "bg-[var(--surface-2)] text-[var(--text-4)] cursor-not-allowed"}`}
                >{tweaking ? "Sending..." : "Send"}</button>
                <button onClick={() => { setTweakOpen(false); setTweakMsg(""); }} className="px-3 py-2 rounded-[var(--r-md)] text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function PostedCard({ script }: { script: LongformScript }) {
    const [ytUrl, setYtUrl] = useState(script.youtubeUrl || "");
    const [twUrl, setTwUrl] = useState(script.tweetUrl || "");
    const [editingYt, setEditingYt] = useState(false);
    const [editingTw, setEditingTw] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    async function scrapeAndUpdate(ytUrl?: string, twUrl?: string) {
      const yt = ytUrl || script.youtubeUrl;
      const tw = twUrl || script.tweetUrl;
      if (!yt && !tw) return;
      setRefreshing(true);
      try {
        await fetch("/api/scrape-metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeUrl: yt, tweetUrl: tw, scriptId: script.id }),
        });
        // Always refresh — server saves directly to DB
        await fetchScripts();
      } catch { /* */ } finally {
        setRefreshing(false);
      }
    }

    function saveYt() {
      if (ytUrl !== script.youtubeUrl) {
        updateScript(script.id, { youtubeUrl: ytUrl });
        scrapeAndUpdate(ytUrl, undefined);
      }
      setEditingYt(false);
    }
    function saveTw() {
      if (twUrl !== script.tweetUrl) updateScript(script.id, { tweetUrl: twUrl });
      setEditingTw(false);
    }

    return (
      <div className="panel panel-interactive overflow-hidden">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[var(--text)] flex-1 pr-2">{script.title}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]">Posted</span>
          </div>

          {/* Hook preview */}
          {script.hook && (
            <p className="text-xs text-[var(--text-2)] mb-3 line-clamp-2">{script.hook}</p>
          )}

          {/* URLs */}
          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-2)] text-xs w-6">▶</span>
              {editingYt ? (
                <>
                  <input
                    type="text"
                    value={ytUrl}
                    onChange={e => setYtUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveYt(); if (e.key === "Escape") { setYtUrl(script.youtubeUrl || ""); setEditingYt(false); } }}
                    autoFocus
                    placeholder="YouTube URL..."
                    className={`flex-1 ${INPUT} px-3 py-1.5 text-xs`}
                  />
                  <button onClick={saveYt} className="text-xs text-[var(--up)] hover:opacity-80">✓</button>
                  <button onClick={() => { setYtUrl(script.youtubeUrl || ""); setEditingYt(false); }} className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)]">✕</button>
                </>
              ) : (
                <>
                  {ytUrl ? (
                    <a href={ytUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs text-[var(--accent)] hover:opacity-80 truncate">{ytUrl}</a>
                  ) : (
                    <span className="flex-1 text-xs text-[var(--text-4)]">No YouTube URL</span>
                  )}
                  <button onClick={() => setEditingYt(true)} className="text-[10px] px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text)] transition-colors">Edit</button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-2)] text-xs w-6">𝕏</span>
              {editingTw ? (
                <>
                  <input
                    type="text"
                    value={twUrl}
                    onChange={e => setTwUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveTw(); if (e.key === "Escape") { setTwUrl(script.tweetUrl || ""); setEditingTw(false); } }}
                    autoFocus
                    placeholder="Tweet URL..."
                    className={`flex-1 ${INPUT} px-3 py-1.5 text-xs`}
                  />
                  <button onClick={saveTw} className="text-xs text-[var(--up)] hover:opacity-80">✓</button>
                  <button onClick={() => { setTwUrl(script.tweetUrl || ""); setEditingTw(false); }} className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)]">✕</button>
                </>
              ) : (
                <>
                  {twUrl ? (
                    <a href={twUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs text-[var(--accent)] hover:opacity-80 truncate">{twUrl}</a>
                  ) : (
                    <span className="flex-1 text-xs text-[var(--text-4)]">No Tweet URL</span>
                  )}
                  <button onClick={() => setEditingTw(true)} className="text-[10px] px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text)] transition-colors">Edit</button>
                </>
              )}
            </div>
          </div>

          {/* Engagement stats */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {/* YouTube stats */}
            <div className="bg-[var(--surface-2)] rounded-[var(--r-md)] p-3 border border-[var(--line)]">
              <p className="eyebrow mb-2">▶ YouTube</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[11px] text-[var(--text-3)]">Views</span>
                  <span className="text-[11px] text-[var(--text)] font-medium num">{script.youtubeViews?.toLocaleString() ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-[var(--text-3)]">Likes</span>
                  <span className="text-[11px] text-[var(--text)] font-medium num">{script.youtubeLikes?.toLocaleString() ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-[var(--text-3)]">Comments</span>
                  <span className="text-[11px] text-[var(--text)] font-medium num">{script.youtubeComments?.toLocaleString() ?? "—"}</span>
                </div>
              </div>
            </div>
            {/* X stats */}
            <div className="bg-[var(--surface-2)] rounded-[var(--r-md)] p-3 border border-[var(--line)]">
              <p className="eyebrow mb-2">𝕏 Twitter</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[11px] text-[var(--text-3)]">Views</span>
                  <span className="text-[11px] text-[var(--text)] font-medium num">{script.tweetViews?.toLocaleString() ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-[var(--text-3)]">Likes</span>
                  <span className="text-[11px] text-[var(--text)] font-medium num">{script.tweetLikes?.toLocaleString() ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-[var(--text-3)]">Bookmarks</span>
                  <span className="text-[11px] text-[var(--text)] font-medium num">{script.tweetBookmarks?.toLocaleString() ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-[var(--text-3)]">Retweets</span>
                  <span className="text-[11px] text-[var(--text)] font-medium num">{script.tweetRetweets?.toLocaleString() ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-[var(--text-3)]">Replies</span>
                  <span className="text-[11px] text-[var(--text)] font-medium num">{script.tweetReplies?.toLocaleString() ?? "—"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {script.youtubeUrl && (
              <button
                onClick={() => scrapeAndUpdate()}
                disabled={refreshing}
                className={`${BTN_BASE} ${TONE.accent} disabled:opacity-40`}
              >{refreshing ? "Fetching..." : "Refresh Metrics"}</button>
            )}
            <button
              onClick={() => updateScript(script.id, { status: "filmed" })}
              className={`${BTN_BASE} ${TONE.ghost}`}
            >↩ Back to Filmed</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="ltr" className="space-y-6">
      <RejectModal />
      <PostModal />

      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">📹</span>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Long Form</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[9px] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--text-2)]">▶ YouTube</span>
            <span className="text-[9px] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--text-2)]">𝕏 Twitter</span>
          </div>
        </div>
        <span className="text-xs text-[var(--text-3)] ml-auto num">5-15 min · Teleprompter</span>
      </div>

      {/* Type Filter */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-[var(--text-3)]">Filter:</span>
        {(["all", "article", "video"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${typeFilter === t ? "border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]" : "text-[var(--text-3)] hover:text-[var(--text-2)] border border-[var(--line)]"}`}
          >
            {t === "all" ? "All" : t === "article" ? "📝 Articles" : "🎬 Videos"}
          </button>
        ))}
      </div>

      {/* Main Tabs */}
      <div className="flex items-center gap-0 border-b border-[var(--line)] overflow-x-auto">
        {([
          { key: "ideas" as const, label: "💡 Ideas", count: draftScripts.length },
          { key: "scripts" as const, label: "📜 Scripts", count: approvedScripts.length },
          { key: "tofilm" as const, label: "🎬 To Film", count: tofilmScripts.length },
          { key: "filmed" as const, label: "✅ Filmed", count: filmedScripts.length },
          { key: "posted" as const, label: "🚀 Posted", count: postedScripts.length },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            className={`text-sm px-4 py-2.5 font-medium transition-colors relative whitespace-nowrap ${activeView === tab.key ? "text-[var(--accent)]" : "text-[var(--text-3)] hover:text-[var(--text-2)]"}`}
          >
            {tab.label} (<span className="num">{tab.count}</span>)
            {activeView === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-full" />}
          </button>
        ))}
      </div>

      {/* IDEAS VIEW */}
      {activeView === "ideas" && (
        <div className="space-y-4">
          {/* Generate new */}
          <div className="panel p-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs text-[var(--text-3)]">Generate a new long-form script</p>
              <div className="flex gap-1 ml-auto">
                {(["article", "video"] as const).map(t => (
                  <button key={t} onClick={() => setNewType(t)}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${newType === t ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]" : "text-[var(--text-4)] hover:text-[var(--text-2)]"}`}
                  >{t === "article" ? "📝 Article" : "🎬 Video"}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={topicInput}
                onChange={e => setTopicInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") generateScript(); }}
                placeholder="e.g. How I built an AI content system from scratch..."
                className={`flex-1 ${INPUT} px-3 py-2 text-sm`}
              />
              <button
                onClick={generateScript}
                disabled={generating || !topicInput.trim()}
                className="btn-primary text-xs px-4 py-2 font-medium disabled:opacity-50 whitespace-nowrap"
              >{generating ? "Generating..." : "Generate Script"}</button>
            </div>
          </div>

          {/* Draft scripts */}
          <div className="space-y-3">
            {draftScripts.length === 0 && rejectedScripts.length === 0 ? (
              <div className="panel">
                <EmptyState icon={<span className="text-3xl">📹</span>} title="No draft scripts yet" hint="Generate one above or scripts will appear here" />
              </div>
            ) : (
              <>
                {draftScripts.length > 0 && (
                  <>
                    <p className="text-xs text-[var(--text-3)]">Pending review (<span className="num">{draftScripts.length}</span>)</p>
                    {draftScripts.map(s => <ScriptCard key={s.id} script={s} />)}
                  </>
                )}
                {rejectedScripts.length > 0 && (
                  <details className="mt-4">
                    <summary className="text-xs text-[var(--text-3)] cursor-pointer hover:text-[var(--text-2)] transition-colors">
                      Rejected (<span className="num">{rejectedScripts.length}</span>) ›
                    </summary>
                    <div className="mt-2">
                      {rejectedScripts.map(s => <ScriptCard key={s.id} script={s} compact />)}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* SCRIPTS VIEW */}
      {activeView === "scripts" && (
        <div className="space-y-3">
          {approvedScripts.length === 0 ? (
            <div className="panel">
              <EmptyState title="No approved scripts" />
            </div>
          ) : (
            approvedScripts.map(s => <ScriptCard key={s.id} script={s} />)
          )}
        </div>
      )}

      {/* TO FILM VIEW */}
      {activeView === "tofilm" && (
        <div className="space-y-3">
          {tofilmScripts.length === 0 ? (
            <div className="panel">
              <EmptyState icon={<span className="text-3xl">🎬</span>} title="No scripts queued for filming" hint="Approve scripts to move them here" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const text = tofilmScripts.map((s, i) => {
                      const lines = (s.fullScript || "").split("\n")
                        .filter(l => !l.startsWith("#") && !l.startsWith("*[") && !l.startsWith("---") && l.trim() !== "")
                        .join("\n");
                      return `Video ${i + 1}: ${s.title}\n${lines}`;
                    }).join("\n\n---\n\n");
                    navigator.clipboard.writeText(text);
                  }}
                  className={`text-xs px-4 py-2 rounded-[var(--r-md)] ${TONE.accent} transition-colors font-medium`}
                >Copy All Scripts (<span className="num">{tofilmScripts.length}</span>)</button>
                <button
                  onClick={async () => {
                    for (const s of tofilmScripts) {
                      await fetch("/api/longform", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: s.id, status: "filmed" }),
                      });
                    }
                    setScripts(prev => prev.map(s => s.status === "tofilm" ? { ...s, status: "filmed" } : s));
                  }}
                  className={`text-xs px-4 py-2 rounded-[var(--r-md)] ${TONE.up} transition-colors font-medium`}
                >Mark All as Filmed (<span className="num">{tofilmScripts.length}</span>)</button>
              </div>
              {tofilmScripts.map(s => <ScriptCard key={s.id} script={s} />)}
            </>
          )}
        </div>
      )}

      {/* FILMED VIEW */}
      {activeView === "filmed" && (
        <div className="space-y-3">
          {filmedScripts.length === 0 ? (
            <div className="panel">
              <EmptyState icon={<span className="text-3xl">✅</span>} title="No filmed scripts yet" />
            </div>
          ) : (
            filmedScripts.map(s => <ScriptCard key={s.id} script={s} compact />)
          )}
        </div>
      )}

      {/* POSTED VIEW */}
      {activeView === "posted" && (
        <div className="space-y-3">
          {postedScripts.length === 0 ? (
            <div className="panel">
              <EmptyState icon={<span className="text-3xl">🚀</span>} title="No posted videos yet" hint="Mark filmed scripts as posted to track engagement" />
            </div>
          ) : (
            postedScripts.map(s => <PostedCard key={s.id} script={s} />)
          )}
        </div>
      )}
    </div>
  );
}
