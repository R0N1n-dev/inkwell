import { onScopeDispose } from 'vue';

/**
 * Lightweight back-button interceptors for transient in-page UI (search mode,
 * multi-select, recorders…). The newest interceptor runs first; returning true
 * means "handled, do not navigate".
 */
const stack = [];

export function registerBackInterceptor(fn) {
  stack.push(fn);
  onScopeDispose(() => {
    const index = stack.indexOf(fn);
    if (index !== -1) stack.splice(index, 1);
  });
}

export function runBackInterceptors() {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    try {
      if (stack[i]()) return true;
    } catch {
      /* a broken interceptor must not block navigation */
    }
  }
  return false;
}
