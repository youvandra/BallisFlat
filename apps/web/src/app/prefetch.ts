/**
 * Fetches every page's code once the first page is in, so later route changes find it in cache and never
 * wait on the network for code.
 */
export function prefetchPages() {
  void Promise.allSettled([
    import("../features/landing/LandingPage"),
    import("../features/rules/RulesPage"),
    import("../features/matches/MatchesPage"),
    import("../features/market/MarketPage"),
    import("../features/pack/PackPage"),
    import("../features/hunt/HuntPage"),
    import("../features/binder/BinderPage"),
    import("../features/leaderboard/LeaderboardPage"),
  ]);
}
