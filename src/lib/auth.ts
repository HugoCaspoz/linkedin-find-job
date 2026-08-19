import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  checkRateLimit,
  clientIp,
  isRateLimited,
  loginEmailKey,
} from "@/lib/rateLimit";

/**
 * Only *failed* attempts burn quota, so signing in normally never counts
 * against you. Both keys matter: the IP limit stops one host working through
 * many accounts, and the email limit stops a rotating-IP attack on a single
 * account — which is the one that actually bites here, since `clientIp` trusts
 * `x-forwarded-for` and an attacker can vary that header freely.
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const FAILED_LOGINS_PER_IP = 20;
const FAILED_LOGINS_PER_EMAIL = 10;

/** `code` is echoed in the redirect URL, so it must not reveal anything. */
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const rawEmail = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!rawEmail || !password) return null;

        // Registration stores emails lowercased; the unique index is
        // case-sensitive, so login has to normalise the same way.
        const email = rawEmail.trim().toLowerCase();

        const emailKey = loginEmailKey(email);
        const ipKey = `login:ip:${clientIp(request)}`;

        // Checked before the lookup, so a throttled attacker stops costing us
        // a query and a bcrypt compare.
        if (
          (await isRateLimited(ipKey, FAILED_LOGINS_PER_IP)) ||
          (await isRateLimited(emailKey, FAILED_LOGINS_PER_EMAIL))
        ) {
          throw new RateLimitedSignin();
        }

        const user = await prisma.user.findUnique({ where: { email } });
        const valid = user
          ? await bcrypt.compare(password, user.passwordHash)
          : false;

        if (!user || !valid) {
          await Promise.all([
            checkRateLimit(ipKey, FAILED_LOGINS_PER_IP, LOGIN_WINDOW_MS),
            checkRateLimit(emailKey, FAILED_LOGINS_PER_EMAIL, LOGIN_WINDOW_MS),
          ]);
          return null;
        }

        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) token.id = user.id;
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
