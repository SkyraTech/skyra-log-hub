/**
 * @skyra/logger-browser - Cryptographically Secure UUIDv4 Generator
 * Complies with RFC 4122. Zero Math.random() usage.
 */
const UUID_V4_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
export function generateBrowserUuid() {
    // 1. Modern Web Crypto API crypto.randomUUID()
    const globalCrypto = typeof crypto !== 'undefined' ? crypto : undefined;
    if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
        return globalCrypto.randomUUID();
    }
    // 2. Browser crypto.getRandomValues() fallback
    if (globalCrypto && typeof globalCrypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        globalCrypto.getRandomValues(bytes);
        // Set version 4 bits: 0100xxxx
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        // Set RFC 4122 variant bits: 10xxxxxx
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [];
        for (let i = 0; i < 16; i++) {
            hex.push(bytes[i].toString(16).padStart(2, '0'));
        }
        return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
    }
    throw new Error('Cryptographically secure random number generator (Web Crypto API) is unavailable in this environment.');
}
export function isValidUuidV4(id) {
    return typeof id === 'string' && UUID_V4_REGEX.test(id);
}
//# sourceMappingURL=uuid.js.map