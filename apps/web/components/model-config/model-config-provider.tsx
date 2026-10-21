"use client";

import type { CreateModelConfigRequest, ModelConfigSummary, ModelProviderId } from "@pichat/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  apiErrorMessage,
  createModelConfig,
  deleteModelConfig,
  fetchModelConfigs,
  setDefaultModelConfig,
  updateModelConfig,
} from "@/lib/api-client";
import { useAuth } from "../auth/auth-provider";
import { ModelConfigDrawer } from "./model-config-drawer";

export interface SaveModelConfigInput {
  id?: string;
  provider: ModelProviderId;
  apiKey?: string;
  baseUrl: string;
  modelId: string;
  displayName: string;
  makeDefault: boolean;
}

interface ModelConfigContextValue {
  configs: ModelConfigSummary[];
  defaultConfigId: string | null;
  activeConfig: ModelConfigSummary | null;
  ready: boolean;
  error: string | null;
  isOpen: boolean;
  openConfig: () => void;
  closeConfig: () => void;
  reload: () => Promise<void>;
  saveConfig: (input: SaveModelConfigInput) => Promise<ModelConfigSummary>;
  removeConfig: (id: string) => Promise<void>;
  setDefaultConfig: (id: string) => Promise<void>;
}

const ModelConfigContext = createContext<ModelConfigContextValue | null>(null);

export function ModelConfigProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<ModelConfigSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!user) {
      setConfigs([]);
      setError(null);
      setReady(true);
      return;
    }

    try {
      const response = await fetchModelConfigs();
      if (requestId !== requestIdRef.current) {
        return;
      }
      setConfigs(response.modelConfigs);
      setError(null);
    } catch (cause) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setConfigs([]);
      setError(apiErrorMessage(cause));
    } finally {
      if (requestId === requestIdRef.current) {
        setReady(true);
      }
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveConfig = useCallback(async (input: SaveModelConfigInput) => {
    const payload: CreateModelConfigRequest = {
      provider: input.provider,
      modelId: input.modelId.trim(),
      displayName: input.displayName.trim(),
      baseUrl: input.baseUrl.trim(),
      apiKey: input.apiKey?.trim() ?? "",
      makeDefault: input.makeDefault,
    };

    let saved: ModelConfigSummary;
    if (input.id) {
      const { apiKey, ...rest } = payload;
      const response = await updateModelConfig(input.id, {
        ...rest,
        apiKey: apiKey.length > 0 ? apiKey : undefined,
      });
      saved = response.modelConfig;
    } else {
      const response = await createModelConfig(payload);
      saved = response.modelConfig;
    }

    setConfigs((previous) => {
      const others = previous.filter((config) => config.id !== saved.id);
      const next = [...others, saved];
      return saved.isDefault
        ? next
            .map((config) => (config.id === saved.id ? config : { ...config, isDefault: false }))
            .sort(sortConfigs)
        : next.sort(sortConfigs);
    });
    return saved;
  }, []);

  const removeConfig = useCallback(async (id: string) => {
    await deleteModelConfig(id);
    setConfigs((previous) => previous.filter((config) => config.id !== id));
  }, []);

  const setDefaultConfig = useCallback(async (id: string) => {
    const response = await setDefaultModelConfig(id);
    setConfigs((previous) =>
      previous
        .map((config) => ({ ...config, isDefault: config.id === response.modelConfig.id }))
        .sort(sortConfigs),
    );
  }, []);

  const openConfig = useCallback(() => setIsOpen(true), []);
  const closeConfig = useCallback(() => setIsOpen(false), []);

  const defaultConfigId = useMemo(
    () => configs.find((config) => config.isDefault)?.id ?? null,
    [configs],
  );
  const activeConfig = useMemo(
    () => configs.find((config) => config.isDefault) ?? configs[0] ?? null,
    [configs],
  );

  return (
    <ModelConfigContext.Provider
      value={{
        configs,
        defaultConfigId,
        activeConfig,
        ready,
        error,
        isOpen,
        openConfig,
        closeConfig,
        reload,
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

function sortConfigs(left: ModelConfigSummary, right: ModelConfigSummary) {
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}

export function useModelConfig() {
  const value = useContext(ModelConfigContext);
  if (!value) {
    throw new Error("useModelConfig must be used within ModelConfigProvider");
  }
  return value;
}
