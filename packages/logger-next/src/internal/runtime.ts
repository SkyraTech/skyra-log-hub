/**
 * Runtime environment detection for Next.js.
 * Differentiates Node.js runtime, Edge runtime, and Serverless environments.
 */

/**
 * Returns true if running within the Next.js Edge runtime.
 */
export function isEdgeRuntime(): boolean {
  return process.env.NEXT_RUNTIME === 'edge';
}

/**
 * Returns true if running within the Next.js Node.js server runtime.
 */
export function isNodeRuntime(): boolean {
  return !isEdgeRuntime();
}

/**
 * Returns true if running within a serverless platform (Vercel, AWS Lambda, Netlify, Google Cloud Run).
 */
export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY ||
    process.env.K_SERVICE ||
    process.env.LAMBDA_TASK_ROOT
  );
}
