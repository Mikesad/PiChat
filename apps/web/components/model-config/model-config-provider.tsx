"use client";

import type {
  CreateModelConfigRequest,
  ModelConfigSummary,
  ModelKind,
  ModelProviderId,
} from "@pichat/shared";
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
  kind: ModelKind;
  provider: ModelProviderId;
  apiKey?: string;
  baseUrl: string;
  modelId: string;
  displayName: string;
  makeDefault: boolean;
}

interface ModelConfigContextValue {
  configs: ModelConfigSummary[];
  chatConfigs: ModelConfigSummary[];
  embeddingConfigs: ModelConfigSummary[];
  rerankConfigs: ModelConfigSummary[];
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
      kind: input.kind,
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
            .map((config) =>
              config.id === saved.id || config.kind !== saved.kind
                ? config
                : { ...config, isDefault: false },
            )
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
        .map((config) => ({
          ...config,
          isDefault:
            config.id === response.modelConfig.id
              ? true
              : config.kind === response.modelConfig.kind
                ? false
                : config.isDefault,
        }))
        .sort(sortConfigs),
    );
  }, []);

  const openConfig = useCallback(() => setIsOpen(true), []);
  const closeConfig = useCallback(() => setIsOpen(false), []);

  const chatConfigs = useMemo(() => configs.filter((config) => config.kind === "chat"), [configs]);
  const embeddingConfigs = useMemo(
    () => configs.filter((config) => config.kind === "embedding"),
    [configs],
  );
  const rerankConfigs = useMemo(
    () => configs.filter((config) => config.kind === "rerank"),
    [configs],
  );
  const defaultConfigId = useMemo(
    () => chatConfigs.find((config) => config.isDefault)?.id ?? null,
    [chatConfigs],
  );
  const activeConfig = useMemo(
    () => chatConfigs.find((config) => config.isDefault) ?? chatConfigs[0] ?? null,
    [chatConfigs],
  );

  return (
    <ModelConfigContext.Provider
      value={{
        configs,
        chatConfigs,
        embeddingConfigs,
        rerankConfigs,
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
  if (left.kind !== right.kind) {
    return left.kind.localeCompare(right.kind);
  }
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
