// Module loader hook: swaps @supabase/supabase-js and stripe for in-memory
// fakes so the real serverless handlers can be exercised without credentials
// or network. State lives on globalThis.__TEST and is reset per test case.
export async function resolve(specifier, context, next) {
  if (specifier === '@supabase/supabase-js') {
    return { url: new URL('./supabase-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (specifier === 'stripe') {
    return { url: new URL('./stripe-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
