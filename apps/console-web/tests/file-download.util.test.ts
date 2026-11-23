import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { triggerBlobDownload } from '../src/app/core/http/file-download.util';

describe('triggerBlobDownload — Core HTTP Download Utility', () => {
  let createdUrls: string[] = [];
  let revokedUrls: string[] = [];
  let clickedAnchors: Array<{ href: string; download: string }> = [];

  const originalURL = (globalThis as any).URL;
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;

  beforeEach(() => {
    createdUrls = [];
    revokedUrls = [];
    clickedAnchors = [];

    (globalThis as any).window = {};

    (globalThis as any).URL = {
      createObjectURL: (blob: any) => {
        const mockUrl = 'blob:http://localhost/' + Math.random().toString(36).substring(2);
        createdUrls.push(mockUrl);
        return mockUrl;
      },
      revokeObjectURL: (url: string) => {
        revokedUrls.push(url);
      }
    };

    (globalThis as any).document = {
      createElement: (tag: string) => {
        const element: any = {
          href: '',
          download: '',
          style: {},
          click: () => {
            clickedAnchors.push({ href: element.href, download: element.download });
          }
        };
        return element;
      },
      body: {
        appendChild: (_el: any) => {},
        removeChild: (_el: any) => {}
      }
    };
  });

  afterEach(() => {
    (globalThis as any).URL = originalURL;
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
  });

  it('creates an anchor, triggers click with target filename, and schedules URL revocation', async () => {
    const testBlob = { size: 100, type: 'text/plain' } as any;
    triggerBlobDownload(testBlob, 'skyra-report.txt', { revokeDelayMs: 40 });

    assert.equal(createdUrls.length, 1);
    assert.equal(clickedAnchors.length, 1);
    assert.equal(clickedAnchors[0].download, 'skyra-report.txt');
    assert.equal(clickedAnchors[0].href, createdUrls[0]);

    // Before delay, not yet revoked
    assert.equal(revokedUrls.length, 0);

    // Wait for revocation timer
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(revokedUrls.length, 1);
    assert.equal(revokedUrls[0], createdUrls[0]);
  });

  it('safely no-ops in non-browser environments where document is undefined', () => {
    (globalThis as any).document = undefined;
    const testBlob = { size: 100 } as any;
    // Should not throw
    assert.doesNotThrow(() => {
      triggerBlobDownload(testBlob, 'test.txt');
    });
  });
});
