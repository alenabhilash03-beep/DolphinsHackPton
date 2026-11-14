import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(read("contracts/experiment.schema.json"));
const example = read("data/examples/contract-experiment.json");
assert(validate(example), JSON.stringify(validate.errors));
const badUnits = structuredClone(example);
badUnits.scenarios[0].pk.volume_L = "2.62 L";
assert.equal(validate(badUnits), false, "A unit-bearing string must not pass as canonical numeric data");
const badSupport = structuredClone(example);
badSupport.support.status = "trust_me";
assert.equal(validate(badSupport), false);
console.log("JavaScript validates the shared example and rejects invalid canonical data.");
console.log("Cross-field scientific and provenance checks are authoritative on the Python server.");

const validatePreparation = ajv.compile(read("contracts/preparation.schema.json"));
for (const [name, preparation] of Object.entries(read("data/examples/preparation-contracts.json"))) {
  assert(validatePreparation(preparation), `${name}: ${JSON.stringify(validatePreparation.errors)}`);
}
const missingUnit = structuredClone(read("data/examples/preparation-contracts.json").complete_unregistered);
delete missingUnit.parameters[0].unit;
assert.equal(validatePreparation(missingUnit), false);
const falseAuthorization = structuredClone(read("data/examples/preparation-contracts.json").complete_unregistered);
falseAuthorization.runnable = true;
assert.equal(validatePreparation(falseAuthorization), false);
console.log("Preparation examples validate; missing units and false execution authorization are rejected.");
