/** Shown on every page of the website demo, so nobody thinks their changes are saved. */
export function DemoBanner() {
  return (
    <div className="demo-banner" role="note">
      <span>
        <b>Live demo.</b> A read-only copy of the TEA Workbench with a real analysis of the example app. Click around: changes work on screen but
        aren&apos;t saved.
      </span>
      <a className="btn btn-small btn-primary" href="https://github.com/deepbratt/TEA#-quick-start">
        Get TEA for your app
      </a>
    </div>
  );
}
