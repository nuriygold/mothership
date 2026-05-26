import app from "./app";
import { logger } from "./lib/logger";
import { validateRuntimeEnv } from "./lib/env";
import { bootstrap as bootstrapOpsEngine } from "@/lib/ops/engine";
import { processDispatchQueue } from "@workspace/mothership/services/dispatch";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);
const DISPATCH_INTERVAL_MS = 30_000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

validateRuntimeEnv();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  bootstrapOpsEngine()
    .then(({ resumed }: { resumed: number }) => {
      logger.info({ resumed }, "ops engine bootstrapped");
    })
    .catch((bootErr: unknown) => {
      logger.error({ err: bootErr }, "ops engine bootstrap failed");
    });

  const runDispatchWorker = () => {
    processDispatchQueue()
      .then(({ processed, skipped }) => {
        if (processed > 0 || skipped > 0) {
          logger.info({ processed, skipped }, "dispatch queue processed");
        }
      })
      .catch((dispatchErr: unknown) => {
        logger.error({ err: dispatchErr }, "dispatch queue processing failed");
      });
  };

  runDispatchWorker();
  setInterval(runDispatchWorker, DISPATCH_INTERVAL_MS);
});
