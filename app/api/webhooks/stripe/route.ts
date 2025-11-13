import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ProPlanActivatedEmail from "@/emails/ProPlanActivatedEmail";
import PurchaseConfirmationEmail from "@/emails/PurchaseConfirmationEmail";
import { resend } from "@/lib/resend";
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
      case "customer.subscription.deleted":
        handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
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
  if (
    session.metadata &&
    session.metadata.courseTitle &&
    session.metadata.courseImage
  ) {
    await resend.emails.send({
      from: "MasterClass <onboarding@resend.dev>",
      to: user.email,
      subject: "Purchase Confirmed",
      react: PurchaseConfirmationEmail({
        customerName: user.name,
        courseTitle: session.metadata?.courseTitle,
        courseImage: session.metadata?.courseImage,
        courseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/courses/${courseId}`,
        purchaseAmount: session.amount_total! / 100,
      }),
    });
  }
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
      cancelAtPeriodEnd: !!subscription.cancel_at,
    });
    console.log("this is suc", subscription);

    console.log(
      `Successfully processed ${eventType} for subscription ${subscription.id}.`
    );
    const isCreation = eventType === "customer.subscription.created";
    if (isCreation) {
      await resend.emails.send({
        from: "MasterClass <onboarding@resend.dev>",
        to: user.email,
        subject: "Welcome to MasterClass Pro!",
        react: ProPlanActivatedEmail({
          name: user.name,
          planType: subscription.items.data[0].plan.interval,
          currentPeriodStart: subscription.items.data[0].current_period_start,
          currentPeriodEnd: subscription.items.data[0].current_period_end,
          url: process.env.NEXT_PUBLIC_APP_URL!,
        }),
      });
    }
  } catch (error) {
    console.log(
      `Error processing ${eventType} for subscription ${subscription.id}.`,
      error
    );
  }
}
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    await convex.mutation(api.subscriptions.removeSubscription, {
      stripeSubscriptionId: subscription.id,
    });
    console.log(`Successfully deleted subscription ${subscription.id}`);
  } catch (error) {
    console.error(`Error deleting subscription ${subscription.id}:`, error);
  }
}
