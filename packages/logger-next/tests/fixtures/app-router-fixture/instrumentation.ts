import { createNextSkyraLogger } from "@skyra/logger-next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const logDir = process.env.SKYRA_TEST_LOG_DIR || "./test-logs";
    createNextSkyraLogger({
      projectId: "next-integration-app",
      serviceName: "next-service",
      environment: "test",
      instanceId: "next-inst-01",
      level: "info",
      transport: {
        type: "file",
        directory: logDir
      }
    });

    const { registerSkyraInstrumentation } = await import("@skyra/logger-next/instrumentation");
    await registerSkyraInstrumentation();
  }
}

export async function onRequestError(err: unknown, request: any, context: any) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { createSkyraRequestErrorHandler } = await import("@skyra/logger-next/instrumentation");
    const handler = createSkyraRequestErrorHandler();
    await handler(err, request, context);
  }
}
