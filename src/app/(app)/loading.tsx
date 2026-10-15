export default function AppLoading() {
  return (
    <div className="loading-page" role="status" aria-live="polite" aria-label="Loading workspace">
      <span className="sr-only">Loading workspace…</span>
      <div className="loading-line short" />
      <div className="loading-card">
        <div className="loading-line" />
        <div className="loading-line short" />
      </div>
      <div className="loading-card">
        <div className="loading-line" />
        <div className="loading-line" />
        <div className="loading-line short" />
      </div>
    </div>
  );
}
