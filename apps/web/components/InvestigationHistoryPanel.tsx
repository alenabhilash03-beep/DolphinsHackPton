"use client";

import type { InvestigationHistory } from "../lib/contracts";
import { historyRows } from "../lib/history-view";

/** Every stored step of this investigation. Reopening shows a stored result exactly as computed; nothing is rerun. */
export function InvestigationHistoryPanel({ history, shownId, busy, branch, onReopen }: {
  history: InvestigationHistory | null; shownId: string | null; busy: boolean; branch: boolean; onReopen: (resultId: string) => void }) {
  const rows = historyRows(history, shownId);
  if (rows.length < 2) return null;
  return <section id="history" className="history-panel" aria-label="Investigation history">
    <details open><summary><span><span className="eyebrow">Investigation history</span><strong>{rows.length} steps{history?.question ? ` · ${history.question}` : ""}</strong></span></summary>
      {branch && <p className="history-branch" role="status"><strong>You are viewing an earlier version.</strong> An experiment was already run from it. A change in words or a follow-up experiment from here starts a new branch; nothing earlier is overwritten.</p>}
      <ol className="history-steps">{rows.map(row => <li key={row.resultId} data-displayed={row.displayed} style={{ marginLeft: Math.min(row.depth, 6) * 18 }}>
        <div className="history-head"><span className="history-kind">{row.step} · {row.kind}</span><strong>{row.title}</strong>
          {row.displayed ? <span className="history-current">Displayed</span> : <button type="button" disabled={busy} onClick={() => onReopen(row.resultId)}>Reopen</button>}</div>
        <p className="history-design">{row.design}{row.evidence ? ` · ${row.evidence}` : ""}{row.branches > 1 ? ` · ${row.branches} branches from here` : ""}</p>
        {row.changes.length > 0 && <p className="history-changes">Changed: {row.changes.join("; ")}</p>}
        <ul>{row.outcomes.map((outcome, index) => <li key={index}>{outcome}</li>)}</ul>
        {row.finding && <p className="history-finding"><span>{row.verdict}</span> {row.finding}</p>}
      </li>)}</ol>
      {history?.truncated && <p className="answer-access-note">This investigation has more steps than are listed here.</p>}
    </details>
  </section>;
}
