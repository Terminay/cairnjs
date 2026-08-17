import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createApp, store } from '../src/app.js';
import type { Link } from '../src/app.js';

function resetStore() {
  for (const key of [...store.keys()]) store.delete(key);
}

function startApp() {
  const server = createApp().listen(0);
  const port = (server.address() as { port: number }).port;
  return { port, close: () => server.close() };
}

function call(port: number, method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  return new Promise<{ status: number; headers: Record<string, string>; json: any }>((resolve, reject) => {
    const req = request(
      {
        host: 'localhost',
        port,
        method,
        path,
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string>, json: data ? JSON.parse(data) : null }));
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

test('create with generated slug', async () => {
  resetStore();
  const { port, close } = startApp();
  const res = await call(port, 'POST', '/links', { url: 'https://example.com/a' });
  close();
  assert.equal(res.status, 200);
  assert.equal(res.json.url, 'https://example.com/a');
  assert.match(res.json.slug, /^[a-zA-Z0-9]{6}$/);
  assert.ok(res.json.createdAt);
});

test('create with custom slug', async () => {
  resetStore();
  const { port, close } = startApp();
  const res = await call(port, 'POST', '/links', { url: 'https://example.com/b', slug: 'custom' });
  close();
  assert.equal(res.status, 200);
  assert.equal(res.json.slug, 'custom');
});

test('create with duplicate slug returns 409', async () => {
  resetStore();
  const { port, close } = startApp();
  await call(port, 'POST', '/links', { url: 'https://example.com/c', slug: 'dup' });
  const res = await call(port, 'POST', '/links', { url: 'https://example.com/d', slug: 'dup' });
  close();
  assert.equal(res.status, 409);
  assert.equal(res.json.error, 'slug already in use');
});

test('redirect increments click count', async () => {
  resetStore();
  const { port, close } = startApp();
  await call(port, 'POST', '/links', { url: 'https://example.com/e', slug: 'clk' });
  const redir = await call(port, 'GET', '/clk');
  const redir2 = await call(port, 'GET', '/clk');
  close();
  assert.equal(redir.status, 302);
  assert.equal(redir.headers.location, 'https://example.com/e');
  assert.equal(redir2.status, 302);
  const link: Link | undefined = store.get('clk');
  assert.equal(link?.clicks, 2);
});

test('stats reflects click count', async () => {
  resetStore();
  const { port, close } = startApp();
  await call(port, 'POST', '/links', { url: 'https://example.com/f', slug: 'stat' });
  await call(port, 'GET', '/stat');
  await call(port, 'GET', '/stat');
  const res = await call(port, 'GET', '/links/stat/stats');
  close();
  assert.equal(res.status, 200);
  assert.equal(res.json.clicks, 2);
  assert.equal(res.json.slug, 'stat');
});

test('delete without key returns 401', async () => {
  resetStore();
  const { port, close } = startApp();
  await call(port, 'POST', '/links', { url: 'https://example.com/g', slug: 'prot' });
  const res = await call(port, 'DELETE', '/links/prot');
  close();
  assert.equal(res.status, 401);
  assert.equal(res.json.error, 'unauthorized');
});

test('delete with correct key returns 200', async () => {
  resetStore();
  const { port, close } = startApp();
  await call(port, 'POST', '/links', { url: 'https://example.com/h', slug: 'gone' });
  const res = await call(port, 'DELETE', '/links/gone', undefined, { 'x-api-key': 'dogfood-secret' });
  close();
  assert.equal(res.status, 200);
  assert.equal(res.json.deleted, true);
  assert.equal(store.has('gone'), false);
});

test('redirect to missing slug returns 404', async () => {
  resetStore();
  const { port, close } = startApp();
  const res = await call(port, 'GET', '/nope');
  close();
  assert.equal(res.status, 404);
  assert.equal(res.json.error, 'link not found');
});