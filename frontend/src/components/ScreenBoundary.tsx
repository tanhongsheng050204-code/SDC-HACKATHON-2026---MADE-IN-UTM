import { Component, ReactNode } from "react";

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
          <strong>Something went wrong on this screen.</strong> Your profile is safe. Reload the page or pick another section on the left.
        </div>
        <button className="primary" onClick={() => window.location.reload()}>Reload</button>
      </section>
    );
  }
}
