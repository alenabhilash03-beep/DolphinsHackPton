export const TARGET_SITES = 40;
export const CONCENTRATION_SCALE_NM = 1500;
export const MAX_FREE_PARTICLES = 80;
export function schematicState(result, index, scenarioId) {
    const series = result.scenarios.find((item)=>item.scenario_id === scenarioId) ?? result.scenarios[0];
    const i = Math.max(0, Math.min(result.time_h.length - 1, Math.round(index)));
    const concentration = series.target_site_concentration_nM[i];
    const occupancy = series.occupancy[i];
    return {
        timeHours: result.time_h[i],
        concentration,
        occupancy,
        occupiedSites: Math.round(occupancy * TARGET_SITES),
        freeParticles: Math.round(Math.min(1, concentration / CONCENTRATION_SCALE_NM) * MAX_FREE_PARTICLES),
        clipped: concentration > CONCENTRATION_SCALE_NM,
        label: result.configuration.scenarios.find((item)=>item.scenario_id === series.scenario_id)?.label ?? series.scenario_id
    };
}
