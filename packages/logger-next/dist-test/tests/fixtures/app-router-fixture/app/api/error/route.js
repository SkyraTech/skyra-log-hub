import { withSkyraLogging } from "@skyra/logger-next/route-handler";
export const GET = withSkyraLogging(async (_request) => {
    throw new Error("Simulated unhandled route failure");
}, {
    route: "/api/error"
});
//# sourceMappingURL=route.js.map