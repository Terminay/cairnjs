import { cairn } from '@cairnjs/core';
import { loggerPlugin } from '@cairnjs/plugin-example';

const app = cairn();

app.use(loggerPlugin());

app.route('GET /users/:id', {
  params: { id: 'string' },
  handler: ({ params }) => {
    return { id: params.id, name: 'Ada Lovelace', email: 'ada@example.com' };
  },
});

app.route('POST /users', {
  body: { name: 'string', age: 'number?' },
  handler: ({ body }) => {
    return { created: true, ...body };
  },
});

app.listen(3000);