import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig } from "motion/react";
import { type ReactNode, Suspense, use } from "react";
import { RouterProvider } from "react-router";
import { PackLoader } from "../components/playmat/PackLoader";
import { gameClient } from "../lib/game/client";
import { GameContext, useGameSync } from "../lib/game/queries";
import { transitions } from "../lib/motion";
import { router } from "./router";

const loadMotionFeatures = () => import("../lib/motion-features").then((mod) => mod.domAnimation);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

function GameProvider({ children }: { children: ReactNode }) {
  const client = use(gameClient);
  useGameSync(client);
  return <GameContext value={client}>{children}</GameContext>;
}

function Booting() {
  return <PackLoader size="screen" />;
}

// Composition only: providers wrap the router, features own their own state.
export function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<Booting />}>
        <GameProvider>
          <MotionConfig reducedMotion="user" transition={transitions.base}>
            {/* Not strict: the Framer components in src/framer render full motion.* elements. */}
            <LazyMotion features={loadMotionFeatures}>
              <RouterProvider router={router} />
            </LazyMotion>
          </MotionConfig>
        </GameProvider>
      </Suspense>
    </QueryClientProvider>
  );
}
