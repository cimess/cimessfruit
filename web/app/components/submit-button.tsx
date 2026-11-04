"use client";
import { useFormStatus } from "react-dom";
export default function SubmitButton({ children, pendingLabel = "Please wait…", className = "button button-primary" }: { children: React.ReactNode; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} type="submit">{pending ? pendingLabel : children}</button>;
}
