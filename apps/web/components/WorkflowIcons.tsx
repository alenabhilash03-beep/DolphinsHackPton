/** Line icons for the agent-workflow screen. 24×24, stroke = currentColor. */
import type { StageId } from "../lib/agent-workflow";

const base = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const StageIcon = ({ id, size = 24 }: { id: StageId; size?: number }) => {
  const props = { ...base, width: size, height: size };
  switch (id) {
    case "question": return <svg {...props}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>;
    case "search": return <svg {...props}><rect x="3.5" y="3.5" width="10" height="13" rx="1.5"/><path d="M6 7h5M6 10h4"/><circle cx="15.5" cy="15" r="3.5"/><path d="m18 17.5 3 3"/></svg>;
    case "reading": return <svg {...props}><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z"/><path d="M12 6.5v13"/></svg>;
    case "extraction": return <svg {...props}><path d="M5 3.5h9l4 4v13H5z"/><path d="M14 3.5v4h4"/><path d="M8 11h7" strokeWidth="3" stroke="currentColor" opacity=".35"/><path d="M8 15h5"/><path d="m16.5 16.5 4 0m-1.5-1.5 1.5 1.5-1.5 1.5"/></svg>;
    case "model": return <svg {...props}><rect x="3" y="8" width="7" height="8" rx="2"/><rect x="14" y="8" width="7" height="8" rx="2"/><path d="M10 11h4m-1.5-1.5L14 11l-1.5 1.5M14 14h-4m1.5 1.5L10 14l1.5-1.5"/><path d="M6.5 8V5M17.5 16v3"/></svg>;
    case "simulation": return <svg {...props}><path d="M3.5 20.5h17M3.5 20.5v-17"/><path d="M5 7c3 0 4 1 6 4s4 6 9 6"/><path d="M5 5.5c4 0 6 .5 8 1.5s4 2 7 2" opacity=".55"/></svg>;
    case "structure": return <svg {...props}><circle cx="6" cy="7" r="2"/><circle cx="17" cy="5.5" r="2"/><circle cx="12" cy="12.5" r="2.2"/><circle cx="6.5" cy="18" r="2"/><circle cx="18" cy="17" r="2"/><path d="m7.6 8.3 2.8 2.8M15.6 6.8l-2.5 4M10.6 14.1l-2.6 2.4M14 13.6l2.4 2"/></svg>;
    case "answer": return <svg {...props}><path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z"/><path d="m8.8 12 2.2 2.2 4.4-4.6"/></svg>;
  }
};

export const AgentIcon = ({ size = 22 }: { size?: number }) => <svg {...base} width={size} height={size}>
  <rect x="4.5" y="6.5" width="15" height="12" rx="3.5"/><path d="M12 6.5V3.5M9 12h.01M15 12h.01M9.5 15.5h5"/><circle cx="12" cy="3" r="1"/><path d="M2.5 11v3M21.5 11v3"/></svg>;

export const DocIcon = ({ size = 18 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h4"/></svg>;
export const CheckIcon = ({ size = 14 }: { size?: number }) => <svg {...base} width={size} height={size} strokeWidth={2.2}><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>;
export const CrossIcon = ({ size = 14 }: { size?: number }) => <svg {...base} width={size} height={size} strokeWidth={2.2}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>;
export const ArrowIcon = ({ size = 16 }: { size?: number }) => <svg {...base} width={size} height={size}><path d="M4 12h15m-5-5 5 5-5 5"/></svg>;
