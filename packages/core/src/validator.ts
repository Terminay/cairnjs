// Schema mini-language: 'string' | 'number' | 'boolean', trailing '?' = optional.
// URL params/query arrive as strings, so we coerce. Body is already JSON.parse'd.

export type Schema = Record<string, string>;

export type SchemaToType<S extends Schema> = {
  [K in keyof S as S[K] extends `${string}?` ? never : K]: S[K] extends 'string'
    ? string
    : S[K] extends 'number'
      ? number
      : S[K] extends 'boolean'
        ? boolean
        : never;
} & {
  [K in keyof S as S[K] extends `${string}?` ? K : never]?: S[K] extends 'string?'
    ? string
    : S[K] extends 'number?'
      ? number
      : S[K] extends 'boolean?'
        ? boolean
        : never;
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function coerce(raw: string, type: string): { ok: true; value: unknown } | { ok: false } {
  switch (type) {
    case 'string':
      return { ok: true, value: raw };
    case 'number': {
      const n = Number(raw);
      return Number.isNaN(n) ? { ok: false } : { ok: true, value: n };
    }
    case 'boolean':
      if (raw === 'true') return { ok: true, value: true };
      if (raw === 'false') return { ok: true, value: false };
      return { ok: false };
    default:
      return { ok: false };
  }
}

export function validateStringMap<S extends Schema>(
  schema: S,
  source: Record<string, string | undefined>,
): ValidationResult<SchemaToType<S>> {
  const errors: string[] = [];
  const value: Record<string, unknown> = {};

  for (const [key, spec] of Object.entries(schema)) {
    const optional = spec.endsWith('?');
    const type = optional ? spec.slice(0, -1) : spec;
    const raw = source[key];

    if (raw === undefined) {
      if (!optional) errors.push(`${key} is required`);
      continue;
    }

    const res = coerce(raw, type);
    if (!res.ok) {
      errors.push(`${key} must be a ${type}`);
      continue;
    }
    value[key] = res.value;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: value as SchemaToType<S> };
}

export function validateBody<S extends Schema>(
  schema: S,
  body: unknown,
): ValidationResult<SchemaToType<S>> {
  const errors: string[] = [];
  const value: Record<string, unknown> = {};

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: ['body must be a JSON object'] };
  }

  const record = body as Record<string, unknown>;

  for (const [key, spec] of Object.entries(schema)) {
    const optional = spec.endsWith('?');
    const type = optional ? spec.slice(0, -1) : spec;
    const raw = record[key];

    if (raw === undefined) {
      if (!optional) errors.push(`${key} is required`);
      continue;
    }

    const matches =
      type === 'string' ? typeof raw === 'string' : type === 'number' ? typeof raw === 'number' : type === 'boolean' ? typeof raw === 'boolean' : false;
    if (!matches) {
      errors.push(`${key} must be a ${type}`);
      continue;
    }
    value[key] = raw;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: value as SchemaToType<S> };
}