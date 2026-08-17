import { createServer, type IncomingMessage, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import { validateStringMap, validateBody, type Schema, type SchemaToType } from './validator.js';

export type { Schema, SchemaToType } from './validator.js';

export interface RouteDef<P extends Schema = Schema, Q extends Schema = Schema, B extends Schema = Schema> {
  params?: P;
  query?: Q;
  body?: B;
  before?: BeforeHook | BeforeHook[];
  handler: (ctx: {
    params: SchemaToType<P>;
    query: SchemaToType<Q>;
    body: SchemaToType<B>;
  }) => unknown | Promise<unknown>;
}

export interface CairnContext {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: IncomingHttpHeaders;
}

export type BeforeHook = (ctx: CairnContext) => void | (() => void) | Promise<void | (() => void)>;

export interface CairnApp {
  route: <P extends Schema, Q extends Schema, B extends Schema>(
    pattern: string,
    def: RouteDef<P, Q, B>,
  ) => void;
  use: (plugin: (app: CairnApp) => void) => void;
  before: (fn: BeforeHook) => void;
  listen: (port: number) => import('node:http').Server;
  error: (status: number, message: string) => CairnError;
  redirect: (url: string) => CairnRedirect;
}

const ERROR_SYMBOL = Symbol('cairn.error');
const REDIRECT_SYMBOL = Symbol('cairn.redirect');

export class CairnError extends Error {
  readonly status: number;
  readonly [ERROR_SYMBOL] = true;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class CairnRedirect {
  readonly url: string;
  readonly [REDIRECT_SYMBOL] = true;
  constructor(url: string) {
    this.url = url;
  }
}

interface CompiledRoute {
  method: string;
  regex: RegExp;
  paramNames: string[];
  def: RouteDef;
}

// "METHOD /path/:param" -> regex. Escape the literal bits, swap ":name" for a
// capture group, anchor it so "/users" doesn't match "/users/1".
function compilePattern(pattern: string): CompiledRoute {
  const [method, path] = pattern.split(/\s+/, 2);
  if (!method || !path) throw new Error(`Invalid route pattern: "${pattern}"`);

  const paramNames: string[] = [];
  const escaped = path
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  return { method: method.toUpperCase(), regex: new RegExp(`^${escaped}$`), paramNames, def: {} as RouteDef };
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new CairnError(400, 'invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}

export function cairn(): CairnApp {
  const routes: CompiledRoute[] = [];
  const hooks: BeforeHook[] = [];

  const app: CairnApp = {
    route<P extends Schema, Q extends Schema, B extends Schema>(pattern: string, def: RouteDef<P, Q, B>) {
      const compiled = compilePattern(pattern);
      compiled.def = def as RouteDef;
      routes.push(compiled);
    },
    use(plugin) {
      plugin(app);
    },
    before(fn) {
      hooks.push(fn);
    },
    listen(port) {
      const server = createServer(async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const path = url.pathname;
          const query: Record<string, string> = {};
          url.searchParams.forEach((v, k) => (query[k] = v));

          const route = routes.find((r) => r.method === req.method && r.regex.test(path));
          if (!route) return sendJson(res, 404, { error: 'not found' });

          const match = route.regex.exec(path)!;
          const params: Record<string, string> = {};
          route.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1])));

          const body = await readBody(req);

          const ctx: CairnContext = { method: req.method ?? '', path, params, query, body, headers: req.headers };

          const afters: (() => void)[] = [];
          for (const hook of hooks) {
            const after = await hook(ctx);
            if (typeof after === 'function') afters.push(after);
          }

          const { def } = route;
          if (def.before) {
            const routeHooks = Array.isArray(def.before) ? def.before : [def.before];
            for (const hook of routeHooks) {
              const after = await hook(ctx);
              if (typeof after === 'function') afters.push(after);
            }
          }

          const typed: Record<string, unknown> = {};

          if (def.params) {
            const v = validateStringMap(def.params, ctx.params);
            if (!v.ok) return sendJson(res, 400, { error: 'invalid params', details: v.errors });
            typed.params = v.value;
          }
          if (def.query) {
            const v = validateStringMap(def.query, ctx.query);
            if (!v.ok) return sendJson(res, 400, { error: 'invalid query', details: v.errors });
            typed.query = v.value;
          }
          if (def.body) {
            const v = validateBody(def.body, ctx.body);
            if (!v.ok) return sendJson(res, 400, { error: 'invalid body', details: v.errors });
            typed.body = v.value;
          }

          const result = await def.handler(typed as never);
          if (result instanceof CairnRedirect) {
            res.writeHead(302, { location: result.url });
            res.end();
          } else {
            sendJson(res, 200, result);
          }
          afters.forEach((fn) => fn());
        } catch (err) {
          if (err instanceof CairnError) {
            sendJson(res, err.status, { error: err.message });
          } else {
            sendJson(res, 500, { error: 'internal server error' });
          }
        }
      });
      server.listen(port);
      return server;
    },
    error(status, message) {
      return new CairnError(status, message);
    },
    redirect(url) {
      return new CairnRedirect(url);
    },
  };

  return app;
}