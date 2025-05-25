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

// Register tsx runtime compiler to handle TypeScript files
register();

if (workerData.scriptPath) {
  try {
    // Dynamic import of the TypeScript worker file
    await import(workerData.scriptPath);

  } catch (error) {
    parentPort?.postMessage({ 
      type: "error", 
      error: { 
        message: error.message,
        stack: error.stack,
        name: error.name 
      } 
    });
  }
}