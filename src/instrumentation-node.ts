import { version, versions } from "node:process";

/** Log the managed runtime patch once per instance, without request data. */
export function logNodeRuntime() {
  console.info(
    JSON.stringify({
      event: "node_runtime_version",
      node: version,
      brotli: versions.brotli,
    }),
  );
}
