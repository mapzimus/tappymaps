// Fake Stripe client. Returns globalThis.__TEST.stripeSub, or throws
// globalThis.__TEST.stripeError, and records every retrieve call.
export default class Stripe {
  constructor() {
    this.subscriptions = {
      retrieve: async (id) => {
        globalThis.__TEST.retrieves.push(id);
        if (globalThis.__TEST.stripeError) throw globalThis.__TEST.stripeError;
        return globalThis.__TEST.stripeSub;
      },
    };
    this.webhooks = { constructEvent: (b) => JSON.parse(b.toString('utf8')) };
    this.checkout = { sessions: { create: async () => ({ url: 'https://stub' }) } };
    this.customers = { list: async () => ({ data: [] }) };
  }
}
