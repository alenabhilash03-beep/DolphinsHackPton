'use client';
import {useState} from 'react';
import {ArrowUpRight, FileText} from 'lucide-react';
import {articleSummaries, plotLabel} from './article-summaries.mjs';

/** Draw attention to the graph a summary relates to without moving the reader away from the summary. */
function showPlot(id) {
  const plot = document.getElementById('plot-' + id);
  if (!plot) return;
  plot.scrollIntoView({block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  plot.classList.remove('is-linked'); void plot.offsetWidth; plot.classList.add('is-linked');
  setTimeout(() => plot.classList.remove('is-linked'), 1600);
}

/** Article summaries shown beside the main graph. */
export default function ArticleSummaries({turn, interpretation, experiment}) {
  const {kind, cards} = articleSummaries({turn, interpretation, experiment});
  const [open, setOpen] = useState(null);
  return <aside className="article-summaries" aria-label="Article summaries">
    <div className="article-summaries-heading">
      <h3>What the papers say</h3>
      <span>{kind === 'ai' ? 'AI summaries · each checked against a quoted passage' : kind === 'source' ? 'Reviewed summaries of the sources behind these inputs' : 'No articles for this result'}</span>
    </div>
    {!cards.length ? <p className="article-empty">Research a hypothesis and the agent will read papers and summarise them here, next to the graph they inform.</p>
      : <ol className="article-list">{cards.map(card => <li key={card.key} className="article-card" data-kind={card.kind}>
        <div className="article-title"><FileText size={14} aria-hidden="true"/>{card.url ? <a href={card.url} target="_blank" rel="noreferrer">{card.title}<ArrowUpRight size={12} aria-hidden="true"/></a> : <span>{card.title}</span>}</div>
        {(card.stance || card.access) && <div className="article-tags">{card.stance && <span>{card.stance}</span>}{card.access && <span data-access={card.access === 'Abstract only' ? 'abstract' : 'full'}>{card.access}</span>}</div>}
        <p className="article-summary">{card.summary}</p>
        {card.plots.length > 0 && <div className="article-plots">{card.plots.map(id => <button type="button" key={id} onClick={() => showPlot(id)}>{plotLabel(id)} →</button>)}</div>}
        {(card.quote || card.note || card.limitation) && <details open={open === card.key} onToggle={event => setOpen(event.currentTarget.open ? card.key : null)}>
          <summary>{card.quote ? 'Quoted passage' : 'How it is used'}</summary>
          {card.quote && <blockquote>“{card.quote}”<small>{card.locator}</small></blockquote>}
          {card.note && <p>{card.note}</p>}
          {card.limitation && <p className="article-limit">{card.limitation}</p>}
        </details>}
      </li>)}</ol>}
  </aside>;
}
