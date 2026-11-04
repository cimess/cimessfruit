import type { Adapter } from "next-auth/adapters";
import { emailSchema } from "../../validation/auth-validation";

// Preserve the adapter's account-linking policy; normalize only email identity.
export function normalizedEmailAdapter(adapter: Adapter): Adapter {
  const { createUser, updateUser, getUserByEmail } = adapter;
  if (!createUser || !updateUser || !getUserByEmail) throw Error("Email-capable adapter required");
  return {
    ...adapter,
    createUser: user => createUser({ ...user, email: emailSchema.parse(user.email) }),
    updateUser: user => updateUser({
      ...user,
      ...(user.email !== undefined ? { email: emailSchema.parse(user.email) } : {}),
    }),
    getUserByEmail: email => getUserByEmail(emailSchema.parse(email)),
  };
}
