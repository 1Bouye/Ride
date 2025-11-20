// Dev launcher that ensures port 8080 is free before starting the server
// Works on Windows PowerShell where '&&' in npm scripts can be unreliable

const killPort = require('kill-port');
const { fork } = require('child_process');

const WS_PORT = process.env.WS_PORT ? Number(process.env.WS_PORT) : 8080;

async function start() {
  try {
    await killPort(WS_PORT, 'tcp');
    // Give OS a moment to release the port
    await new Promise((res) => setTimeout(res, 250));
  } catch (err) {
    // If nothing was listening, ignore
  }

  // Start the server
  const child = fork('server.js', [], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});


