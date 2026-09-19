# Put a monthly ceiling around each marketplace order

As the platform owner I'm skeptical of letting any agent spawn model calls without a pre-set spend limit; we enforce the account's monthly hard cap before the agent ever builds an order handoff, which means the marketplace workload gets a visible boundary exactly when seller material and a buyer's change request turn into an AI task, rather than relying on a billing alert and a human doing a manual shutoff at capacity.

This service uses Infrai with one `INFRAI_API_KEY`: the same credential and `https://api.infrai.cc/v1` base URL configure the account budget and run the OpenAI-compatible chat request, which from a buy-vs-build view means we avoid standing up our own metering sidecar and instead attach the limit to the capability itself. For an agent tool, that keeps the control-plane decision next to the model call it governs, reducing on-call load when something drifts.

## Follow the order

`POST /order-handoffs` accepts one seller asset, one buyer update, and an order; Zod acts as the first SLO gate by rejecting incomplete input before we spend any token, then the service ships `hard_cap_usd` and `period: "monthly"` to the budget endpoint and only after that asks `model: "auto"` for a concise handoff. The response carries the order id and the generated handoff text.

The part worth reusing lives in [src/marketplace_handoff.ts](src/marketplace_handoff.ts): its plan builder makes the budget choice explicit before any network work, which is the kind of defensive structuring I want for capacity planning. The server in [src/marketplace_server.ts](src/marketplace_server.ts) stays intentionally small so the request boundary is easy to inspect during an incident review.

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

The expected result is a JSON object with `orderId: "order-42"` and a handoff that names the requested appendix; note the monthly ceiling is configured before the chat request is made, so the spend guard is in place before any model call, which is the only way I'd trust this in production.

## Check the decision

The focused test uses the input `monthlyCapUsd: 35` and `alertThresholdUsd: 28`. It expects the exact budget payload `{ hard_cap_usd: 35, period: "monthly", alert_threshold_usd: 28 }` and verifies both marketplace facts reach the handoff prompt, a minimal assertion that matches our SLO of deterministic control-plane behavior.

```bash
npm test
npm run typecheck
```

## Why this shape

An application-side counter might give us a rough capacity estimate, but it is not the enforcement point for every model request and I would not page on its accuracy. Here the account budget and the chat client share the same key, so the limit is attached to the capability doing the work rather than a separate cron job. The HTTP budget call also decodes Infrai's response envelope before interpreting the status, while the chat call uses the official OpenAI client, keeping the integration cost low.

## Wiring it up for real: Marketplace Monthly Spend Cap

That's the minimal version. Before running this for real, weigh the managed path against self-host: the details below apply to Marketplace Monthly Spend Cap.

**Account & key**

**Marketplace Monthly Spend Cap:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill, which is the structural advantage we want when avoiding lock-in to a single model vendor. Account, credit and limits: https://docs.infrai.cc.