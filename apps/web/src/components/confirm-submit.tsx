"use client";

import { Button } from "@/components/ui";

/** Submit button that asks for confirmation before a destructive form action. */
export function ConfirmSubmit({ message, children }: { message: string; children: React.ReactNode }) {
  return (
    <Button variant="danger" type="submit" onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </Button>
  );
}
