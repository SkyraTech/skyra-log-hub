/**
 * Runtime environment detection for Next.js.
 * Differentiates Node.js runtime, Edge runtime, and Serverless environments.
 */
/**
 * Returns true if running within the Next.js Edge runtime.
 */
export declare function isEdgeRuntime(): boolean;
/**
 * Returns true if running within the Next.js Node.js server runtime.
 */
export declare function isNodeRuntime(): boolean;
/**
 * Returns true if running within a serverless platform (Vercel, AWS Lambda, Netlify, Google Cloud Run).
 */
export declare function isServerlessRuntime(): boolean;
//# sourceMappingURL=runtime.d.ts.map