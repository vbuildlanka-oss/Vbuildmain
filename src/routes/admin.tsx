import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

// The editor (and supabase-js) load only when /admin is opened, so the public site stays light.
export const Route = createFileRoute("/admin")({
  component: lazyRouteComponent(() => import("@/admin/AdminApp"), "AdminApp"),
});
