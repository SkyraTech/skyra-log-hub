import { withSkyraLogging } from "@skyra/logger-next/route-handler";
export const GET = withSkyraLogging(async (_request) => {
    return Response.json({
        status: "ok",
        timestamp: new Date().toISOString()
    });
}, {
    route: "/api/status"
});
//# sourceMappingURL=route.js.map