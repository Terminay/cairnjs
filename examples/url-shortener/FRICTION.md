# Friction log

Every point where Cairn felt awkward during this URL-shortener dogfood pass.

## 1. No way to return a redirect / non-200-status response → added `app.redirect()`

- **Trying to do:** `GET /:slug` returning a 302 redirect with a `Location` header.
- **Awkward:** Handler values are always serialized as JSON with status 200. There was no way to set a status code or a non-JSON body. This isn't a stylistic preference — a shortener is unusable without it.
- **What I did:** Added a `CairnRedirect` value + `app.redirect(url)`, mirroring `app.error()`. The pipeline checks for it after the handler and writes a 302 + `Location` header. Small, and it feels consistent with the `error()` design. But it's worth noting the general gap: handlers can only produce "200 JSON" or the two built-in value types (`CairnError`, `CairnRedirect`). Any other status/header scenario (e.g. 201 with a body, custom headers) still can't be expressed today.

## 2. Context has no access to request headers → added `headers` to `CairnContext`

- **Trying to do:** read `x-api-key` in a hook/plugin for the auth route.
- **Awkward:** `CairnContext` only exposed `method/path/params/query/body`. A real app basically always needs headers (auth, content-type sniffing, etc.). This wasn't workaround-able without reaching into the raw request, which handlers can't see.
- **What I did:** Added `headers: IncomingHttpHeaders` to `CairnContext`, populated from `req.headers`. Small, obvious fix. (Should probably also expose the raw request/response at some point for escape hatches, but I didn't need it here.)

## 3. Schema mini-language can't express "looks like a URL" → manual check in handler

- **Trying to do:** validate that `url` is a string starting with `http://` or `https://` via the schema.
- **Awkward:** The schema only has `string`/`number`/`boolean` + `?`. There's no way to express a format/pattern constraint. The task explicitly said not to extend the schema language for this one case, so I didn't.
- **What I did:** kept `url: 'string'` in the schema, then did the `^https?://` check manually in the handler and threw `app.error(400, ...)`. This works but splits the validation across two places — schema for type, handler for format — which is exactly the kind of thing a framework would want to unify eventually (e.g. an `'url'` type or a regex syntax in the mini-language).

## 4. `before()` hooks are global only → plugin has to re-implement route matching

- **Trying to do:** an `authPlugin` that protects only `DELETE /links/:slug`, not every route.
- **Awkward:** `app.use()` gives the plugin a bare `(app) => void`, and `app.before()` registers a globally-applied hook. There is no way to attach a hook to a specific route. So the plugin had to take an explicit list of `"METHOD /path"` patterns and re-compile them into regexes — duplicating the router's own matching logic — then string-match inside the global hook. The plugin can't reference the actual registered route objects; it re-parses patterns from strings. If a pattern were mistyped it would silently never match.
- **What I did first:** implemented `authPlugin({ key, routes })` doing its own route matching in a `before` hook. Clean enough for a plugin, but clearly a workaround.

- **Resolution (done):** added `before?: BeforeHook | BeforeHook[]` to `RouteDef`. The pipeline now runs a matched route's own hooks (after any global `before()` hooks, before validation). The auth guard no longer needs route matching at all — it became `authGuard({ key })`, a plain `BeforeHook` that checks `ctx.headers` and throws `CairnError(401)` — and the app attaches it directly to the route:

  ```ts
  app.route('DELETE /links/:slug', {
    before: [authGuard({ key: 'dogfood-secret' })],
    handler: ...
  });
  ```

  Scoping is now expressed by *where you place the hook*, not by the hook re-implementing the router. Trade-off: route hooks receive the raw `CairnContext` (same as global hooks), not a ctx already typed from that route's schemas — acceptable for now since guards typically only need `method/path/headers`. Typed per-route hooks would be a natural follow-up.

- **Validation note:** this validated the plugin contract twice against two real needs — the logger exercises global `app.before()` hooks; the auth guard exercises route-scoped `before` hooks. Both coexist in the same app with no special casing.

## 5. Hooks are evaluated per-request, so `use()` order doesn't bite

- **Trying to do:** nothing specific — just noting the mental model. `before()` hooks run per-request in registration order, so plugins don't need to be registered before the routes they affect. No workaround needed; this is fine as-is.
