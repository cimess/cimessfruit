"use client";
import { clearDeviceDrafts } from "./browser-drafts";
export default function ClearDrafts() {
  return (
    <button
      type="submit"
      className="button"
      onClick={async (event) => {
        event.preventDefault();
        const form = event.currentTarget.form;
        await clearDeviceDrafts().catch(() => {});
        form?.requestSubmit();
      }}
    >
      Sign out
    </button>
  );
}
