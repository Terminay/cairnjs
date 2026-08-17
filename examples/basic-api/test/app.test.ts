import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { cairn } from '@cairnjs/core';
import { loggerPlugin } from '@cairnjs/plugin-example';

function startApp() {
  const app = cairn();
  app.use(loggerPlugin());

  app.route('GET /users/:id', {
    params: { id: 'string' },
    handler: ({ params }) => ({ id: params.id, name: 'Ada' }),
  });

  app.route('POST /users', {
    body: { name: 'string', age: 'number?' },
    handler: ({ body }) => ({ created: true, ...body }),
  });

  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  return { port, close: () => server.close() };
}

function call(port: number, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const req = request(
      { host: 'localhost', port, method, path, headers: body ? { 'content-type': 'application/json' } : {} },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, json: data ? JSON.parse(data) : null }));
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

test('route matching with params', async () => {
  const { port, close } = startApp();
  const res = await call(port, 'GET', '/users/42');
  close();
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { id: '42', name: 'Ada' });
});

test('passing validation', async () => {
  const { port, close } = startApp();
  const res = await call(port, 'POST', '/users', { name: 'Grace', age: 36 });
  close();
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { created: true, name: 'Grace', age: 36 });
});

test('failing validation returns 400', async () => {
  const { port, close } = startApp();
  const res = await call(port, 'POST', '/users', { name: 'Grace', age: 'old' });
  close();
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'invalid body');
});

test('plugin hook fires', async () => {
  const logs: string[] = [];
  const original = console.log;
  console.log = (msg: string) => logs.push(msg);

  const { port, close } = startApp();
  await call(port, 'GET', '/users/7');
  close();

  console.log = original;
  assert.ok(logs.some((l) => l.includes('GET /users/7')));
});