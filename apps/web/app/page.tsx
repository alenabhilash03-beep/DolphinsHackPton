import { FoundationStatus } from "../components/FoundationStatus";
import { example } from "../lib/example.generated";

export default function Home() {
  return <main className="mx-auto max-w-6xl px-6 py-8 sm:px-10 sm:py-12">
    <header className="flex items-center justify-between border-b border-[#d7e1d4] pb-6">
      <a href="/" className="text-xl font-semibold tracking-tight">hypothesim<span className="text-[#78936b]">.</span></a>
      <span className="rounded-full bg-[#e5ecde] px-3 py-1.5 text-xs font-medium tracking-wide">ENGINE PREVIEW</span>
    </header>
    <section className="max-w-3xl pb-10 pt-14 sm:pt-20">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6c8066]">Science + Discovery</p>
      <h1 className="mt-5 text-4xl font-medium leading-tight tracking-tight sm:text-6xl">Make a hypothesis.<br /><span className="text-[#688761]">Explore what follows.</span></h1>
      <p className="mt-6 max-w-xl text-base leading-7 text-[#637168]">A scientific workspace for comparing how drug exposure and binding assumptions change predicted target occupancy.</p>
    </section>
    <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div><a href="/preview/plots" className="mb-5 inline-block rounded-xl bg-[#245e53] px-6 py-3 font-semibold text-white">Open the simulation workspace →</a><FoundationStatus /></div>
      <section className="rounded-2xl border border-[#d7e1d4] bg-[#edf2e8] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6c8066]">First experiment · configuration example</p>
        <h2 className="mt-4 text-2xl font-medium">Trastuzumab × HER2</h2>
        <p className="mt-4 leading-7">Would tripling half-life maintain occupancy longer than improving affinity tenfold?</p>
        <ul className="mt-6 space-y-3 text-sm">{example.scenarios.map(s => <li key={s.scenario_id} className="flex items-center gap-3"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#78936b]" />{s.label}</li>)}</ul>
        <p className="mt-6 border-t border-[#d4decf] pt-5 text-xs leading-6 text-[#637168]">Conditional exploratory model. The numerical engine can compute trajectories through the API; this page does not yet graph them. Predicted occupancy is not measured tumor occupancy.</p>
      </section>
    </div>
    <footer className="mt-12 text-xs text-[#788274]">Evidence before prediction. Assumptions kept visible.</footer>
  </main>;
}
