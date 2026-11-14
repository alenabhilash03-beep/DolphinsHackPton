import { HypothesisWorkspace } from "../components/HypothesisWorkspace";
import { example } from "../lib/example.generated";

export default function Home() {
  return <HypothesisWorkspace fallbackExperiment={example} />;
}
