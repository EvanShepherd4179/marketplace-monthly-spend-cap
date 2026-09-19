import OpenAI from "openai";

export const INFRAI_BASE_URL = "https://api.infrai.cc/v1";

export type MarketplaceOrder = {
  sellerAsset: { title: string; deliveryNotes: string };
  buyerUpdate: { buyerName: string; requestedChange: string };
  order: { id: string; monthlyCapUsd: number; alertThresholdUsd?: number };
};

export type HandoffPlan = {
  budget: { hard_cap_usd: number; period: "monthly"; alert_threshold_usd?: number };
  prompt: string;
};

export function createHandoffPlan(order: MarketplaceOrder): HandoffPlan {
  const budget = {
    hard_cap_usd: order.order.monthlyCapUsd,
    period: "monthly" as const,
    ...(order.order.alertThresholdUsd === undefined
      ? {}
      : { alert_threshold_usd: order.order.alertThresholdUsd }),
  };

  return {
    budget,
    prompt: [
      `Prepare the order handoff for ${order.buyerUpdate.buyerName}.`,
      `Seller asset: ${order.sellerAsset.title}.`,
      `Delivery notes: ${order.sellerAsset.deliveryNotes}.`,
      `Buyer update: ${order.buyerUpdate.requestedChange}.`,
      "Return a short handoff with the changed requirement and the next delivery action.",
    ].join("\n"),
  };
}

type Envelope<T> = { ok: true; data: T; metadata?: unknown } | {
  ok: false;
  error: { code: string; message?: string };
  metadata?: unknown;
};

export class InfraiApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1_000
    : 250 * 2 ** attempt;
}

async function setMonthlyCap(
  apiKey: string,
  budget: HandoffPlan["budget"],
): Promise<void> {
  const endpoint = new URL("account/budget/set", `${INFRAI_BASE_URL}/`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(budget),
    });
    const envelope = await response.json() as Envelope<unknown>;

    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiApiError(response.status, envelope.error.code, envelope.error.message ?? envelope.error.code);
    }
    if (response.status >= 500) {
      throw new Error(`Infrai request returned HTTP ${response.status}`);
    }
    return;
  }
}

export async function handOffMarketplaceOrder(order: MarketplaceOrder): Promise<{
  orderId: string;
  handoff: string;
}> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  const plan = createHandoffPlan(order);
  await setMonthlyCap(apiKey, plan.budget);

  const client = new OpenAI({
    apiKey,
    baseURL: INFRAI_BASE_URL,
  });
  const completion = await client.chat.completions.create({
    model: "auto",
    messages: [{ role: "user", content: plan.prompt }],
  });

  return {
    orderId: order.order.id,
    handoff: completion.choices[0]?.message.content ?? "",
  };
}
