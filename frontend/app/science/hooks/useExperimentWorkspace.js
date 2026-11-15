"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { adjustAndSimulate, simulate } from "../lib/simulation-client.js";
import { editableScenarioIds } from "../lib/workspace-state.js";
import { WorkspaceController } from "../lib/workspace-controller.js";
/** Headless workspace API; pass a stable initialExperiment object. */ export function useExperimentWorkspace(initialExperiment, outputPoints = 1000, initialResult = null) {
    const controller = useMemo(()=>new WorkspaceController(initialExperiment, outputPoints, {
            simulate,
            adjust: adjustAndSimulate
        }, 150, ()=>performance.now(), initialResult), [
        initialExperiment,
        outputPoints,
        initialResult
    ]);
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    useEffect(()=>{
        void controller.start();
        return ()=>controller.stop();
    }, [
        controller
    ]);
    return {
        ...snapshot,
        editableScenarioIds: editableScenarioIds(snapshot.experiment),
        baseline: snapshot.experiment.scenarios[0],
        alternatives: snapshot.experiment.scenarios.slice(1),
        selectAlternative: (scenarioId)=>controller.selectAlternative(scenarioId),
        applyControl: (field, value)=>controller.applyControl(field, value),
        resetToInitial: ()=>controller.resetToInitial(),
        refresh: ()=>controller.refresh()
    };
}
