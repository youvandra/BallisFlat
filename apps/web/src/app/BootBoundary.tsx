import { Component, type ReactNode } from "react";
import { ReloadButton, StatusPage } from "../components/playmat/StatusPage";

type State = { failed: boolean };

/**
 * Catches a failure before the router exists (the game client could not start), which would otherwise
 * leave a blank page. Screens inside the router use RouteError instead.
 */
export class BootBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <StatusPage kind={navigator.onLine ? "boot" : "offline"} layout="screen">
        <ReloadButton />
      </StatusPage>
    );
  }
}
