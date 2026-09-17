import { createApp } from "../index.js";
import { startup } from "../app/core/startup.js";

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      // Ensure role is set to api for serverless environment
      if (!process.env.PROCESS_ROLE) {
        process.env.PROCESS_ROLE = "api";
      }
      if (!process.env.REDIS_DISABLED) {
        process.env.REDIS_DISABLED = "true";
      }
      
      // Execute database startup & dependency validation
      await startup();
      
      // Return Express app without starting HTTP server.listen()
      return createApp();
    })();
  }
  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    console.error("Vercel Serverless Function Error:", error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Server Initialization Failed",
      details: error.message
    });
  }
}
