import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { api } from "./_generated/api";
import stripe from "../lib/stripe";
import { resend } from "../lib/resend";
import WelcomeEmail from "../emails/WelcomeEmail";

const http = httpRouter();
const clerkWebhook = httpAction(async (ctx, request) => {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Missing CLERK_WEBHOOK_SECRET environment variable");
  }
  const svix_id = request.headers.get("svix-id");
  const svix_signature = request.headers.get("svix-signature");
  const svix_timestamp = request.headers.get("svix-timestamp");
  if (!svix_id || !svix_signature || !svix_timestamp) {
    return new Response("Error occured -- no svix headers", { status: 400 });
  }
  const payload = await request.json();
  const body = JSON.stringify(payload);
  const wh = new Webhook(webhookSecret);
  let evt: WebhookEvent;
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-signature": svix_signature,
      "svix-timestamp": svix_timestamp,
    }) as WebhookEvent;
  } catch (err) {
    console.log("Some error occured", err);
    return new Response("Error occured", { status: 400 });
  }
  const eventType = evt.type;
  if (eventType == "user.created") {
    const { email_addresses, first_name, last_name, id } = evt.data;
    const email = email_addresses[0]?.email_address;
    const name = `${first_name || ""} ${last_name || ""}`.trim();
    try {
      const customer = await stripe.customers.create({
        name,
        email,
        metadata: { clerkId: id },
      });
      await ctx.runMutation(api.users.createUser, {
        name,
        email,
        clerkId: id,
        stripeCustomerId: customer.id,
      });
      // if (process.env.NODE_ENV === "development") {
      await resend.emails.send({
        from: "MasterClass <onboarding@resend.dev>",
        to: email,
        subject: "Welcome to MasterClass",
        react: WelcomeEmail({ name, url: process.env.NEXT_PUBLIC_APP_URL! }),
      });
      // }
    } catch (error) {
      console.log("error saving user to convex", error);
      return new Response("Error saving user", { status: 500 });
    }
  }
  return new Response("Webhook processed successfully", { status: 200 });
});
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: clerkWebhook,
});

export default http;
