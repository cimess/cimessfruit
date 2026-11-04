import type { SessionUser } from "../domain/session-user";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }
  interface User {
    phone: string | null;
    role: SessionUser["role"];
    isActive: boolean;
  }
}
