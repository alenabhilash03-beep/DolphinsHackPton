"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { SharedExperiment } from "../lib/contracts";
import { useAuth } from "../lib/auth";
import { SignInPrompt } from "./AccountMenu";

/** Publish an immutable snapshot of the displayed investigation to the community feed. */
export function ShareExperiment({ resultId, defaultTitle, busy }: { resultId: string | null; defaultTitle: string; busy: boolean }) {
  const { enabled, user } = useAuth();
  const [open, setOpen] = useState(false), [title, setTitle] = useState(defaultTitle.slice(0, 160)), [note, setNote] = useState("");
  const [publishing, setPublishing] = useState(false), [shared, setShared] = useState<SharedExperiment | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => { setShared(null); setError(null); }, [resultId]);
  useEffect(() => { if (!open) setTitle(defaultTitle.slice(0, 160)); }, [defaultTitle, open]);
  if (!resultId) return null;
  async function publish(event: FormEvent) {
    event.preventDefault();
    setPublishing(true); setError(null);
    try {
      const response = await fetch("/api/shares", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ result_id: resultId, title: title.trim() || null, note: note.trim() || null, question: defaultTitle.slice(0, 700) || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Sharing failed. Try again.");
      setShared(data as SharedExperiment); setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Sharing failed. Try again."); }
    finally { setPublishing(false); }
  }
  const link = shared ? `/shared/${shared.share_id}` : null;
  return <section id="share" className="share-panel" aria-label="Share your experiment">
    <div className="share-heading"><div><p className="eyebrow">Community</p><h2>Share your experiment</h2>
      <p>Publish a read-only snapshot of this investigation: every step, its solver results, and an AI summary in which every statement cites the steps it comes from.</p></div>
      {!shared && !open && (!enabled || user) && <button type="button" className="primary-button" disabled={busy} onClick={() => setOpen(true)}>Share your experiment</button>}</div>
    <SignInPrompt action="share experiments with other researchers"/>
    {open && <form onSubmit={publish} className="share-form">
      <label>Title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)}/></label>
      <label>Note for readers (optional)<textarea maxLength={1000} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="What you were testing, or what you would try next"/></label>
      <div className="form-actions"><button className="primary-button" disabled={publishing}>{publishing ? "Publishing… writing the AI summary" : "Publish to community"}</button>
        <button type="button" className="quiet-button" disabled={publishing} onClick={() => setOpen(false)}>Cancel</button></div>
    </form>}
    {shared && link && <p className="share-done" role="status">Shared. <a href={link}>Open the shared page →</a> · <a href="/community">Community feed</a>
      {shared.ai_summary.status !== "grounded" && <span> · The AI summary was not published ({shared.ai_summary.status}); readers see the log summary.</span>}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
