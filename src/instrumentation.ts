export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logNodeRuntime } = await import("./instrumentation-node");
    logNodeRuntime();
  }
}
