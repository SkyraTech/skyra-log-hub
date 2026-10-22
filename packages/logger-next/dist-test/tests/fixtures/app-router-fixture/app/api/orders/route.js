import { withSkyraLogging } from "@skyra/logger-next/route-handler";
import { createOrderAction } from "../../actions";
export const POST = withSkyraLogging(async (request) => {
    const body = await request.json();
    const result = await createOrderAction({
        orderId: body.orderId || "ord-test",
        amount: body.amount ?? 100
    });
    return Response.json(result, { status: 201 });
}, {
    route: "/api/orders"
});
//# sourceMappingURL=route.js.map