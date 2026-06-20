import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl gold-text">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page doesn't exist.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-[--gold] px-4 py-2 text-sm font-display uppercase tracking-widest text-[--primary-foreground]"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl gold-text">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-md bg-[--gold] px-4 py-2 text-sm font-display uppercase tracking-widest text-[--primary-foreground]"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "World Cup 2026 Guesser" },
      { name: "description", content: "Pick winners for every World Cup 2026 match and track your score." },
      { name: "theme-color", content: "#1a1a2a" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const NAV_LINKS: Array<{ to: string; label: string; exact?: boolean }> = [
  { to: "/", label: "Guess", exact: true },
  { to: "/room", label: "Room" },
  { to: "/results", label: "Results" },
  { to: "/groups", label: "Groups" },
  { to: "/visualization", label: "Chart" },
  { to: "/personas", label: "Personas" },
];

function NavBar() {
  const [open, setOpen] = useState(false);
  const baseLink =
    "px-3 py-1.5 rounded text-xs font-display uppercase tracking-widest text-muted-foreground hover:text-[--gold]";
  const activeLink =
    "px-3 py-1.5 rounded text-xs font-display uppercase tracking-widest text-[--gold]";

  return (
    <nav className="border-b border-[--gold-deep]/40 bg-background/60 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="font-display text-lg gold-text shrink-0">
          WC&nbsp;26
        </Link>

        {/* Desktop links */}
        <div className="hidden sm:flex gap-1">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={l.exact ? { exact: true } : undefined}
              className={baseLink}
              activeProps={{ className: activeLink }}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="sm:hidden inline-flex items-center justify-center h-10 w-10 rounded border border-[--gold-deep]/40 text-[--gold]"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-72 border-l border-[--gold-deep]/40 bg-background"
          >
            <div className="mt-8 flex flex-col gap-1">
              <div className="font-display text-lg gold-text mb-4">WC 26</div>
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  activeOptions={l.exact ? { exact: true } : undefined}
                  onClick={() => setOpen(false)}
                  className="px-4 py-3 rounded text-base font-display uppercase tracking-widest text-muted-foreground hover:text-[--gold] hover:bg-[--gold-deep]/10"
                  activeProps={{
                    className:
                      "px-4 py-3 rounded text-base font-display uppercase tracking-widest text-[--gold] bg-[--gold-deep]/15",
                  }}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <NavBar />
      <Outlet />
      <Toaster theme="dark" position="top-center" />
    </QueryClientProvider>
  );
}
