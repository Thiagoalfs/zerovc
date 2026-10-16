/**
 * E2EE Safety Number Verification & Offline SVG QR Code Generator.
 * Conforms to ZeroVC Milestone M6 cryptographic specifications.
 * Zero external network calls (e.g., api.qrserver.com) to guarantee zero leak of identity keys.
 */

import { keyStore } from './keyStore';

export interface SafetyVerificationResult {
  digits: string;       // 60 continuous decimal digits
  rawDigits: string;    // alias for digits
  formatted: string;    // 12 groups of 5 decimal digits ("12345 67890 ...")
  code: string;         // alias for formatted
  groups: string[];     // Array of 12 strings, each 5 digits
  qrPayload: string;    // Canonical URI: zerovc-e2ee://verify?v=1&k1=...&k2=...&d=...
}

/**
 * Computes canonical 60-digit safety verification code and QR URI from two Ed25519 identity public keys.
 * Order-independent (commutative): sorts keyA and keyB lexicographically.
 */
export async function computeSafetyNumber(
  keyA: string,
  keyB: string
): Promise<SafetyVerificationResult> {
  const sorted = [keyA, keyB].sort();
  const combined = `zerovc:verify:${sorted[0]}:${sorted[1]}`;

  const hashBuffer = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(combined)
  );

  const view = new DataView(hashBuffer);

  // Convert first 24 bytes (12 16-bit big-endian words) into 60 decimal digits
  let digits = '';
  for (let i = 0; i < 24; i += 2) {
    const val = view.getUint16(i, false) % 100000;
    digits += val.toString().padStart(5, '0');
  }

  const groups: string[] = [];
  for (let i = 0; i < 60; i += 5) {
    groups.push(digits.slice(i, i + 5));
  }
  const formatted = groups.join(' ');

  const qrPayload = `zerovc-e2ee://verify?v=1&k1=${encodeURIComponent(sorted[0])}&k2=${encodeURIComponent(sorted[1])}&d=${digits}`;

  return {
    digits,
    rawDigits: digits,
    formatted,
    code: formatted,
    groups,
    qrPayload,
  };
}

/**
 * Synchronous / helper alias for computeSafetyNumber.
 */
export const computeSafetyVerificationCode = computeSafetyNumber;

// =============================================================================
// OFFLINE SELF-CONTAINED SVG QR CODE MATRIX GENERATOR (ZERO EXTERNAL NETWORK)
// =============================================================================

// GF(256) Log and Exp tables for Reed-Solomon QR Error Correction
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // QR standard primitive polynomial
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function rsCompute(data: Uint8Array, ecLength: number): Uint8Array {
  // Generate generator polynomial for ecLength
  let poly = [1];
  for (let i = 0; i < ecLength; i++) {
    const nextPoly = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gfMul(poly[j], GF_EXP[i]);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }

  const result = new Uint8Array(ecLength);
  for (let i = 0; i < data.length; i++) {
    const feedback = data[i] ^ result[0];
    for (let j = 0; j < ecLength - 1; j++) {
      result[j] = result[j + 1] ^ gfMul(poly[poly.length - 2 - j], feedback);
    }
    result[ecLength - 1] = gfMul(poly[0], feedback);
  }
  return result;
}

/**
 * Generates an offline SVG string representing a QR Code for the given payload string.
 * Completely client-side and offline — zero requests to external servers.
 */
export function generateOfflineSVGQR(payload: string, size = 200): string {
  // Select QR Version based on payload length
  // Version 7: 45x45 matrix, byte mode EC-L handles up to 154 bytes
  // Version 8: 49x49 matrix, byte mode EC-L handles up to 192 bytes
  // Version 9: 53x53 matrix, byte mode EC-L handles up to 230 bytes
  const bytes = new TextEncoder().encode(payload);
  let version = 6;
  if (bytes.length > 134) version = 7;
  if (bytes.length > 154) version = 8;
  if (bytes.length > 192) version = 9;

  // Capacity table: [dataBytes, ecBytes] for EC Level L
  const versionCaps: Record<number, { dataBytes: number; ecBytes: number; matrixSize: number; align: number[] }> = {
    6: { dataBytes: 136, ecBytes: 36, matrixSize: 41, align: [6, 34] },
    7: { dataBytes: 156, ecBytes: 40, matrixSize: 45, align: [6, 22, 38] },
    8: { dataBytes: 194, ecBytes: 48, matrixSize: 49, align: [6, 24, 42] },
    9: { dataBytes: 232, ecBytes: 60, matrixSize: 53, align: [6, 26, 46] },
  };

  const cap = versionCaps[version] || versionCaps[9];
  const matrixSize = cap.matrixSize;

  // Build bitstream: Mode (0100 for Byte) + Count (8 or 16 bits) + Data + Terminator
  const bits: number[] = [];
  function pushBits(val: number, count: number) {
    for (let i = count - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  }

  // 0100 = 8-bit byte mode
  pushBits(0b0100, 4);
  // Character count indicator (8 bits for v1-9 byte mode)
  pushBits(bytes.length, 8);
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i], 8);
  }
  // Terminator
  const maxBits = cap.dataBytes * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) {
    bits.push(0);
  }
  // Byte alignment
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  // Pad bytes
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to data codewords
  const dataCodewords = new Uint8Array(cap.dataBytes);
  for (let i = 0; i < cap.dataBytes; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i * 8 + j];
    }
    dataCodewords[i] = b;
  }

  // Compute EC codewords
  const ecCodewords = rsCompute(dataCodewords, cap.ecBytes);

  // Combine data + EC
  const fullCodewords = new Uint8Array(cap.dataBytes + cap.ecBytes);
  fullCodewords.set(dataCodewords, 0);
  fullCodewords.set(ecCodewords, cap.dataBytes);

  // Initialize Matrix
  // -1 = unset, 0 = white, 1 = black, 2 = reserved/function
  const matrix: number[][] = Array.from({ length: matrixSize }, () => new Array(matrixSize).fill(-1));
  const isFunction: boolean[][] = Array.from({ length: matrixSize }, () => new Array(matrixSize).fill(false));

  function setModule(r: number, c: number, val: number) {
    if (r >= 0 && r < matrixSize && c >= 0 && c < matrixSize) {
      matrix[r][c] = val;
      isFunction[r][c] = true;
    }
  }

  // 1. Finder patterns (7x7) + separators at (0,0), (0, matrixSize-7), (matrixSize-7, 0)
  function placeFinder(top: number, left: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row >= 0 && row < matrixSize && col >= 0 && col < matrixSize) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isBlack = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
            setModule(row, col, isBlack ? 1 : 0);
          } else {
            setModule(row, col, 0); // Separator
          }
        }
      }
    }
  }
  placeFinder(0, 0);
  placeFinder(0, matrixSize - 7);
  placeFinder(matrixSize - 7, 0);

  // 2. Alignment patterns
  for (const ar of cap.align) {
    for (const ac of cap.align) {
      if (isFunction[ar][ac]) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const isBlack = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
          setModule(ar + r, ac + c, isBlack ? 1 : 0);
        }
      }
    }
  }

  // 3. Timing patterns (row 6 and col 6)
  for (let i = 8; i < matrixSize - 8; i++) {
    if (!isFunction[6][i]) setModule(6, i, i % 2 === 0 ? 1 : 0);
    if (!isFunction[i][6]) setModule(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // 4. Dark module
  setModule(4 * version + 9, 8, 1);

  // 5. Format info placeholder
  for (let i = 0; i < 9; i++) {
    if (!isFunction[8][i]) setModule(8, i, 0);
    if (!isFunction[i][8]) setModule(i, 8, 0);
    if (!isFunction[8][matrixSize - 1 - i]) setModule(8, matrixSize - 1 - i, 0);
    if (!isFunction[matrixSize - 1 - i][8]) setModule(matrixSize - 1 - i, 8, 0);
  }

  // 6. Data placement (zigzag right-to-left, skipping function modules)
  let cwBitIndex = 0;
  const totalBits = fullCodewords.length * 8;
  let upward = true;

  for (let right = matrixSize - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const rows = upward
      ? Array.from({ length: matrixSize }, (_, i) => matrixSize - 1 - i)
      : Array.from({ length: matrixSize }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!isFunction[r][c]) {
          let bit = 0;
          if (cwBitIndex < totalBits) {
            const byteIdx = Math.floor(cwBitIndex / 8);
            const bitOffset = 7 - (cwBitIndex % 8);
            bit = (fullCodewords[byteIdx] >>> bitOffset) & 1;
            cwBitIndex++;
          }
          // Mask 0: (row + col) % 2 === 0
          if ((r + c) % 2 === 0) {
            bit ^= 1;
          }
          matrix[r][c] = bit;
        }
      }
    }
    upward = !upward;
  }

  // 7. Format bits (Mask 0 + EC-L: format code 0x77c4)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i];
  matrix[8][7] = formatBits[6];
  matrix[8][8] = formatBits[7];
  matrix[7][8] = formatBits[8];
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i];

  for (let i = 0; i < 8; i++) matrix[matrixSize - 1 - i][8] = formatBits[i];
  for (let i = 8; i < 15; i++) matrix[8][matrixSize - 15 + i] = formatBits[i];

  // Render SVG string
  const quietZone = 2;
  const totalGrid = matrixSize + quietZone * 2;
  const rects: string[] = [];

  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c] === 1) {
        rects.push(`<rect x="${c + quietZone}" y="${r + quietZone}" width="1" height="1" fill="#FFFFFF"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalGrid} ${totalGrid}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${totalGrid}" height="${totalGrid}" fill="#0f1117" rx="2"/>
    ${rects.join('\n    ')}
  </svg>`;
}

// =============================================================================
// VERIFICATION STORAGE HELPERS
// =============================================================================

const STORAGE_PREFIX = 'zerovc_device_verified_';

/**
 * Checks whether a device is marked as verified.
 */
export async function isDeviceVerified(deviceId: string): Promise<boolean> {
  if (!deviceId) return false;

  try {
    const meta = await keyStore.getRecordMeta('device_verifications', deviceId);
    if (meta && meta.verified === true) return true;
  } catch {}

  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(STORAGE_PREFIX + deviceId) === 'true';
    } catch {}
  }

  return false;
}

/**
 * Sets verification status for a peer device.
 */
export async function setDeviceVerified(deviceId: string, verified: boolean): Promise<void> {
  if (!deviceId) return;

  try {
    if (verified) {
      await keyStore.encryptAndStorePickle('device_verifications', deviceId, 'verified', {
        deviceId,
        verified: true,
        verifiedAt: Date.now(),
      });
    } else {
      await keyStore.deleteRecord('device_verifications', deviceId);
    }
  } catch {}

  if (typeof localStorage !== 'undefined') {
    try {
      if (verified) {
        localStorage.setItem(STORAGE_PREFIX + deviceId, 'true');
      } else {
        localStorage.removeItem(STORAGE_PREFIX + deviceId);
      }
    } catch {}
  }
}

/**
 * Lists all device IDs currently verified in local storage.
 */
export async function getVerifiedDevices(): Promise<string[]> {
  const verified: string[] = [];

  try {
    const records = await keyStore.getAllRecords<any>('device_verifications');
    for (const r of records) {
      if (r && r.deviceId && r.verified) {
        verified.push(r.deviceId);
      }
    }
  } catch {}

  if (typeof localStorage !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          const devId = key.substring(STORAGE_PREFIX.length);
          if (!verified.includes(devId) && localStorage.getItem(key) === 'true') {
            verified.push(devId);
          }
        }
      }
    } catch {}
  }

  return verified;
}
