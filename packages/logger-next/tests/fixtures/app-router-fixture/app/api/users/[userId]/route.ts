import { withSkyraLogging } from "@skyra/logger-next/route-handler";

export const GET = withSkyraLogging(
  async (_request: Request, context: { params: Promise<{ userId: string }> }) => {
    const params = await context.params;
    return Response.json({
      userId: params.userId,
      name: `User ${params.userId}`
    });
  },
  {
    route: "/api/users/[userId]"
  }
);
