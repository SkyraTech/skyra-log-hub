import { withSkyraLogging } from "@skyra/logger-next/route-handler";
export const GET = withSkyraLogging(async (_request, context) => {
    const params = await context.params;
    return Response.json({
        userId: params.userId,
        name: `User ${params.userId}`
    });
}, {
    route: "/api/users/[userId]"
});
//# sourceMappingURL=route.js.map