"use client";

import type { ModelConfigSummary, ModelKind, ModelProviderId } from "@pichat/shared";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { apiErrorMessage } from "@/lib/api-client";
import {
  defaultDisplayName,
  modelKinds,
  modelProviders,
  modelsForKind,
  providerOptionsForKind,
} from "@/lib/model-config";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "../icons";
import { useModelConfig } from "../model-config/model-config-provider";
import { ConfirmDialog } from "./confirm-dialog";
import { Drawer } from "./drawer";
import { useToast } from "./toast";
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  InfoBanner,
  inputClass,
  PageHeader,
  SearchInput,
  selectClass,
} from "./ui";

type KindFilter = "all" | ModelKind;

const kindMeta: Record<
  ModelKind,
  { label: string; icon: IconName; description: string; configurable: boolean }
> = {
  chat: {
    label: "对话",
    icon: "message-square",
    description: "用于 Agent 对话与工具调用",
    configurable: true,
  },
  embedding: {
    label: "Embedding",
    icon: "database",
    description: "用于知识库向量化，创建知识库时选择",
    configurable: true,
  },
  rerank: {
    label: "ReRank",
    icon: "arrow-up-down",
    description: "用于知识库检索结果重排序",
    configurable: true,
  },
  vision: {
    label: "视觉",
    icon: "image",
    description: "视觉模型配置暂仅展示，当前版本未接入",
    configurable: false,
  },
  speech: {
    label: "语音",
    icon: "mic",
    description: "语音模型配置暂仅展示，当前版本未接入",
    configurable: false,
  },
};

const tabs: Array<{ id: KindFilter; label: string }> = [
  { id: "all", label: "全部" },
  ...modelKinds.map((kind) => ({ id: kind, label: kindMeta[kind].label })),
];

export function ModelSettings() {
  const {
    configs,
    saveConfig,
    removeConfig,
    setDefaultConfig,
    error: loadError,
  } = useModelConfig();
  const { showToast } = useToast();
  const [tab, setTab] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ModelConfigSummary | null>(null);
  const [creatingKind, setCreatingKind] = useState<ModelKind | null>(null);
  const [removing, setRemoving] = useState<ModelConfigSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      configs.filter((config) => {
        if (tab !== "all" && config.kind !== tab) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }
        const provider = modelProviders[config.provider];
        return (
          config.displayName.toLowerCase().includes(normalizedQuery) ||
          config.modelId.toLowerCase().includes(normalizedQuery) ||
          provider.label.toLowerCase().includes(normalizedQuery) ||
          kindMeta[config.kind].label.toLowerCase().includes(normalizedQuery)
        );
      }),
    [configs, normalizedQuery, tab],
  );

  const activeKind: ModelKind = tab === "all" ? "chat" : tab;
  const activeConfigurable = kindMeta[activeKind].configurable;
  const drawerOpen = editing !== null || creatingKind !== null;

  function openCreate() {
    if (!activeConfigurable) {
      return;
    }
    setActionError(null);
    setEditing(null);
    setCreatingKind(activeKind);
  }

  function openEdit(config: ModelConfigSummary) {
    if (!kindMeta[config.kind].configurable) {
      return;
    }
    setActionError(null);
    setEditing(config);
    setCreatingKind(null);
  }

  function closeDrawer() {
    setEditing(null);
    setCreatingKind(null);
  }

  async function handleSetDefault(config: ModelConfigSummary) {
    setActionError(null);
    try {
      await setDefaultConfig(config.id);
      showToast(`默认${kindMeta[config.kind].label}模型已切换为 ${config.displayName}`);
    } catch (cause) {
      setActionError(apiErrorMessage(cause));
    }
  }

  async function handleRemove(config: ModelConfigSummary) {
    setActionError(null);
    try {
      await removeConfig(config.id);
      showToast(`已移除模型：${config.displayName}`);
      setRemoving(null);
    } catch (cause) {
      setActionError(apiErrorMessage(cause));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="模型与能力"
        title="模型配置"
        description="按账号管理对话、Embedding 与 ReRank 模型。视觉和语音模型仅展示分类，本版本不接入。API Key 由服务端加密保存。"
        actions={
          <Button onClick={openCreate} disabled={!activeConfigurable}>
            <Icon name="plus" size={15} />
            添加模型
          </Button>
        }
      />

      {loadError ? (
        <InfoBanner tone="danger" icon="alert-circle" title="模型配置加载失败">
          {loadError}
        </InfoBanner>
      ) : null}
      {actionError ? (
        <InfoBanner tone="danger" icon="alert-circle" title="操作失败">
          {actionError}
        </InfoBanner>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-2 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="模型类型" className="flex min-w-0 flex-wrap gap-1">
          {tabs.map((item) => {
            const count =
              item.id === "all"
                ? configs.length
                : configs.filter((config) => config.kind === item.id).length;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors duration-150",
                  active
                    ? "bg-accent-soft text-accent-text"
                    : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {item.id === "all" ? (
                  <Icon name="grid" size={13} />
                ) : (
                  <Icon name={kindMeta[item.id].icon} size={13} />
                )}
                {item.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    active ? "bg-surface text-accent-text" : "bg-surface-2 text-subtle",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="搜索模型或服务商"
          label="搜索模型"
          className="sm:max-w-xs"
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={tab === "all" ? "sparkles" : kindMeta[tab].icon}
            title={normalizedQuery ? "没有匹配的模型" : "还没有配置模型"}
            description={
              normalizedQuery
                ? "换一个关键词，或切换到其他模型类型后再试。"
                : kindMeta[activeKind].description
            }
            action={
              activeConfigurable ? (
                <Button onClick={openCreate} variant="secondary">
                  <Icon name="plus" size={14} />
                  添加模型
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((config) => (
            <ModelCard
              key={config.id}
              config={config}
              showKind={tab === "all"}
              onEdit={() => openEdit(config)}
              onSetDefault={() => void handleSetDefault(config)}
              onRemove={() => setRemoving(config)}
            />
          ))}
          {activeConfigurable && !normalizedQuery ? (
            <button
              type="button"
              onClick={openCreate}
              className="flex min-h-[152px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface/60 text-subtle transition-colors duration-150 hover:border-accent hover:bg-accent-soft/40 hover:text-fg"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-surface-2">
                <Icon name="plus" size={17} />
              </span>
              <span className="text-xs font-medium">添加模型</span>
            </button>
          ) : null}
        </div>
      )}

      {drawerOpen ? (
        <ModelConfigFormDrawer
          kind={(editing?.kind ?? creatingKind) as ModelKind}
          config={editing}
          onClose={closeDrawer}
          onSaved={(saved) => {
            showToast(
              saved.isDefault
                ? `默认${kindMeta[saved.kind].label}模型已切换为 ${saved.displayName}`
                : `模型配置已保存：${saved.displayName}`,
            );
            closeDrawer();
          }}
          onSave={saveConfig}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            void handleRemove(removing);
          }
        }}
        title="移除模型配置？"
        description={
          removing
            ? `将删除「${removing.displayName}」的服务端配置。已创建的知识库不会重新向量化。`
            : ""
        }
        confirmLabel="移除"
        tone="danger"
      />
    </div>
  );
}

function ModelCard({
  config,
  showKind,
  onEdit,
  onSetDefault,
  onRemove,
}: {
  config: ModelConfigSummary;
  showKind: boolean;
  onEdit: () => void;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  const meta = kindMeta[config.kind];
  const provider = modelProviders[config.provider];
  return (
    <article
      className={cn(
        "flex flex-col rounded-xl border bg-surface p-3.5 transition-colors duration-150",
        config.isDefault ? "border-accent" : "border-border",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent-text">
          <Icon name={meta.icon} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-medium text-fg">{config.displayName}</h3>
            {config.isDefault ? <Badge tone="accent">默认</Badge> : null}
            {!config.hasApiKey ? <Badge tone="warning">密钥缺失</Badge> : null}
          </div>
          <p className="mt-0.5 text-[11px] text-subtle">
            {provider.shortLabel} · {config.modelId}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {showKind ? <Badge tone="outline">{meta.label}</Badge> : null}
            <span className="font-mono text-[10px] text-subtle">
              {config.apiKeyMasked || "未保存密钥"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
        {!config.isDefault ? (
          <Button size="sm" variant="ghost" onClick={onSetDefault}>
            设为默认
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onEdit}>
          编辑
        </Button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium text-danger transition-colors duration-150 hover:bg-danger-soft"
        >
          移除
        </button>
      </div>
    </article>
  );
}

function ModelConfigFormDrawer({
  kind,
  config,
  onClose,
  onSaved,
  onSave,
}: {
  kind: ModelKind;
  config: ModelConfigSummary | null;
  onClose: () => void;
  onSaved: (config: ModelConfigSummary) => void;
  onSave: ReturnType<typeof useModelConfig>["saveConfig"];
}) {
  const providerOptions = providerOptionsForKind(kind);
  const initialProvider =
    config?.provider ?? providerOptions[0]?.id ?? ("opencode-go" as ModelProviderId);
  const [provider, setProvider] = useState<ModelProviderId>(initialProvider);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    config?.baseUrl || modelProviders[initialProvider].defaultBaseUrl,
  );
  const [modelId, setModelId] = useState(
    config?.modelId ?? modelsForKind(initialProvider, kind)[0]?.id ?? "",
  );
  const [displayName, setDisplayName] = useState(config?.displayName ?? "");
  const [makeDefault, setMakeDefault] = useState(config?.isDefault ?? false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    apiKey?: string;
    modelId?: string;
    baseUrl?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const modelIdRef = useRef<HTMLInputElement>(null);
  const baseUrlRef = useRef<HTMLInputElement>(null);
  const isEditing = config !== null;
  const meta = kindMeta[kind];
  const providerDefinition = modelProviders[provider];
  const models = modelsForKind(provider, kind);

  function selectProvider(next: ModelProviderId) {
    setProvider(next);
    if (!isEditing) {
      setBaseUrl(modelProviders[next].defaultBaseUrl);
      setModelId(modelsForKind(next, kind)[0]?.id ?? "");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof fieldErrors = {};
    if (!isEditing && apiKey.trim().length === 0) {
      nextErrors.apiKey = "请输入 API Key";
    }
    if (!/^https?:\/\//.test(baseUrl.trim())) {
      nextErrors.baseUrl = "请输入以 http:// 或 https:// 开头的 Base URL";
    }
    if (modelId.trim().length === 0) {
      nextErrors.modelId = "请输入模型 ID";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      if (nextErrors.apiKey) {
        apiKeyRef.current?.focus();
      } else if (nextErrors.baseUrl) {
        baseUrlRef.current?.focus();
      } else {
        modelIdRef.current?.focus();
      }
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const label = displayName.trim() || defaultDisplayName(provider, modelId);
      const saved = await onSave({
        id: config?.id,
        kind,
        provider,
        apiKey: apiKey.trim() || undefined,
        baseUrl,
        modelId,
        displayName: label,
        makeDefault,
      });
      onSaved(saved);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={`${isEditing ? "编辑" : "添加"}${meta.label}模型`}
      description={meta.description}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-subtle">API Key 由服务端加密保存，浏览器只拿到脱敏信息</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button type="submit" form="admin-model-form" disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      }
    >
      {error ? (
        <div className="mb-4">
          <InfoBanner tone="danger" icon="alert-circle" title="保存失败">
            {error}
          </InfoBanner>
        </div>
      ) : null}

      <form id="admin-model-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField
          id="admin-model-provider"
          label="服务商"
          required
          hint={providerDefinition.description}
        >
          <div className="relative">
            <select
              id="admin-model-provider"
              value={provider}
              onChange={(event) => selectProvider(event.target.value as ModelProviderId)}
              className={cn(selectClass, "appearance-none pr-8")}
            >
              {providerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <Icon
              name="chevron-down"
              size={13}
              className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-subtle"
            />
          </div>
        </FormField>

        <FormField
          id="admin-model-api-key"
          label="API Key"
          required={!isEditing}
          error={fieldErrors.apiKey}
          hint={
            isEditing
              ? `已保存密钥：${config?.apiKeyMasked || "未保存"}；留空表示不修改。`
              : "提交后立即加密存储，接口响应与日志都不会包含明文。"
          }
        >
          <div className="relative">
            <input
              ref={apiKeyRef}
              id="admin-model-api-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setFieldErrors((previous) => ({ ...previous, apiKey: undefined }));
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder={
                isEditing
                  ? "留空保持现有密钥"
                  : provider === "deepseek"
                    ? "sk-…"
                    : provider === "siliconflow"
                      ? "sk-…"
                      : "OpenCode Go API Key"
              }
              className={cn(inputClass, "pr-10")}
            />
            <button
              type="button"
              onClick={() => setShowKey((previous) => !previous)}
              aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
              className="absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <Icon name={showKey ? "eye-off" : "eye"} size={14} />
            </button>
          </div>
        </FormField>

        <FormField
          id="admin-model-base-url"
          label="Base URL"
          required
          error={fieldErrors.baseUrl}
          hint="OpenAI 兼容端点；Embedding/ReRank 仅作为配置记录，实际调用由 RAGFlow 使用模型名完成。"
        >
          <input
            ref={baseUrlRef}
            id="admin-model-base-url"
            type="url"
            value={baseUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value);
              setFieldErrors((previous) => ({ ...previous, baseUrl: undefined }));
            }}
            spellCheck={false}
            className={cn(inputClass, "font-mono")}
          />
        </FormField>

        <FormField
          id="admin-model-id"
          label={kind === "chat" ? "模型 ID" : "RAGFlow 模型名"}
          required
          error={fieldErrors.modelId}
          hint={
            kind === "chat"
              ? "可以选择建议值，也可以输入服务商支持的自定义模型 ID。"
              : "保持 RAGFlow 的模型名格式，例如 BAAI/bge-m3@SILICONFLOW。"
          }
        >
          <input
            ref={modelIdRef}
            id="admin-model-id"
            value={modelId}
            onChange={(event) => {
              setModelId(event.target.value);
              setFieldErrors((previous) => ({ ...previous, modelId: undefined }));
            }}
            list={`admin-model-options-${provider}`}
            spellCheck={false}
            placeholder={models[0]?.id ?? "model-id"}
            className={cn(inputClass, "font-mono")}
          />
          <datalist id={`admin-model-options-${provider}`}>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </datalist>
        </FormField>

        <FormField
          id="admin-model-display-name"
          label="显示名称"
          hint="留空时使用模型 ID，显示在模型卡片与对话模型选择器中。"
        >
          <input
            id="admin-model-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="留空则使用模型 ID"
            className={inputClass}
          />
        </FormField>

        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={config?.isDefault || makeDefault}
            disabled={config?.isDefault}
            onChange={(event) => setMakeDefault(event.target.checked)}
            className="mt-0.5 size-4 cursor-pointer rounded border-border accent-accent disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span>
            <span className="font-medium text-fg">
              {config?.isDefault ? `当前默认${meta.label}模型` : `设为默认${meta.label}模型`}
            </span>
            <span className="mt-0.5 block text-[11px] leading-5 text-subtle">
              {kind === "embedding"
                ? "新建知识库时会优先使用该 Embedding 配置。"
                : kind === "rerank"
                  ? "知识库检索会使用该 ReRank 模型进行结果重排序。"
                  : "保存后对话输入框底部的模型会立即切换。"}
            </span>
          </span>
        </label>
      </form>
    </Drawer>
  );
}
