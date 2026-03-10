/**
 * Simple string hash function (FNV-1a variant).
 * Returns an 8-character hex string. Deterministic and fast, not cryptographic.
 */
export function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) | 0; // FNV prime, keep 32-bit
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
