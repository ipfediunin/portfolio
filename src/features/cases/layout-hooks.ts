import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

/** A media query's current answer; `serverValue` is what the server render assumes. */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** An element's border-box height in whole pixels, updated when it changes size (0 before mount). */
export function useElementHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const box = entry.borderBoxSize[0];
      setHeight(Math.round(box ? box.blockSize : entry.contentRect.height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}
