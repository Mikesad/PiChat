"use client";

import { useCallback } from "react";
import { useToast } from "./toast";

export function useNotImplemented() {
  const { showToast } = useToast();

  return useCallback(
    (feature: string) => {
      showToast(`${feature}：本冲刺未接入`, "neutral");
    },
    [showToast],
  );
}
