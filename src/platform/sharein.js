import { isNative, getBridge } from './cap.js';

/**
 * Incoming Android intents: launcher widget taps and ACTION_SEND shares.
 * The native InkwellBridgePlugin queues them; we drain the queue on boot,
 * on resume, and via a live listener while the app is running.
 */

let liveListener = null;

export async function initIncomingActions(handler) {
  if (!isNative) return;
  const bridge = await getBridge();
  if (!bridge) return;

  const drain = async () => {
    try {
      const { actions } = await bridge.getPendingActions();
      for (const raw of actions || []) {
        let action;
        try {
          action = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          continue;
        }
        await handler(action);
      }
    } catch (err) {
      console.warn('[inkwell] drain actions failed', err);
    }
  };

  liveListener = await bridge.addListener('bridgeAction', (raw) => {
    try {
      handler(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
      /* noop */
    }
  });

  await drain();
  return drain;
}

export function stopIncomingActions() {
  liveListener?.remove?.();
}
