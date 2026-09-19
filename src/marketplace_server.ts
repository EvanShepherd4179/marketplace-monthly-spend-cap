import { createServer } from "node:http";
import { z } from "zod";
import { handOffMarketplaceOrder } from "./marketplace_handoff.js";

const handoffBody = z.object({
  sellerAsset: z.object({
    title: z.string().min(1),
    deliveryNotes: z.string().min(1),
  }),
  buyerUpdate: z.object({
    buyerName: z.string().min(1),
    requestedChange: z.string().min(1),
  }),
  order: z.object({
    id: z.string().min(1),
    monthlyCapUsd: z.number().positive(),
    alertThresholdUsd: z.number().positive().optional(),
  }).refine((order) => order.alertThresholdUsd === undefined || order.alertThresholdUsd < order.monthlyCapUsd, {
    message: "alertThresholdUsd must be below monthlyCapUsd",
  }),
});

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/order-handoffs") {
    response.writeHead(404).end();
    return;
  }

  try {
    const input = handoffBody.parse(await readJson(request));
    const result = await handOffMarketplaceOrder(input);
    response.writeHead(201, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: message }));
  }
});

if (process.argv.includes("--demo")) {
  console.log("Start the server, then POST an order handoff to http://localhost:3000/order-handoffs");
}

server.listen(3000, () => console.log("Marketplace handoff service listening on http://localhost:3000"));
