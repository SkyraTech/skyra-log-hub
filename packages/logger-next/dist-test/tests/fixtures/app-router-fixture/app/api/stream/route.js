import { withSkyraLogging } from "@skyra/logger-next/route-handler";
export const GET = withSkyraLogging(async (_request) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode("chunk1\n"));
            controller.enqueue(encoder.encode("chunk2\n"));
            controller.close();
        }
    });
    return new Response(stream, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Transfer-Encoding": "chunked"
        }
    });
}, {
    route: "/api/stream"
});
//# sourceMappingURL=route.js.map