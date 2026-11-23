/**
 * core/http/file-download.util.ts
 *
 * Reusable utility for browser file downloads from Blob responses.
 * Enforces safe ObjectURL generation, temporary anchor creation,
 * filename assignment, and deterministic URL revocation.
 */

export interface DownloadOptions {
  /** Delay in milliseconds before revoking the temporary ObjectURL. Defaults to 1000ms. */
  revokeDelayMs?: number;
}

/**
 * Initiates a browser download for a given Blob data object.
 *
 * @param blob The binary Blob received from an export or file endpoint.
 * @param filename The sanitized target filename presented to the user.
 * @param options Optional configuration including ObjectURL revocation delay.
 */
export function triggerBlobDownload(blob: Blob, filename: string, options: DownloadOptions = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const revokeDelay = options.revokeDelayMs ?? 1000;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, revokeDelay);
  }
}

