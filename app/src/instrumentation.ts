/**
 * Next.js instrumentation hook — runs once per server process at boot.
 * Starts the in-process launchpad indexer (src/lib/launchpad/loop.ts) when
 * LAUNCH_SYNC_LOOP=1 (set in fly.toml [env]). Node runtime only.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.LAUNCH_SYNC_LOOP === "1") {
    const { startLaunchSyncLoop } = await import("./lib/launchpad/loop");
    startLaunchSyncLoop();
  }
}
