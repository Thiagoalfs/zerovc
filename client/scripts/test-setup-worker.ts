// Setup environment for testing modules with worker/AudioWorklet references in Node.js
globalThis.self = globalThis;
globalThis.onmessage = null;
globalThis.postMessage = () => {};
if (typeof globalThis.AudioWorkletNode === 'undefined') {
  globalThis.AudioWorkletNode = class AudioWorkletNode {};
}
if (typeof require !== 'undefined') {
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (typeof request === 'string' && request.endsWith('?url')) {
      return '';
    }
    return origLoad.apply(this, arguments);
  };
}
