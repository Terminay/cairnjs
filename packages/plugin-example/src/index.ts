import type { CairnApp } from '@cairnjs/core';

// before hooks can return an "after" callback that runs post-handler.
// That's the only way to time a request without wrapping the handler.
export function loggerPlugin() {
  return (app: CairnApp) => {
    app.before((ctx) => {
      const start = performance.now();
      return () => {
        const ms = performance.now() - start;
        console.log(`${ctx.method} ${ctx.path} ${ms.toFixed(2)}ms`);
      };
    });
  };
}