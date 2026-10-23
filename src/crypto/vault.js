/**
 * Inkwell Vault — client-side AES-256-GCM encryption for locked notes.
 * Key derivation: PBKDF2-SHA256 (250k iterations) from the master password.
 * The derived CryptoKey lives only in memory; a stored verifier ciphertext
 * lets us check the password without storing it.
 */
import { ref } from 'vue';
import { getDB } from '../db/database.js';
import { getSetting, setSetting } from '../db/settings.js';
import { base64ToBytes, bytesToBase64 } from '../utils/format.js';

const ITERATIONS = 250000;

export const vaultUnlocked = ref(false);
export const vaultConfigured = ref(false);

let memKey = null; // CryptoKey
let autoLockTimer = null;

const enc = new TextEncoder();
const dec = new TextDecoder();

function subtle() {
  return globalThis.crypto.subtle;
}

async function deriveKey(password, saltBytes) {
  const material = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey'
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptWith(key, plainBytes) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  return { iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

async function decryptWith(key, packet) {
  const pt = await subtle().decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(packet.iv) },
    key,
    base64ToBytes(packet.ct)
  );
  return dec.decode(pt);
}

export async function loadVaultState() {
  const cfg = await getSetting('vault', null);
  vaultConfigured.value = !!cfg;
  return cfg;
}

export async function setupVault(password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const verifier = await encryptWith(key, enc.encode('INKWELL_VAULT_V1'));
  await setSetting('vault', {
    salt: bytesToBase64(salt),
    verifier,
    iterations: ITERATIONS,
    createdAt: Date.now()
  });
  vaultConfigured.value = true;
  memKey = key;
  vaultUnlocked.value = true;
  scheduleAutoLock();
}

export async function unlockVault(password) {
  const cfg = await getSetting('vault', null);
  if (!cfg) return false;
  const key = await deriveKey(password, base64ToBytes(cfg.salt));
  try {
    const plain = await decryptWith(key, cfg.verifier);
    if (plain !== 'INKWELL_VAULT_V1') return false;
  } catch {
    return false;
  }
  memKey = key;
  vaultUnlocked.value = true;
  scheduleAutoLock();
  return true;
}

export function lockVault() {
  memKey = null;
  vaultUnlocked.value = false;
  clearTimeout(autoLockTimer);
}

export function scheduleAutoLock() {
  clearTimeout(autoLockTimer);
  getSetting('vaultAutoLockMin', 10).then((min) => {
    if (!min) return; // 0 = never auto-lock
    autoLockTimer = setTimeout(() => lockVault(), min * 60 * 1000);
  });
}

export function touchVault() {
  if (vaultUnlocked.value) scheduleAutoLock();
}

export async function encryptPayload(obj) {
  if (!memKey) throw new Error('vault locked');
  const packet = await encryptWith(memKey, enc.encode(JSON.stringify(obj)));
  return JSON.stringify(packet);
}

export async function decryptPayload(cipherJson) {
  if (!memKey) throw new Error('vault locked');
  const packet = JSON.parse(cipherJson);
  return JSON.parse(await decryptWith(memKey, packet));
}

/** Re-encrypt every locked note when the master password changes. */
export async function changeVaultPassword(oldPass, newPass) {
  const ok = await unlockVault(oldPass);
  if (!ok) return false;
  const db = await getDB();
  const locked = await db.notes.find({ selector: { locked: true } }).exec();
  const payloads = [];
  for (const doc of locked) {
    payloads.push({ id: doc.id, payload: await decryptPayload(doc.cipher) });
  }
  lockVault();
  await setupVault(newPass);
  for (const { id, payload } of payloads) {
    const doc = await db.notes.findOne(id).exec();
    if (doc) await doc.incrementalPatch({ cipher: await encryptPayload(payload), updated: Date.now() });
  }
  return true;
}
