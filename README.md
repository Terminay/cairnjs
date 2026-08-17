# cairn

[![npm version](https://img.shields.io/npm/v/@cairnjs/core)](https://www.npmjs.com/package/@cairnjs/core)
[![build](https://img.shields.io/github/actions/workflow/status/Terminay/cairnjs/publish.yml)](https://github.com/Terminay/cairnjs/actions)
[![license](https://img.shields.io/github/license/Terminay/cairnjs)](https://github.com/Terminay/cairnjs/blob/main/LICENSE)

A minimal Node.js/TypeScript backend framework. A route's shape, validation, and handler live in one call: give it a schema, get a typed context and a runtime check. Handlers are async functions that take a typed context and return a plain value, which becomes the JSON response. No `req`/`res`/`next`, no external HTTP library, no validation library  just `node:http` and a small hand-rolled validator.

## Install

```sh
npm install @cairnjs/core
```

## Quick start

```ts
import { cairn } from '@cairnjs/core';

const app = cairn();

app.route('GET /users/:id', {
  params: { id: 'string' },
  handler: ({ params }) => ({ id: params.id, name: 'Ada Lovelace' }),
});

app.route('POST /users', {
  body: { name: 'string', age: 'number?' },
  handler: ({ body }) => ({ created: true, ...body }),
});

app.listen(3000);
```

## API

### `cairn()`

Returns an app instance.

### `app.route(pattern, def)`

`pattern` is `"METHOD /path/:param"`, e.g. `"GET /users/:id"`.

`def`:

| field | type | description |
|---|---|---|
| `params` | schema | validated + coerced from URL params |
| `query` | schema | validated + coerced from query string |
| `body` | schema | validated from parsed JSON body |
| `before` | `BeforeHook \| BeforeHook[]` | route-scoped hooks, run before validation |
| `handler` | `(ctx) => value \| Promise<value>` | return value becomes the JSON response |

The schema mini-language is `'string' | 'number' | 'boolean'`, with a trailing `?` for optional. The same schema drives the TypeScript type of `ctx.params` / `ctx.query` / `ctx.body`.

### `app.use(plugin)`

Plugins are functions that receive the app instance:

```ts
app.use((app) => {
  app.before((ctx) => {
    console.log(`${ctx.method} ${ctx.path}`);
  });
});
```

### `app.before(fn)`

Register a global hook that runs before the handler, receiving a mutable `ctx`. A hook may return an "after" callback that runs once the handler completes.

### `app.error(status, message)`

Returns a typed error. Throw it in a handler or hook to produce a JSON error response with that status:

```ts
throw app.error(404, 'not found');
```

### `app.redirect(url)`

Returns a redirect value. Return it from a handler to respond with a 302 + `Location` header.

### `app.listen(port)`

Starts a `node:http` server. Returns the server.

## Plugins

- [`@cairnjs/plugin-example`](packages/plugin-example)  logger. `app.use(loggerPlugin())`.
- [`@cairnjs/plugin-auth`](packages/plugin-auth)  route-scoped auth guard. `before: [authGuard({ key })]`.

## Examples

- [`examples/basic-api`](examples/basic-api)  minimal CRUD-ish app with the logger plugin.
- [`examples/url-shortener`](examples/url-shortener)  a URL shortener dogfooding the framework, with a friction log.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).

## Status

Early/experimental. The API will change.
