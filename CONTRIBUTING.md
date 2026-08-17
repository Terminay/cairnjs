# Contributing

Thanks for looking. This is a small project, so keep changes small too.

## Setup

```sh
npm install
npm run build
```

## Running tests

```sh
npm test
```

Tests use `node:test` + `node:assert`. No test framework.

## Making changes

- Keep the core package small. If a feature isn't essential, it probably doesn't belong in core.
- Don't add runtime dependencies to `@cairnjs/core`. It runs on `node:http` only.
- Comments should explain *why*, not *what*. If a line is obvious, don't comment it.
- Run `npm test` before opening a PR. It builds and runs both example test suites.

## Opening a PR

Use the PR template. Keep the diff focused  one logical change per PR. If you're fixing a bug, include a test that reproduces it.

## Reporting bugs

Open an issue with the bug report template. Include a minimal reproduction if you can.

## Security issues

Don't open a public issue for security bugs. See [SECURITY.md](SECURITY.md).