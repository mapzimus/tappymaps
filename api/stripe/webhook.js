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

// Helper to get raw body
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', reject);
  });
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
        const userId = session.client_reference_id;

        if (!userId) {
          console.warn('checkout.session.completed: no client_reference_id');
          break;
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
