import initVodozemacWasm, {
  Account,
  Session,
  GroupSession,
  InboundGroupSession,
  InboundResult,
  InitOutput
} from '@kinsh/vodozemac-wasm';

let initPromise: Promise<InitOutput | void> | null = null;

export async function ensureVodozemacInitialized(): Promise<InitOutput | void> {
  if (typeof initVodozemacWasm === 'function') {
    if (!initPromise) {
      initPromise = initVodozemacWasm();
    }
    return initPromise;
  }
  // In Node.js / CJS target, WASM is initialized synchronously upon import
  return Promise.resolve();
}

export {
  Account,
  Session,
  GroupSession,
  InboundGroupSession,
  InboundResult
};
export type { InitOutput };
