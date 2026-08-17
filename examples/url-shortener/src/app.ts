import { cairn, type CairnApp } from '@cairnjs/core';
import { loggerPlugin } from '@cairnjs/plugin-example';
import { authGuard } from '@cairnjs/plugin-auth';

export interface Link {
  slug: string;
  url: string;
  createdAt: string;
  clicks: number;
}

export const store = new Map<string, Link>();

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomSlug(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

export function createApp(): CairnApp {
  const app = cairn();
  app.use(loggerPlugin());

  app.route('POST /links', {
    body: { url: 'string', slug: 'string?' },
    handler: ({ body }) => {
      // schema can't express "looks like a URL", so it's a manual check.
      if (!/^https?:\/\//.test(body.url)) throw app.error(400, 'url must start with http:// or https://');

      let slug = body.slug;
      if (slug === undefined) {
        slug = randomSlug(6);
        while (store.has(slug)) slug = randomSlug(6);
      } else if (store.has(slug)) {
        throw app.error(409, 'slug already in use');
      }

      const link: Link = { slug, url: body.url, createdAt: new Date().toISOString(), clicks: 0 };
      store.set(slug, link);
      return { slug, url: body.url, createdAt: link.createdAt };
    },
  });

  app.route('GET /:slug', {
    params: { slug: 'string' },
    handler: ({ params }) => {
      const link = store.get(params.slug);
      if (!link) throw app.error(404, 'link not found');
      link.clicks++;
      return app.redirect(link.url);
    },
  });

  app.route('GET /links/:slug/stats', {
    params: { slug: 'string' },
    handler: ({ params }) => {
      const link = store.get(params.slug);
      if (!link) throw app.error(404, 'link not found');
      return { slug: link.slug, url: link.url, clicks: link.clicks, createdAt: link.createdAt };
    },
  });

  app.route('DELETE /links/:slug', {
    params: { slug: 'string' },
    before: [authGuard({ key: 'dogfood-secret' })],
    handler: ({ params }) => {
      const link = store.get(params.slug);
      if (!link) throw app.error(404, 'link not found');
      store.delete(params.slug);
      return { deleted: true, slug: params.slug };
    },
  });

  return app;
}