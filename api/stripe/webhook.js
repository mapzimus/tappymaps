import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Disable body parser to get raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to get raw body.
//
// Must collect Buffers and concat them, NOT `data += chunk`. String
// concatenation decodes each chunk independently as UTF-8, so a multi-byte
// character straddling a chunk boundary decodes to replacement characters and
// the reconstructed body no longer matches the bytes Stripe signed — signature
// verification then fails intermittently, only for payloads containing
// non-ASCII (an accented customer name is enough) and only when the split
// lands mid-character. Stripe retries, so it presents as a flaky webhook
// rather than an obvious break.
export async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

// Resolve the Stripe price to the tier RLS checks. The database cannot know
// Stripe price IDs, so it reads user_subscriptions.tier instead — which means
// every write of a subscription row must set it, or the user's paid features
// stay locked at the database level even though they are paying.
function tierForPrice(priceId) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_CLASSROOM_MONTHLY_PRICE_ID) return 'classroom';
  return 'pro';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      res.status(400).json({ error: `Webhook Error: ${error.message}` });
      return;
    }

    // Handle events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        let userId = session.client_reference_id;

        // A session without client_reference_id used to `break` straight to a
        // 200, which tells Stripe the event was handled and permanently drops
        // a subscription the customer has already paid for. Recover by email
        // first; if that fails, fail loudly so Stripe retries and the failure
        // is visible in the dashboard rather than silently swallowed.
        if (!userId) {
          const email = session.customer_details?.email || session.customer_email;
          if (email) {
            const { data: found, error: lookupError } = await supabase
              .from('user_subscriptions')
              .select('user_id')
              .eq('stripe_customer_id', session.customer)
              .maybeSingle();
            if (!lookupError && found?.user_id) {
              userId = found.user_id;
              console.warn(`checkout.session.completed: recovered user ${userId} via stripe_customer_id`);
            }
          }
        }

        if (!userId) {
          console.error(
            'checkout.session.completed: no client_reference_id and no recoverable user for session ' +
            session.id + ' (customer ' + session.customer + ') — returning 500 so Stripe retries'
          );
          res.status(500).json({ error: 'Cannot attribute checkout session to a user' });
          return;
        }

        // Retrieve the subscription from Stripe
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription
        );

        // Stripe API 2024+ moved period fields onto subscription.items[0].
        // Fall back through both locations so this works on any API version.
        const firstItem = subscription.items.data[0];
        const periodStart = subscription.current_period_start ?? firstItem.current_period_start;
        const periodEnd = subscription.current_period_end ?? firstItem.current_period_end;

        // Upsert into user_subscriptions table
        const { error: upsertError } = await supabase
          .from('user_subscriptions')
          .upsert(
            {
              user_id: userId,
              stripe_subscription_id: subscription.id,
              stripe_customer_id: subscription.customer,
              status: subscription.status,
              current_period_start: new Date(periodStart * 1000).toISOString(),
              current_period_end: new Date(periodEnd * 1000).toISOString(),
              price_id: firstItem.price.id,
              tier: tierForPrice(firstItem.price.id),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );

        if (upsertError) {
          console.error('Failed to upsert subscription:', upsertError);
          res.status(500).json({ error: 'Database error during subscription creation' });
          return;
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;

        // See note in checkout.session.completed: period fields moved in 2024+ API.
        const firstItem = subscription.items.data[0];
        const periodStart = subscription.current_period_start ?? firstItem.current_period_start;
        const periodEnd = subscription.current_period_end ?? firstItem.current_period_end;

        // Update in user_subscriptions table
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: subscription.status,
            current_period_start: new Date(periodStart * 1000).toISOString(),
            current_period_end: new Date(periodEnd * 1000).toISOString(),
            price_id: firstItem.price.id,
            tier: tierForPrice(firstItem.price.id),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        if (updateError) {
          console.error('Failed to update subscription:', updateError);
          res.status(500).json({ error: 'Database error during subscription update' });
          return;
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        // Update status to canceled in user_subscriptions table
        const { error: deleteError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        if (deleteError) {
          console.error('Failed to delete subscription:', deleteError);
          res.status(500).json({ error: 'Database error during subscription deletion' });
          return;
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (subscriptionId) {
          const { error } = await supabase
            .from('user_subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscriptionId);
          if (error) {
            console.error('Failed to mark subscription past_due:', error);
            res.status(500).json({ error: 'Database error during payment failure handling' });
            return;
          }
        }
        break;
      }

      case 'charge.refunded': {
        // Log refund; subscription status will be updated by subscription.updated/deleted events
        const charge = event.data.object;
        console.log(`Refund processed for charge ${charge.id}, amount: ${charge.amount_refunded}`);
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
}
