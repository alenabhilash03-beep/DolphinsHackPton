"""Run validated experiment scenarios through the same deterministic model."""

from dataclasses import dataclass

from app.schemas.contracts import ExperimentConfig, ScenarioMetrics
from app.simulation.metrics import calculate_metrics
from app.simulation.pk import compile_pk
from app.simulation.solver import BindingTrajectory, solve_binding


@dataclass(frozen=True)
class ScenarioComputation:
    scenario_id: str
    trajectory: BindingTrajectory
    metrics: ScenarioMetrics


def compare_experiment(experiment: ExperimentConfig, *, deadline: float | None = None) -> tuple[ScenarioComputation, ...]:
    """Preserve scenario order; all scenarios share the experiment horizon and q."""
    if not isinstance(experiment, ExperimentConfig):
        raise TypeError("A validated ExperimentConfig is required")
    results: list[ScenarioComputation] = []
    for scenario in experiment.scenarios:
        pk = compile_pk(
            scenario.pk,
            scenario.molecular_weight_g_mol,
            scenario.administration,
            experiment.duration_h,
            initial_amount_nmol=scenario.initial_amount_nmol,
            allow_hypothetical_bolus=experiment.mode == "custom",
        )
        trajectory = solve_binding(
            pk,
            scenario.binding,
            scenario.exposure_factor,
            initial_occupancy=scenario.initial_occupancy,
            deadline=deadline,
        )
        results.append(ScenarioComputation(scenario.scenario_id, trajectory, calculate_metrics(trajectory, experiment.occupancy_threshold)))
    return tuple(results)
