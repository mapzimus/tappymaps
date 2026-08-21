// Minimal PostgREST-shaped fake covering the query chains the handlers build.
function chain(table) {
  const q = {
    _filters: {},
    select() { return q; },
    eq(col, val) { q._filters[col] = val; return q; },
    in(col, vals) { q._filters[col] = { in: vals }; return q; },
    async maybeSingle() { return { data: match(table), error: null }; },
    async single() {
      const d = match(table);
      return d ? { data: d, error: null } : { data: null, error: { code: 'PGRST116' } };
    },
    update(patch) {
      globalThis.__TEST.updates.push(patch);
      return { eq: async () => ({ error: null }), async then(r) { r({ error: null }); } };
    },
    upsert() { return { async then(r) { r({ error: null }); } }; },
  };
  return q;
}
function match(table) {
  if (table !== 'user_subscriptions') return null;
  const row = globalThis.__TEST.row;
  if (!row) return null;
  return { ...row };
}
export function createClient() {
  return {
    from: (table) => chain(table),
    auth: {
      async getUser(token) {
        if (!token) return { data: { user: null }, error: new Error('no token') };
        return { data: { user: { id: 'u1', email: 'test@example.com' } }, error: null };
      },
    },
  };
}
