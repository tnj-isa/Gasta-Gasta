/**
 * @typedef {{v:1, kdf:'PBKDF2-SHA256', iterations:number, salt:string, iv:string, data:string}} EncryptedBlob
 *   salt, iv e data em base64.
 */

export const DEFAULT_ITERATIONS = 600000;

export class WrongPasswordError extends Error {
  constructor() {
    super('Senha incorreta ou dados corrompidos');
    this.name = 'WrongPasswordError';
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** @param {Uint8Array} bytes */
export function toB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** @param {string} b64 */
export function fromB64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} iterations
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Cifra com uma chave já derivada. Cada chamada usa um IV novo.
 * @param {unknown} value
 * @param {CryptoKey} key
 * @param {{salt: Uint8Array, iterations: number}} params
 * @returns {Promise<EncryptedBlob>}
 */
export async function sealJSON(value, key, { salt, iterations }) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)),
  );
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(new Uint8Array(data)),
  };
}

/**
 * Qualquer falha ao abrir vira WrongPasswordError.
 * @param {EncryptedBlob} blob
 * @param {CryptoKey} key
 */
export async function openJSON(blob, key) {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.data),
    );
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new WrongPasswordError();
  }
}

/**
 * @param {unknown} value
 * @param {string} password
 * @param {{iterations?: number}} [opts]
 * @returns {Promise<EncryptedBlob>}
 */
export async function encryptJSON(value, password, { iterations = DEFAULT_ITERATIONS } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, iterations);
  return sealJSON(value, key, { salt, iterations });
}

/**
 * @param {EncryptedBlob} blob
 * @param {string} password
 */
export async function decryptJSON(blob, password) {
  const key = await deriveKey(password, fromB64(blob.salt), blob.iterations);
  return openJSON(blob, key);
}
