/** Plotly-ready scientific chart specifications from one aligned SimulationResult. */ const PALETTE = [
    "#d1c7bd",
    "#cb9399",
    "#aab8a1",
    "#43856c",
    "#a45479"
];
export function scenarioColor(scenarioId, index) {
    if (scenarioId === "baseline") return "#d1c7bd";
    if (scenarioId === "half_life_x3") return "#cb9399";
    if (scenarioId === "affinity_x10") return "#aab8a1";
    return PALETTE[index % PALETTE.length];
}
export function buildScientificPlot(result, kind, cursorTimeHours, options = {}) {
    const horizon = result.configuration.duration_h;
    const xDays = result.time_h.map((hour)=>hour / 24);
    const labels = new Map(result.configuration.scenarios.map((scenario)=>[
            scenario.scenario_id,
            scenario.label
        ]));
    const data = [];
    result.scenarios.forEach((scenario, index)=>{
        const color = scenarioColor(scenario.scenario_id, index);
        const label = labels.get(scenario.scenario_id) ?? scenario.scenario_id;
        const scenarioConfig = result.configuration.scenarios[index];
        const cuts = kind === "concentration" ? scenarioConfig.administration.filter((event)=>event.kind === "hypothetical_bolus" && event.start_h > 0 && event.start_h < horizon).map((event)=>result.time_h.indexOf(event.start_h)).filter((cut)=>cut > 0 && cut < result.time_h.length).sort((a, b)=>a - b) : [];
        const spans = [
            0,
            ...new Set(cuts),
            result.time_h.length
        ];
        const addLine = (name, values, width, dash)=>{
            for(let segment = 0; segment < spans.length - 1; segment++){
                const start = spans[segment];
                const end = spans[segment + 1];
                if (end <= start) continue;
                data.push({
                    type: "scatter",
                    mode: "lines",
                    name,
                    legendgroup: name,
                    showlegend: segment === 0,
                    x: xDays.slice(start, end),
                    y: values.slice(start, end),
                    line: {
                        color,
                        width,
                        dash
                    },
                    hovertemplate: kind === "concentration" ? "%{x:.2f} d · %{y:.3g} nM<extra>%{fullData.name}</extra>" : "%{x:.2f} d · %{y:.2f}%<extra>%{fullData.name}</extra>"
                });
            }
        };
        addLine(kind === "concentration" ? `${label} · central` : label, kind === "concentration" ? scenario.central_concentration_nM : scenario.occupancy.map((fraction)=>fraction * 100), 2.5, "solid");
        if (kind === "concentration" && options.showTargetSite) {
            addLine(`${label} · prescribed site`, scenario.target_site_concentration_nM, 1.8, "dash");
        }
    });
    const eventTimes = [
        ...new Set(result.configuration.scenarios.flatMap((scenario)=>scenario.administration.map((event)=>event.start_h).filter((time)=>time >= 0 && time <= horizon)))
    ].sort((a, b)=>a - b);
    const boundaryTimes = result.diagnostics.event_boundaries_h.filter((time)=>time > 0 && time < horizon);
    const cursor = Math.max(0, Math.min(horizon, cursorTimeHours)) / 24;
    const shapes = boundaryTimes.slice(0, 64).map((time)=>({
            type: "line",
            xref: "x",
            yref: "paper",
            x0: time / 24,
            x1: time / 24,
            y0: 0,
            y1: 1,
            line: {
                color: "#d1c7bd26",
                width: 1,
                dash: "dot"
            }
        }));
    if (options.cursor !== false) {
        shapes.push({
            type: "line",
            xref: "x",
            yref: "paper",
            x0: cursor,
            x1: cursor,
            y0: 0,
            y1: 1,
            line: {
                color: "#cb9399",
                width: 1.5,
                dash: "dash"
            }
        });
    }
    if (kind === "occupancy") {
        const thresholdPercent = result.configuration.occupancy_threshold * 100;
        shapes.push({
            type: "line",
            xref: "paper",
            yref: "y",
            x0: 0,
            x1: 1,
            y0: thresholdPercent,
            y1: thresholdPercent,
            line: {
                color: "#b9ada2",
                width: 1,
                dash: "dot"
            }
        });
    }
    if (eventTimes.length > 0) {
        data.push({
            type: "scatter",
            mode: "markers",
            name: "Dose starts",
            x: eventTimes.map((time)=>time / 24),
            y: eventTimes.map(()=>0),
            marker: {
                color: "#68727a",
                size: 8,
                symbol: "triangle-up"
            },
            text: eventTimes.map((time)=>{
                const names = result.configuration.scenarios.filter((scenario)=>scenario.administration.some((event)=>event.start_h === time)).map((scenario)=>labels.get(scenario.scenario_id) ?? scenario.scenario_id);
                return `Dose start: ${names.join(", ")}`;
            }),
            hovertemplate: "%{text}<br>%{x:.2f} d<extra></extra>"
        });
    }
    return {
        data,
        layout: {
            autosize: true,
            paper_bgcolor: "#302b27",
            plot_bgcolor: "#302b27",
            font: {
                family: "Geist, Arial, sans-serif",
                color: "#b9ada2",
                size: 10
            },
            height: 355,
            margin: {
                l: 55,
                r: 10,
                t: 12,
                b: 112
            },
            legend: {
                orientation: "h",
                x: 0,
                y: -0.28,
                xanchor: "left",
                yanchor: "top",
                font: {
                    size: 9
                }
            },
            hovermode: "x unified",
            showlegend: true,
            uirevision: result.configuration.experiment_id,
            xaxis: {
                title: {
                    text: "Time (days)"
                },
                range: [
                    0,
                    horizon / 24
                ],
                zeroline: false
            },
            yaxis: kind === "concentration" ? {
                title: {
                    text: "Central concentration (nM)"
                },
                rangemode: "tozero",
                zeroline: false
            } : {
                title: {
                    text: "Target occupancy (%)"
                },
                range: [
                    0,
                    100
                ],
                zeroline: false
            },
            shapes
        },
        config: {
            responsive: true,
            displaylogo: false,
            scrollZoom: true
        }
    };
}
