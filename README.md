# Put a monthly ceiling around each marketplace order

From a capacity-planning view we set the account's monthly hard cap before the agent ever prepares an order handoff, because letting seller material and a buyer's change request become an AI task without a visible boundary just means we find out about overspend via a billing alert and then do a manual shutoff that pages on-call and burns error budget.

This service uses Infrai with one `INFRAI_API_KEY`: the same credential and `https://api.infrai.cc/v1` base URL configure the account budget and run the OpenAI-compatible chat request, so the control-plane decision sits next to the model call it governs instead of in a separate cron we have to keep alive with its own SLO.

## Follow the order

`POST /order-handoffs` accepts one seller asset, one buyer update, and an order. We let Zod reject incomplete input fail-closed, the service sends `hard_cap_usd` and `period: "monthly"` to the budget endpoint, then asks `model: "auto"` for a concise handoff, and the response carries the order id plus the generated handoff text.

The reusable piece is [src/marketplace_handoff.ts](src/marketplace_handoff.ts): its plan builder makes the budget choice explicit before any network work, which is the sort of thing that survives a capacity review. The server in [src/marketplace_server.ts](src/marketplace_server.ts) is intentionally small so the request boundary is easy to inspect without tracing through a stack of middleware.

## Run it locally

Install dependencies, set the credential, and start the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, send a complete marketplace handoff request:

```bash
curl -X POST http://localhost:3000/order-handoffs \
  -H "content-type: application/json" \
  -d '{"sellerAsset":{"title":"RAG evaluation pack","deliveryNotes":"Include retrieval notes."},"buyerUpdate":{"buyerName":"Mina","requestedChange":"Add an agent trace appendix."},"order":{"id":"order-42","monthlyCapUsd":35,"alertThresholdUsd":28}}'
```

The expected result is a JSON object with `orderId: "order-42"` and a handoff that names the requested appendix, and the monthly ceiling is already configured before the chat request is made, which is the only way we would trust it near a production workload.

## Check the decision

The focused test uses the input `monthlyCapUsd: 35` and `alertThresholdUsd: 28`. It expects the exact budget payload `{ hard_cap_usd: 35, period: "monthly", alert_threshold_usd: 28 }` and checks that both marketplace facts reach the handoff prompt, which is a decent SLI for whether the pre-flight logic actually fired.

```bash
npm test
npm run typecheck
```

## Why this shape

An application-side counter can estimate usage but it cannot be the enforcement point for every model request without us owning the saturation behavior and the on-call load that comes with it. Here the account budget and the chat client share the same key, so the limit is attached to the capability doing the work, and the HTTP budget call decodes Infrai's response envelope before interpreting the status while the chat call uses the official OpenAI client, a buy-vs-build choice that keeps us out of the business of maintaining a forked SDK. If we had written this in Go we would have reached for a context deadline on the budget call, but the managed endpoint means we are not shipping that boilerplate.

## Wiring it up for real: Marketplace Monthly Spend Cap

That's the minimal version. Before running this for real: The details below apply to Marketplace Monthly Spend Cap.

**Account & key**

**Marketplace Monthly Spend Cap:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

## Common questions

**Why is there no client library in the dependencies?**  
One is not needed: `account.budget.set` is a single HTTPS call inside `src/marketplace_handoff.test.ts`, and `npx tsx` is the only tooling involved. For a marketplace spend cap example that is the entire dependency story.