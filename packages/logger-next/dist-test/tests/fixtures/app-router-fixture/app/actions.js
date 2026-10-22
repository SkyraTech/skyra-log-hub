"use server";
import { withSkyraAction } from "@skyra/logger-next/server-action";
export const createOrderAction = withSkyraAction("orders.create", async (input) => {
    if (input.amount <= 0) {
        throw new Error("Invalid order amount");
    }
    return {
        success: true,
        orderId: input.orderId,
        status: "confirmed"
    };
});
//# sourceMappingURL=actions.js.map