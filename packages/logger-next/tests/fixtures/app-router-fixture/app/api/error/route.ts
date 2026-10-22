import { withSkyraLogging } from "@skyra/logger-next/route-handler";

export const GET = withSkyraLogging(
  async (_request: Request) => {
    throw new Error("Simulated unhandled route failure");
  },
  {
    route: "/api/error"
  }
);
