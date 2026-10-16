// Setup environment for testing modules with worker references in Node.js
(globalThis as any).self = globalThis;
(globalThis as any).onmessage = null;
(globalThis as any).postMessage = () => {};
