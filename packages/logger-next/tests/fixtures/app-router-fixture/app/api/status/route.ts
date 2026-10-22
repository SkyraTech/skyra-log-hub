import { withSkyraLogging } from "@skyra/logger-next/route-handler";

export const GET = withSkyraLogging(
  async (_request: Request) => {
    return Response.json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  },
  {
    route: "/api/status"
  }
);
