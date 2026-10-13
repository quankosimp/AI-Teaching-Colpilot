import { createContext, useContext, useSyncExternalStore } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppData } from "./model";
import { createDemoData, normalizeData } from "./demo";

export type Page =
  | "dashboard"
  | "students"
  | "student"
  | "materials"
  | "plan"
  | "grading"
  | "live"
  | "summary"
  | "recordings"
  | "account";
export type Toast = {
  id: string;
  text: string;
  kind: "success" | "info" | "error";
};
export type Store = {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  page: Page;
  go: (page: Page) => void;
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  selectedSessionId: string;
  setSelectedSessionId: (id: string) => void;
  toast: (text: string, kind?: Toast["kind"]) => void;
};
export const StoreContext = createContext<Store | null>(null);
export const useStore = () => {
  const store = useContext(StoreContext);
  if (!store) throw new Error("Missing store");
  return store;
};
export const STORAGE_KEY = "ai-teaching-copilot-frontend-v2";
const OLD_KEY = "ai-teaching-copilot-frontend-v1";
const read = () => {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.students) && Array.isArray(parsed.sessions))
        return normalizeData(parsed);
    }
  } catch {
    /* Keep old storage intact if it cannot be read. */
  }
  return createDemoData();
};
let snapshot = read();
// Persist migration once, before another tab can use the initial snapshot.
try {
  if (!localStorage.getItem(STORAGE_KEY))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
} catch {
  /* Report on the first write. */
}
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("teaching-copilot-v2")
    : null;
const refresh = () => {
  snapshot = read();
  notify();
};
channel?.addEventListener("message", refresh);
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) refresh();
});
let pending = Promise.resolve();
export const commitData = (
  updater: SetStateAction<AppData>,
): Promise<boolean> => {
  const commit = () => {
    const latest = read();
    const proposed = typeof updater === "function" ? updater(latest) : updater;
    if (proposed === latest) return false;
    const next = normalizeData(proposed);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      snapshot = next;
      notify();
      channel?.postMessage({ updated: Date.now() });
      return true;
    } catch {
      window.dispatchEvent(new CustomEvent("copilot-storage-error"));
      return false;
    }
  };
  // Serialize read-modify-write across same-origin tabs; each updater sees the latest data.
  const result = pending
    .then(async () => {
      if (navigator.locks)
        return navigator.locks.request("copilot-data", commit);
      return commit();
    })
    .catch(() => {
      window.dispatchEvent(new CustomEvent("copilot-storage-error"));
      return false;
    });
  pending = result.then(() => {});
  return result;
};
export const updateData: Dispatch<SetStateAction<AppData>> = (updater) => {
  void commitData(updater);
};
export const useProductData = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
export const resetDemo = () => updateData(createDemoData());
