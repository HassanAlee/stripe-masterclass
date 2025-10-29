import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { api } from "./_generated/api";

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
      await ctx.runMutation(api.users.createUser, { name, email, clerkId: id });
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
