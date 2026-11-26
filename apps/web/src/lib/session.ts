import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth0 } from "./auth0";
import { db } from "./db";

/**
 * Returns the app's own User row for the logged-in Auth0 user, creating it on
 * first visit. Only users who have logged in to StatTool exist in this table,
 * which is what the member search reads (never the Auth0 tenant).
 */
export const currentUser = cache(async () => {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login");
  const u = session.user;
  return db.user.upsert({
    where: { auth0Sub: u.sub },
    update: { email: u.email ?? undefined, name: u.name ?? undefined, picture: u.picture ?? undefined, lastLoginAt: new Date() },
    create: { auth0Sub: u.sub, email: u.email, name: u.name, picture: u.picture },
  });
});
