import type { components } from "./contracts.generated";

export type ExperimentConfig = components["schemas"]["ExperimentConfig"];
export type HealthResponse = components["schemas"]["HealthResponse"];
export type ContractValidation = components["schemas"]["ContractValidation"];
export type SimulationRequest = components["schemas"]["SimulationRequest"];
export type SimulationResult = components["schemas"]["SimulationResult"];
export type ControlAdjustment = components["schemas"]["ControlAdjustment"];
export type ScenarioConfig = components["schemas"]["ScenarioConfig"];
export type EvidenceProfile = components["schemas"]["EvidenceProfile"];
export type LiteratureSearch = components["schemas"]["LiteratureSearch"];
export type ResearchJob = components["schemas"]["ResearchJob"];
export type ResearchEvent = components["schemas"]["ResearchEvent"];
export type PaperSummary = components["schemas"]["PaperSummary"];
export type DemoSnapshot = components["schemas"]["DemoSnapshot"];
export type DrugAssessmentRequest = components["schemas"]["DrugAssessmentRequest"];
export type DrugAssessmentResponse = components["schemas"]["DrugAssessmentResponse"];

// Preparation records are metadata, not permission to run a simulation.
export type PreparationRequest = components["schemas"]["PreparationRequest"];
export type PreparationAnswers = components["schemas"]["PreparationAnswers"];
export type ResearchPreparation = components["schemas"]["ResearchPreparation"];
export type PreparationParameter = components["schemas"]["PreparationParameter"];
export type ModelPreparationRequirements = components["schemas"]["ModelPreparationRequirements"];

export type EvidenceSearchResult = components["schemas"]["EvidenceSearchResult"];
export type SourceRetrievalResult = components["schemas"]["SourceRetrievalResult"];
export type EvidenceSnapshot = components["schemas"]["EvidenceSnapshot"];
export type ParameterExtractionResult = components["schemas"]["ParameterExtractionResult"];

export type PreparationRecord = components["schemas"]["PreparationRecord"];
export type PreparationUpdate = components["schemas"]["PreparationUpdate"];
export type PreparationScope = components["schemas"]["PreparationScope"];
export type PreparationDesign = components["schemas"]["PreparationDesign"];
export type ConfiguredPreparation = components["schemas"]["ConfiguredPreparation"];
