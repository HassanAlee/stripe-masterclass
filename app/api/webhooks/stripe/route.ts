import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import stripe from "@/lib/stripe";
import { ConvexHttpClient } from "convex/browser";
import Stripe from "stripe";
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("Stripe-Signature") as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    console.log("Webhook signature verification failed", error);
    return new Response("Webhook signature verification failed", {
      status: 400,
    });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        handleSubscriptionUpsert(
          event.data.object as Stripe.Subscription,
          event.type
        );
        break;
      default:
        console.log("Unhandled event type", event.type);
        break;
    }
    return new Response("Webhook processed successfully", { status: 201 });
  } catch (error) {
    console.log("Webhook processing failed", error);
    return new Response("Webhook  processing failed", { status: 500 });
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  const courseId = session?.metadata?.courseId;
  const stripeCustomerId = session.customer as string;
  if (!courseId || !stripeCustomerId) {
    throw new Error("Missing courseId or stripeCustomerId");
  }
  const user = await convex.query(api.users.getUserByStripeCustomerId, {
    stripeCustomerId,
  });
  if (!user) {
    throw new Error("User not found");
  }
  await convex.mutation(api.purchases.recordPurchase, {
    userId: user._id,
    courseId: courseId as Id<"courses">,
    amount: session.amount_total as number,
    stripePurchaseId: session.id,
  });
}
async function handleSubscriptionUpsert(
  subscription: Stripe.Subscription,
  eventType: string
) {
  if (subscription.status !== "active" || !subscription.latest_invoice) {
    console.log(
      `Skipping subscription ${subscription.id} - status:${subscription.id}`
    );
    return;
  }
  const stripeCustomerId = subscription.customer.toString();
  const user = await convex.query(api.users.getUserByStripeCustomerId, {
    stripeCustomerId,
  });
  if (!user)
    throw new Error(`User not found with stripe id: ${stripeCustomerId}`);
  try {
    await convex.mutation(api.subscriptions.upsertSubscription, {
      userId: user._id,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      planType: subscription.items.data[0].plan.interval as "month" | "year",
      currentPeriodStart: subscription.items.data[0].current_period_start,
      currentPeriodEnd: subscription.items.data[0].current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
    console.log(
      `Successfully processed ${eventType} for subscription ${subscription.id}.`
    );
  } catch (error) {
    console.log(
      `Error processing ${eventType} for subscription ${subscription.id}.`,
      error
    );
  }
}
