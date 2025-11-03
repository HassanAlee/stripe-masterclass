"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { useState } from "react";

export default function PurchaseButton({
  courseId,
}: {
  courseId: Id<"courses">;
}) {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const createCheckoutSession = useAction(api.stripe.createCheckoutSession);
  const userData = useQuery(
    api.users.getUserByClerkId,
    user ? { clerkId: user?.id } : "skip"
  );
  const hasAccess = useQuery(
    api.users.getUserAccess,
    userData ? { userId: userData?._id, courseId } : "skip"
  ) || { hasAccess: false };
  const handlePurchase = async () => {
    if (!user) return alert("Please login to purchase");
    setIsLoading(true);
    try {
      const { checkoutUrl } = await createCheckoutSession({ courseId });
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        throw new Error("Failed to create checkout url");
      }
    } catch (error) {
      console.log("error creating checkout url", error);
    } finally {
      setIsLoading(false);
    }
  };
  if (!hasAccess.hasAccess)
    return (
      <Button variant={"outline"} onClick={handlePurchase}>
        Enroll now
      </Button>
    );
  if (hasAccess.hasAccess) return <Button variant={"outline"}>Enrolled</Button>;
  if (isLoading) return <Spinner />;
}
