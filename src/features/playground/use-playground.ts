"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";

import type { Dictionary } from "@/i18n/dictionaries/en";

import type {
  PlaygroundController,
  PlaygroundState,
} from "./playground-controller";

export type PlaygroundCopy = Dictionary["playground"];

export const PlaygroundContext = createContext<PlaygroundController | null>(
  null,
);

export function usePlaygroundController(): PlaygroundController {
  const controller = useContext(PlaygroundContext);
  if (!controller)
    throw new Error(
      "Playground components must be rendered inside <Playground>",
    );
  return controller;
}

/** Subscribes to a slice of the playground state; re-renders only when that slice changes. */
export function usePlayground<T>(selector: (state: PlaygroundState) => T): T {
  return useStore(usePlaygroundController().store, selector);
}
