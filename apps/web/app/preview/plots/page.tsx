import { PlotPreview } from "../../../components/PlotPreview";
import { example } from "../../../lib/example.generated";

export default function PlotsPreviewPage() {
  return <PlotPreview initialExperiment={example} />;
}
