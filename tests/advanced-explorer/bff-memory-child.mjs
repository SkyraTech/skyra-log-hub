// Test-only probe around the actual compiled BFF. Never enabled by product configuration.
const timer=setInterval(()=>process.send?.({memory:process.memoryUsage(),at:Date.now()}),50);timer.unref();
await import('../../apps/console-bff/dist/main.js');
