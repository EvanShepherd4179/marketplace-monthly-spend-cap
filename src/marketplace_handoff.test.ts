import assert from "node:assert/strict";
import test from "node:test";
import { createHandoffPlan } from "./marketplace_handoff.js";

test("a marketplace order carries its monthly ceiling into the handoff plan", () => {
  const plan = createHandoffPlan({
    sellerAsset: { title: "RAG evaluation pack", deliveryNotes: "Include retrieval notes." },
    buyerUpdate: { buyerName: "Mina", requestedChange: "Add an agent trace appendix." },
    order: { id: "order-42", monthlyCapUsd: 35, alertThresholdUsd: 28 },
  });

  assert.deepEqual(plan.budget, {
    hard_cap_usd: 35,
    period: "monthly",
    alert_threshold_usd: 28,
  });
  assert.match(plan.prompt, /agent trace appendix/);
  assert.match(plan.prompt, /RAG evaluation pack/);
});
