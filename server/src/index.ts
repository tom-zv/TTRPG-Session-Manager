import { createServer } from './app.js';
import { serverConfig } from './config/server-config.js';

// A rejected promise nobody awaited must not take down the server (and every live encounter with it).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const { app, httpServer } = createServer();

httpServer.listen(serverConfig.port, serverConfig.host, () => {
  console.log(`Server running at http://${serverConfig.host}:${serverConfig.port}`);
});

export default app;
