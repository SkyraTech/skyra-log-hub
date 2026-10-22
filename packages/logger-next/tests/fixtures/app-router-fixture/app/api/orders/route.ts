import { withSkyraLogging } from "@skyra/logger-next/route-handler";
import { createOrderAction } from "../../actions";

export const POST = withSkyraLogging(
  async (request: Request) => {
    const body = (await request.json()) as { orderId?: string; amount?: number };
    const result = await createOrderAction({
      orderId: body.orderId || "ord-test",
      amount: body.amount ?? 100
    });

    return Response.json(result, { status: 201 });
  },
  {
    route: "/api/orders"
  }
);
