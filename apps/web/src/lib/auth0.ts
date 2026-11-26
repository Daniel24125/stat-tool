import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";

// Reads AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, APP_BASE_URL.
export const auth0 = new Auth0Client({
  authorizationParameters: { scope: "openid profile email" },
  async onCallback(error, ctx) {
    const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
    if (error) {
      // Log the real cause (e.g. invalid client secret); show the user a short message.
      // Code and message only: the cause can include token-endpoint details.
      console.error("[auth0 callback]", error.code, error.message);
      return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error.code ?? "login_failed")}`, base));
    }
    const returnTo = ctx.returnTo?.startsWith("/") ? ctx.returnTo : "/dashboard";
    return NextResponse.redirect(new URL(returnTo, base));
  },
});
