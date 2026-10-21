"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { defaultDisplayName, type ModelConfig, type ModelProviderId } from "@/lib/model-config";
import { ModelConfigDrawer } from "./model-config-drawer";

const CONFIGS_KEY = "pichat-model-configs-v2";
const DEFAULT_KEY = "pichat-default-model-v2";
const KEY_PREFIX = "pichat-model-key-v2-";

export interface SaveModelConfigInput {
  provider: ModelProviderId;
  apiKey: string;
  baseUrl: string;
  modelId: string;
  displayName: string;
  makeDefault: boolean;
}

interface ModelConfigContextValue {
  configs: ModelConfig[];
  defaultConfigId: ModelProviderId | null;
  activeConfig: ModelConfig | null;
  ready: boolean;
  isOpen: boolean;
  openConfig: () => void;
  closeConfig: () => void;
  saveConfig: (input: SaveModelConfigInput) => void;
  removeConfig: (provider: ModelProviderId) => void;
  setDefaultConfig: (provider: ModelProviderId) => void;
}

const ModelConfigContext = createContext<ModelConfigContextValue | null>(null);

function isProvider(value: unknown): value is ModelProviderId {
  return value === "opencode-go" || value === "deepseek";
}

function persist(configs: ModelConfig[], defaultProvider: ModelProviderId | null) {
  try {
    window.localStorage.setItem(
      CONFIGS_KEY,
      JSON.stringify(
        configs.map((config) => ({
          provider: config.provider,
          baseUrl: config.baseUrl,
          modelId: config.modelId,
          displayName: config.displayName,
          configuredAt: config.configuredAt,
        })),
      ),
    );
    if (defaultProvider) {
      window.localStorage.setItem(DEFAULT_KEY, defaultProvider);
    } else {
      window.localStorage.removeItem(DEFAULT_KEY);
    }
  } catch {
    // Persistence is best-effort; the current tab still works.
  }
}

export function ModelConfigProvider({ children }: { children: ReactNode }) {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [defaultConfigId, setDefaultConfigId] = useState<ModelProviderId | null>(null);
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CONFIGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<Partial<ModelConfig>>;
        const loaded = parsed.flatMap((item) => {
          if (!isProvider(item.provider) || !item.baseUrl || !item.modelId) {
            return [];
          }
          const provider = item.provider;
          return [
            {
              provider,
              apiKey: window.sessionStorage.getItem(KEY_PREFIX + provider) ?? "",
              baseUrl: item.baseUrl,
              modelId: item.modelId,
              displayName: item.displayName ?? item.modelId,
              configuredAt: item.configuredAt ?? new Date().toISOString(),
            } satisfies ModelConfig,
          ];
        });
        setConfigs(loaded);

        const storedDefault = window.localStorage.getItem(DEFAULT_KEY);
        if (
          isProvider(storedDefault) &&
          loaded.some((config) => config.provider === storedDefault)
        ) {
          setDefaultConfigId(storedDefault);
        } else {
          setDefaultConfigId(loaded[0]?.provider ?? null);
        }
      }
    } catch {
      // Ignore malformed local data and start with no configured models.
    } finally {
      setReady(true);
    }
  }, []);

  const saveConfig = useCallback(
    (input: SaveModelConfigInput) => {
      const next: ModelConfig = {
        provider: input.provider,
        apiKey: input.apiKey.trim(),
        baseUrl: input.baseUrl.trim(),
        modelId: input.modelId.trim(),
        displayName: input.displayName.trim() || defaultDisplayName(input.provider, input.modelId),
        configuredAt: new Date().toISOString(),
      };
      const exists = configs.some((config) => config.provider === next.provider);
      const nextConfigs = exists
        ? configs.map((config) => (config.provider === next.provider ? next : config))
        : [...configs, next];
      const nextDefault =
        input.makeDefault || !defaultConfigId || defaultConfigId === next.provider
          ? next.provider
          : defaultConfigId;

      setConfigs(nextConfigs);
      setDefaultConfigId(nextDefault);
      persist(nextConfigs, nextDefault);
      try {
        window.sessionStorage.setItem(KEY_PREFIX + next.provider, next.apiKey);
      } catch {
        // The key stays in memory for this tab when storage is unavailable.
      }
    },
    [configs, defaultConfigId],
  );

  const removeConfig = useCallback(
    (provider: ModelProviderId) => {
      const nextConfigs = configs.filter((config) => config.provider !== provider);
      const nextDefault =
        defaultConfigId === provider ? (nextConfigs[0]?.provider ?? null) : defaultConfigId;
      setConfigs(nextConfigs);
      setDefaultConfigId(nextDefault);
      persist(nextConfigs, nextDefault);
      try {
        window.sessionStorage.removeItem(KEY_PREFIX + provider);
      } catch {
        // Ignore storage failures.
      }
    },
    [configs, defaultConfigId],
  );

  const setDefaultConfig = useCallback(
    (provider: ModelProviderId) => {
      if (!configs.some((config) => config.provider === provider)) {
        return;
      }
      setDefaultConfigId(provider);
      persist(configs, provider);
    },
    [configs],
  );

  const openConfig = useCallback(() => setIsOpen(true), []);
  const closeConfig = useCallback(() => setIsOpen(false), []);

  const activeConfig = useMemo(
    () => configs.find((config) => config.provider === defaultConfigId) ?? configs[0] ?? null,
    [configs, defaultConfigId],
  );

  return (
    <ModelConfigContext.Provider
      value={{
        configs,
        defaultConfigId,
        activeConfig,
        ready,
        isOpen,
        openConfig,
        closeConfig,
        saveConfig,
        removeConfig,
        setDefaultConfig,
      }}
    >
      {children}
      {isOpen ? <ModelConfigDrawer onClose={closeConfig} /> : null}
    </ModelConfigContext.Provider>
  );
}

export function useModelConfig() {
  const value = useContext(ModelConfigContext);
  if (!value) {
    throw new Error("useModelConfig must be used within ModelConfigProvider");
  }
  return value;
}
