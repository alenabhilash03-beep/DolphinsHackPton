/** Display text for machine values: parameter keys, enum codes, source locators, recorded changes. Pure. */ import { parameterLabel } from "./investigation.js";
/** "conditional_transfer" → "conditional transfer". */ export function humanize(value) {
    return (value ?? "").replace(/_/g, " ");
}
const KEY = /\b(?:pk|binding)\.[A-Za-z_]+\b|\b(?:molecular_weight(?:_g_mol)?|body_mass_kg|exposure_factor|duration_h|occupancy_threshold|effective_half_life|dosing_interval_h|initial_amount_nmol)\b/g;
const SUP = {
    "-": "⁻",
    "+": "",
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹"
};
const superscript = (digits)=>[
        ...digits.replace(/^\+/, "").replace(/^(-?)0+(?=\d)/, "$1")
    ].map((c)=>SUP[c] ?? c).join("");
/** Free text with parameter keys, snake_case codes, caret units and e-notation made readable. */ export function readableText(text) {
    return (text ?? "").replace(KEY, (key, offset, whole)=>{
        const label = parameterLabel(key);
        // Mid-sentence names read in lower case ("inputs: molecular weight"); acronyms such as "KD" keep theirs.
        const sentenceStart = offset === 0 || /[.!?]\s+$/.test(whole.slice(0, offset));
        return sentenceStart || /^[A-Z]{2}/.test(label) ? label : label[0].toLowerCase() + label.slice(1);
    }).replace(/\b[a-z]+(?:_[a-z]+)+\b/g, humanize).replace(/\b(\d+(?:\.\d+)?)e([+-]?\d+)\b/g, (_, mantissa, exponent)=>`${mantissa} × 10${superscript(exponent)}`).replace(/([A-Za-zµμ])\^(-?\d+)/g, (_, base, power)=>base + superscript(power));
}
/** "full_text:block-36:0" → "Full text, passage 36"; "abstract:0" → "Abstract"; other locators unchanged. */ export function locatorLabel(locator) {
    const value = (locator ?? "").trim();
    const block = /^full_text:block-(\d+)(?::\d+)?$/.exec(value);
    if (block) return `Full text, passage ${block[1]}`;
    if (/^abstract(?::\d+)?$/.test(value)) return "Abstract";
    return readableText(value);
}
/** Unique readable locators, in order. */ export function locatorList(locators) {
    return [
        ...new Set((locators ?? []).map(locatorLabel))
    ].join(", ");
}
/** "comparison: duration_h = 2880" → "Observation window: 2,880 h (120 days)". */ export function changeLabel(change) {
    const match = /^(.+?):\s*([A-Za-z_.0-9]+)\s*=\s*(.+)$/.exec(change.trim());
    if (!match) return readableText(change);
    const [, scope, path, raw] = match;
    const value = Number(raw);
    const where = scope === "comparison" || scope === "whole comparison" ? "" : ` (${humanize(scope)})`;
    if (Number.isFinite(value)) {
        if (/duration_h$|_h$/.test(path) && !path.includes("inv")) return `${parameterLabel(path)}${where}: ${value.toLocaleString("en-US")} h (${+(value / 24).toFixed(1)} days)`;
        if (path === "occupancy_threshold") return `${parameterLabel(path)}${where}: ${+(value * 100).toFixed(1)}%`;
        return `${parameterLabel(path)}${where}: ${value.toLocaleString("en-US", {
            maximumSignificantDigits: 6
        })}`;
    }
    return `${parameterLabel(path)}${where}: ${readableText(raw)}`;
}
const TRACE = {
    recorded_replay: "Agent trace",
    traced: "LangSmith trace",
    not_configured: "Not traced",
    failed: "Trace unavailable"
};
export function traceLabel(status) {
    return status ? TRACE[status] ?? humanize(status) : "Not available yet";
}
