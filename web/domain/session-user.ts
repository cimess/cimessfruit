export type UserRole = "CUSTOMER" | "ADMIN";

export const safeUserSelect = {
  id: true, name: true, email: true, image: true, phone: true, role: true, isActive: true,
} as const;

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
};

export function activeUser(user: SessionUser | null | undefined): SessionUser | null {
  return user?.id && user.isActive === true &&
    (user.role === "CUSTOMER" || user.role === "ADMIN") ? user : null;
}
