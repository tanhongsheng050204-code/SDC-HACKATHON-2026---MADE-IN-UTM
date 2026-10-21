import { Component, ReactNode } from "react";
import { t } from "../lib/i18n";

// One screen failing to render must not blank the whole app: the sidebar stays usable and the
// person gets a way out. Keyed by screen, so moving to another screen resets it.
export class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section>
        <div className="banner error" role="alert">
          <strong>{t("err.screen")}</strong> {t("err.screenNext")}
        </div>
        <button className="primary" onClick={() => window.location.reload()}>{t("err.reload")}</button>
      </section>
    );
  }
}
