import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return <div className="mx-auto max-w-3xl px-4 py-16"><EmptyState title="Venue not found" body="It may have been removed or is not yet approved." action={<ButtonLink href="/explore">Browse venues</ButtonLink>} /></div>;
}
