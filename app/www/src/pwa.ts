import { registerSW } from 'virtual:pwa-register';

type PwaUpdateState = {
  needRefresh: boolean;
  offlineReady: boolean;
};

type PwaListener = (state: PwaUpdateState) => void;

const state: PwaUpdateState = {
  needRefresh: false,
  offlineReady: false
};

const listeners = new Set<PwaListener>();

function notify() {
  for (const listener of listeners) {
    listener({ ...state });
  }
}

export function subscribePwaUpdates(listener: PwaListener) {
  listeners.add(listener);
  listener({ ...state });
  return () => {
    listeners.delete(listener);
  };
}

export function refreshPwa() {
  void updateSw?.(true);
}

let updateSw: ((reloadPage?: boolean) => Promise<void>) | undefined;

export function registerPwa() {
  updateSw = registerSW({
    onNeedRefresh() {
      state.needRefresh = true;
      notify();
    },
    onOfflineReady() {
      state.offlineReady = true;
      notify();
    }
  });
}
