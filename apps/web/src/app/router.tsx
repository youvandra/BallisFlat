import { createBrowserRouter } from "react-router";
import { AppShell } from "../components/playmat/AppShell";
import { RouteError } from "./RouteError";
import { RouteLoading } from "./RouteLoading";

// The landing is the first paint; every other screen loads on demand. Every screen browses without a
// wallet; the Binder, the Pack and Ops ask for one inline, and every write asks before it signs.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteError />,
    HydrateFallback: RouteLoading,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import("../features/landing/LandingPage")).LandingPage }),
      },
      {
        path: "rules",
        lazy: async () => ({ Component: (await import("../features/rules/RulesPage")).RulesPage }),
      },
      {
        path: "matches",
        lazy: async () => ({ Component: (await import("../features/matches/MatchesPage")).MatchesPage }),
      },
      {
        path: "m/:slug",
        lazy: async () => ({ Component: (await import("../features/market/MarketPage")).MarketPage }),
      },
      {
        path: "m/:slug/open/:tokenId",
        lazy: async () => ({ Component: (await import("../features/pack/PackPage")).PackPage }),
      },
      {
        path: "hunt",
        lazy: async () => ({ Component: (await import("../features/hunt/HuntPage")).HuntPage }),
      },
      {
        path: "binder",
        lazy: async () => ({ Component: (await import("../features/binder/BinderPage")).BinderPage }),
      },
      {
        path: "leaderboard",
        lazy: async () => ({
          Component: (await import("../features/leaderboard/LeaderboardPage")).LeaderboardPage,
        }),
      },
      { path: "ops", lazy: async () => ({ Component: (await import("../features/ops/OpsPage")).OpsPage }) },
      { path: "*", Component: RouteError },
    ],
  },
]);
