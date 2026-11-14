import assert from "node:assert/strict";
import test from "node:test";

import { example } from "../lib/example.generated.ts";
import { WorkspaceController } from "../lib/workspace-controller.ts";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function response(request, suffix = "") {
  return {
    result_id: `result-${request.client_revision}${suffix}`,
    client_revision: request.client_revision,
    configuration: structuredClone(request.experiment),
    time_h: [0, 1], scenarios: [], diagnostics: {}, warnings: [],
  };
}

test("agent result loads without another simulation and later edits use the direct solver", async () => {
  const prepared = response({ experiment: example, client_revision: 0 }, "agent");
  let simulations = 0;
  let adjustments = 0;
  const controller = new WorkspaceController(example, 100, {
    simulate: async (request) => { simulations++; return response(request); },
    adjust: async (request) => { adjustments++; return response(request, "edited"); },
  }, 5, () => performance.now(), prepared);
  assert.equal(await controller.start(), true);
  assert.equal(simulations, 0);
  assert.equal(controller.getSnapshot().result.result_id, "result-0agent");
  assert.equal(await controller.applyControl("binding.affinity_nM", 0.05), true);
  assert.equal(adjustments, 1);
  assert.notEqual(controller.getSnapshot().result.result_id, prepared.result_id);
});

test("rapid same-field edits coalesce to one latest server request", async () => {
  const calls = [];
  const controller = new WorkspaceController(example, 100, {
    simulate: async (request) => response(request),
    adjust: async (request) => { calls.push(request); return response(request, String(request.value)); },
  }, 10);
  assert.equal(await controller.start(), true);
  const first = controller.applyControl("binding.affinity_nM", .1);
  const second = controller.applyControl("binding.affinity_nM", .05);
  const last = controller.applyControl("binding.affinity_nM", .01);
  assert.equal(await first, false);
  assert.equal(await second, false);
  assert.equal(await last, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].value, .01);
  assert.equal(controller.getSnapshot().result.result_id, `result-${calls[0].client_revision}0.01`);
  assert.equal(controller.getSnapshot().status, "ready");
  assert.equal(controller.getSnapshot().pendingEdits, 0);
});

test("different-field edits queue and only the final settled result is published", async () => {
  const jobs = [];
  const controller = new WorkspaceController(example, 100, {
    simulate: async (request) => response(request),
    adjust: (request) => { const job = deferred(); jobs.push({ request, job }); return job.promise; },
  }, 5);
  await controller.start();
  const seen = [];
  controller.subscribe(() => seen.push(controller.getSnapshot().result?.result_id ?? null));
  const first = controller.applyControl("pk.elimination_half_life_h", 900);
  await pause(15);
  assert.equal(jobs.length, 1);
  const second = controller.applyControl("binding.affinity_nM", .01);
  jobs[0].job.resolve(response(jobs[0].request, "first"));
  assert.equal(await first, true);
  await pause(15);
  assert.equal(jobs.length, 2);
  assert.equal(controller.getSnapshot().busy, true);
  assert.ok(seen.every((id) => id !== `result-${jobs[0].request.client_revision}first`));
  jobs[1].job.resolve(response(jobs[1].request, "second"));
  assert.equal(await second, true);
  assert.equal(controller.getSnapshot().result.result_id, `result-${jobs[1].request.client_revision}second`);
  assert.equal(controller.getSnapshot().status, "ready");
});

test("reset aborts in-flight edits and ignores a late stale response", async () => {
  const job = deferred();
  let adjustRequest;
  const controller = new WorkspaceController(example, 100, {
    simulate: async (request) => response(request, "reset"),
    adjust: (request) => { adjustRequest = request; return job.promise; },
  }, 5);
  await controller.start();
  const editing = controller.applyControl("dose_mg", 600);
  await pause(15);
  assert.ok(adjustRequest);
  assert.equal(await controller.resetToInitial(), true);
  assert.equal(await editing, false);
  const stable = controller.getSnapshot().result.result_id;
  job.resolve(response(adjustRequest, "stale"));
  await pause(0);
  assert.equal(controller.getSnapshot().result.result_id, stable);
  assert.deepEqual(controller.getSnapshot().experiment, example);
});

test("validation errors preserve the last result and report the reason", async () => {
  const controller = new WorkspaceController(example, 100, {
    simulate: async (request) => response(request),
    adjust: async () => { throw new Error("Dosing interval is shorter than the infusion duration"); },
  }, 5);
  await controller.start();
  const stable = controller.getSnapshot().result;
  assert.equal(await controller.applyControl("dosing_interval_h", 1), false);
  assert.equal(controller.getSnapshot().result, stable);
  assert.match(controller.getSnapshot().error, /shorter than/);
  assert.equal(controller.getSnapshot().status, "error");
  assert.equal(await controller.applyControl("binding.affinity_nM", 0), false);
  assert.match(controller.getSnapshot().error, /positive/);
});

test("an edit queued during initial loading runs after the initial result", async () => {
  const initial = deferred();
  const calls = [];
  const controller = new WorkspaceController(example, 100, {
    simulate: (request) => { calls.push("initial"); return initial.promise; },
    adjust: async (request) => { calls.push("edit"); return response(request, "edited"); },
  }, 5);
  const starting = controller.start();
  const editing = controller.applyControl("binding.affinity_nM", .01);
  await pause(15); // debounce expires while the initial request is still in flight
  assert.deepEqual(calls, ["initial"]);
  initial.resolve(response({ experiment: example, client_revision: 1 }, "initial"));
  assert.equal(await starting, true);
  assert.equal(await editing, true);
  assert.deepEqual(calls, ["initial", "edit"]);
  assert.equal(controller.getSnapshot().status, "ready");
  assert.match(controller.getSnapshot().result.result_id, /edited/);
});

test("a newer value aborts an in-flight edit to the same field", async () => {
  const old = deferred();
  const calls = [];
  const controller = new WorkspaceController(example, 100, {
    simulate: async (request) => response(request),
    adjust: (request, signal) => {
      calls.push({ request, signal });
      return calls.length === 1 ? old.promise : Promise.resolve(response(request, "latest"));
    },
  }, 5);
  await controller.start();
  const first = controller.applyControl("binding.affinity_nM", .1);
  await pause(15);
  const second = controller.applyControl("binding.affinity_nM", .01);
  assert.equal(await first, false);
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(await second, true);
  old.resolve(response(calls[0].request, "stale"));
  await pause(0);
  assert.equal(calls.length, 2);
  assert.match(controller.getSnapshot().result.result_id, /latest/);
});
