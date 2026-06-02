/**
 * TypeScript Worker Thread Resolver
 * 
 * This resolver enables using TypeScript files directly in Node.js Worker Threads.
 * Node.js Worker Threads currently don't natively support TS files, so this resolver
 * acts as a bridge that:
 *   1. Registers the tsx compiler to handle TypeScript at runtime
 *   2. Dynamically imports the actual TypeScript worker file
 * 
 */
import { register } from "tsx/esm/api";
import { parentPort, workerData } from "node:worker_threads";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

// Register tsx runtime compiler to handle TypeScript files
register({ tsconfig: fileURLToPath(new URL("../../../tsconfig.json", import.meta.url)) });

if (workerData.scriptPath) {
  try {
    // Dynamic import of the TypeScript worker file
    await import(pathToFileURL(workerData.scriptPath).href);

  } catch (error) {
    parentPort?.postMessage({ 
      type: "error", 
      jobId: workerData.jobId,
      error: { 
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : "Error"
      } 
    });
    parentPort?.close();
  }
}
