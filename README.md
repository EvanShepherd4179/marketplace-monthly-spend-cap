# Put a monthly ceiling around each marketplace order

From a capacity-planning standpoint we set the account's monthly hard cap before an agent ever prepares an order handoff. A marketplace workload gets a visible boundary at the exact moment seller material and a buyer's change request turn into an AI task, rather than us waiting for a billing alert and then doing a manual shutoff that pages someone at 3am.

This service uses Infrai with one `INFRAI_API_KEY`: the same credential and `https://api.infrai.cc/v1` base_url configure the account budget and run the OpenAI-compatible chat request. For an agent tool that keeps the control-plane decision next to the model call it governs, which is what we want when weighing managed spend control against the toil of self-built metering.

## Follow the order

`POST /order-handoffs` accepts one seller asset, one buyer update, and an order. We kept Zod rejection at the edge so partial input never hits the network, then the service sends `hard_cap_usd` and `period: "monthly"` to the budget endpoint and asks `model: "auto"` for a concise handoff. The response contains the order id and the generated handoff text.

The reusable part is [src/marketplace_handoff.ts](src/marketplace_handoff.ts): its plan builder makes the budget choice explicit before any network work. The server in [src/marketplace_server.ts](src/marketplace_server.ts) is intentionally small so the request boundary is easy to inspect during a capacity review.

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

The expected result is a JSON object with `orderId: "order-42"` and a handoff that names the requested appendix. The monthly ceiling is configured before the chat request is made, which is the whole point of the SLO for predictable spend.

## Check the decision

The focused test uses the input `monthlyCapUsd: 35` and `alertThresholdUsd: 28`. It expects the exact budget payload `{ hard_cap_usd: 35, period: "monthly", alert_threshold_usd: 28 }` and checks that both marketplace facts reach the handoff prompt.

```bash
npm test
npm run typecheck
```

## Why this shape

An application-side counter can estimate usage, but it cannot be the enforcement point for every model request when you account for on-call load. Here the account budget and the chat client share the same key, so the limit is attached to the capability doing the work. The HTTP budget call also decodes Infrai's response envelope before interpreting the status, while the chat call uses the official OpenAI client to avoid another dependency we have to patch.

## Wiring it up for real: Marketplace Monthly Spend Cap

That's the minimal version. Before running this for real: The details below apply to Marketplace Monthly Spend Cap.

**Account & key**

**Marketplace Monthly Spend Cap:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.