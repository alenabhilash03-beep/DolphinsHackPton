"use client";
/**
 * Delve deeper: one paper, read on the left (a PDF rendered from its open-access text) and discussed on the
 * right with Nemotron, which answers only from that article's text and names the section it used.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ListedPaper } from "../lib/paper-list";

interface Message { role: "user" | "assistant"; content: string; failed?: boolean }
const STARTERS = [
  "Summarise the key findings in three bullet points",
  "Which parameter values does it report, and where?",
  "What are the main limitations of this study?",
];

export function PaperReader({ paper, onClose }: { paper: ListedPaper; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<"loading" | "ready" | "failed">("loading");
  const [kind, setKind] = useState<string | null>(null);
  const [title, setTitle] = useState(paper.title);
  const log = useRef<HTMLOListElement>(null);
  const key = paper.key!;

  useEffect(() => {
    setMessages([]); setPdf("loading"); setKind(null); setTitle(paper.title);
    // Some browsers never fire load for a framed PDF; never leave the overlay over a rendered document.
    const timer = window.setTimeout(() => setPdf(state => state === "loading" ? "ready" : state), 6000);
    return () => window.clearTimeout(timer);
  }, [key]);
  useEffect(() => {
    // Warm the article (and learn whether it is full text or abstract only) while the PDF renders.
    let live = true;
    fetch(`/api/papers/${key}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => { if (live && data) { setKind(data.content_kind); if (typeof data.title === "string" && data.title) setTitle(data.title); } }).catch(() => {});
    return () => { live = false; };
  }, [key]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const history = [...messages.filter(m => !m.failed), { role: "user" as const, content: text }];
    setMessages([...messages, { role: "user", content: text }]);
    setDraft("");
    setBusy(true);
    try {
      const response = await fetch(`/api/papers/${key}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ messages: history.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : typeof data.error === "string" ? data.error : "Nemotron is unavailable. Please ask again.");
      setMessages(current => [...current, { role: "assistant", content: data.answer }]);
    } catch (error) {
      setMessages(current => [...current, { role: "assistant", content: error instanceof Error ? error.message : "Nemotron is unavailable.", failed: true }]);
    } finally { setBusy(false); }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void ask(draft); };

  return <section className="paper-reader" aria-label={`Reading ${paper.title}`}>
    <div className="paper-reader-doc">
      <header className="paper-reader-head">
        <div><p className="paper-reader-eyebrow">{paper.identifiers.join(" · ")}{kind === "abstract" ? " · abstract only" : kind === "full_text" ? " · open-access full text" : ""}</p><h2>{title}</h2></div>
        <div className="paper-reader-actions">
          {paper.url && <a className="quiet-button" href={paper.url} target="_blank" rel="noreferrer">Original ↗</a>}
          <a className="quiet-button" href={`/api/papers/${key}/pdf`} target="_blank" rel="noreferrer">Open PDF</a>
          <button type="button" className="quiet-button" onClick={onClose}>Close reader</button>
        </div>
      </header>
      <div className="paper-reader-frame" data-state={pdf}>
        <iframe key={key} title={`PDF of ${paper.title}`} src={`/api/papers/${key}/pdf#view=FitH&toolbar=1`} onLoad={() => setPdf("ready")} onError={() => setPdf("failed")}/>
        {pdf === "loading" && <div className="paper-reader-loading" role="status"><span/><p>Rendering the article from its open-access text…</p></div>}
      </div>
      <p className="paper-reader-note">Rendered by Hypothesim from the open-access text on Europe PMC (the publisher PDF cannot be embedded). Use “Original” for the publisher’s version.</p>
    </div>
    <aside className="paper-chat" aria-label="Ask about this paper">
      <header><span className="agent-mark" aria-hidden="true">N</span><div><h3>Ask about this paper</h3><p>NVIDIA Nemotron · answers only from this article</p></div></header>
      <ol ref={log} className="paper-chat-log" aria-live="polite">
        {!messages.length && <li className="paper-chat-intro"><p>Ask anything about the methods, results or numbers in this article. Answers name the section they come from and say so when the article does not cover something.</p>
          <div className="paper-chat-starters">{STARTERS.map(starter => <button type="button" key={starter} disabled={busy} onClick={() => void ask(starter)}>{starter}<span aria-hidden="true">↗</span></button>)}</div></li>}
        {messages.map((message, index) => <li key={index} className="paper-chat-message" data-role={message.role} data-failed={message.failed || undefined}>
          <span className="paper-chat-who">{message.role === "user" ? "You" : "Nemotron"}</span>
          <div>{message.content.split(/\n{1,}/).filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}</div>
        </li>)}
        {busy && <li className="paper-chat-message" data-role="assistant"><span className="paper-chat-who">Nemotron</span><div className="paper-chat-typing" aria-label="Nemotron is reading the article"><i/><i/><i/></div></li>}
      </ol>
      <form className="paper-chat-form" onSubmit={submit}>
        <textarea rows={2} value={draft} maxLength={4000} placeholder="Ask a question about this article…" aria-label="Question about this article" disabled={busy}
          onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(draft); } }}/>
        <button className="primary-button" disabled={busy || !draft.trim()}>{busy ? "Reading…" : "Ask"}<span aria-hidden="true">↗</span></button>
      </form>
      <p className="paper-chat-note">AI answers can be wrong; check the quoted section in the PDF.</p>
    </aside>
  </section>;
}

/** The Evidence tab's paper list with a "Delve deeper" action per paper. */
export function PaperList({ papers, onOpen }: { papers: ListedPaper[]; onOpen: (paper: ListedPaper) => void }) {
  if (!papers.length) return null;
  return <section className="paper-list" aria-label="Papers">
    <div className="paper-list-head"><h2>Papers</h2><p>Open any paper to read it and ask Nemotron about it.</p></div>
    <ul>{papers.map(paper => <li key={paper.id}>
      <div className="paper-list-text">
        <span className="paper-list-tags"><span>{paper.origin === "agent" ? "Read by the agent" : "Model input source"}</span>{paper.access && <span>{paper.access}</span>}</span>
        <strong>{paper.title}</strong>
        {paper.identifiers.length > 0 && <small>{paper.identifiers.join(" · ")}</small>}
        {paper.usedFor && <p>{paper.usedFor}</p>}
      </div>
      <div className="paper-list-actions">
        {paper.key ? <button type="button" className="primary-button" onClick={() => onOpen(paper)}>Delve deeper<span aria-hidden="true">→</span></button>
          : <span className="paper-list-unavailable">No open text on Europe PMC</span>}
        {paper.url && <a href={paper.url} target="_blank" rel="noreferrer">Original ↗</a>}
      </div>
    </li>)}</ul>
  </section>;
}
