import { CairnError, type BeforeHook } from '@cairnjs/core';

export interface AuthGuardOptions {
  key: string;
  header?: string;
}

// Route-scoped hook (RouteDef.before), not a plugin. The app drops it on the
// route it protects; the guard doesn't need to know which routes exist.
export function authGuard(opts: AuthGuardOptions): BeforeHook {
  const header = opts.header ?? 'x-api-key';
  return (ctx) => {
    if (ctx.headers[header] !== opts.key) {
      throw new CairnError(401, 'unauthorized');
    }
  };
}