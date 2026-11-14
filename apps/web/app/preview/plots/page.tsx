import { HypothesisWorkspace } from "../../../components/HypothesisWorkspace";
import { example } from "../../../lib/example.generated";

export default function PlotsPreviewPage() {
  return <HypothesisWorkspace fallbackExperiment={example} />;
}
