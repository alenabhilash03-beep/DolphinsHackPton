import { ResearchEntrance } from "../components/ResearchEntrance";
import { HypothesisWorkspace } from "../components/HypothesisWorkspace";
import { example } from "../lib/example.generated";

export default function Home() {
  return (
    <>
      <ResearchEntrance />
      <HypothesisWorkspace fallbackExperiment={example} />
    </>
  );
}
