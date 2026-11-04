export function needsGooglePassword(credentials: { passwordHash: string | null; accounts: { provider: string }[] } | null) {
  return !!credentials && !credentials.passwordHash && credentials.accounts.some((account) => account.provider === "google");
}
