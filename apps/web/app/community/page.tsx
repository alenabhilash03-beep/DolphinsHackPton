"use client";
import { useEffect, useState } from "react";
import type { ShareListItem } from "../../lib/contracts";
import { useAuth } from "../../lib/auth";
import { CommunityShell, VERDICT_LABEL, formatDate } from "../../components/CommunityShell";
import { SignInPrompt } from "../../components/AccountMenu";

export default function CommunityPage() {
  const { ready, user, enabled } = useAuth();
  const [items, setItems] = useState<ShareListItem[] | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || (enabled && !user)) return;
    fetch("/api/shares", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The community feed is unavailable.");
      setItems(data.items as ShareListItem[]);
    }).catch(e => setError(e instanceof Error ? e.message : "The community feed is unavailable."));
  }, [ready, user, enabled]);
  return <CommunityShell>
    <div className="workspace-intro"><div><p className="eyebrow">Community</p><h1>Shared experiments</h1>
      <p>Investigations other researchers have published: what they asked, what the agent found, and how each follow-up changed the answer. Every AI summary cites the log it comes from.</p></div></div>
    <SignInPrompt action="browse shared experiments"/>
    {error && <p role="alert">{error}</p>}
    {items && !items.length && <section className="research-panel"><h2>No shared experiments yet</h2><p>Run an investigation in the <a href="/">workspace</a>, then use <strong>Share your experiment</strong> to publish it here.</p></section>}
    {items && !!items.length && <ul className="community-feed">{items.map(item => <li key={item.share_id}><a href={`/shared/${item.share_id}`} className="community-card">
      <span className="eyebrow">{item.drug} → {item.target}</span>
      <strong>{item.title}</strong>
      {item.headline ? <p>{item.headline}</p> : <p className="community-question">{item.question}</p>}
      <span className="community-meta">{item.owner.avatar_url && <img src={item.owner.avatar_url} alt="" width={18} height={18} referrerPolicy="no-referrer"/>}
        {item.is_owner ? "You" : item.owner.name} · {formatDate(item.created_at)} · {item.step_count} step{item.step_count === 1 ? "" : "s"}
        {item.verdict && <span className="community-verdict" data-verdict={item.verdict}>{VERDICT_LABEL[item.verdict]}</span>}</span>
    </a></li>)}</ul>}
  </CommunityShell>;
}
