"use client";

import type { ModelConfigSummary, ModelProviderId } from "@pichat/shared";
import { type FormEvent, useRef, useState } from "react";
import { apiErrorMessage } from "@/lib/api-client";
import {
  defaultDisplayName,
  modelProviders,
  modelsForKind,
  providerOptionsForKind,
} from "@/lib/model-config";
import { cn } from "@/lib/utils";
import { Drawer } from "../admin/drawer";
import { useToast } from "../admin/toast";
import { Badge, Button, FormField, InfoBanner, inputClass, selectClass } from "../admin/ui";
import { Icon } from "../icons";
import { useModelConfig } from "./model-config-provider";

interface FormErrors {
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
}

export function ModelConfigDrawer({ onClose }: { onClose: () => void }) {
  const {
    chatConfigs,
    activeConfig,
    error: loadError,
    saveConfig,
    removeConfig,
    setDefaultConfig,
  } = useModelConfig();
  const { showToast } = useToast();

  const initialProvider = activeConfig?.provider ?? "opencode-go";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ModelProviderId>(initialProvider);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(modelProviders[initialProvider].defaultBaseUrl);
  const [modelId, setModelId] = useState(
    activeConfig?.modelId ?? modelProviders[initialProvider].models[0]?.id ?? "",
  );
  const [displayName, setDisplayName] = useState("");
  const [makeDefault, setMakeDefault] = useState(chatConfigs.length === 0);
  const [showKey, setShowKey] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const baseUrlRef = useRef<HTMLInputElement>(null);
  const modelIdRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const editingConfig = editingId
    ? (chatConfigs.find((config) => config.id === editingId) ?? null)
    : null;
  const isEditing = editingConfig !== null;
  const isCurrentDefault = editingConfig?.isDefault ?? false;
  const providerDefinition = modelProviders[provider];
  const chatProviders = providerOptionsForKind("chat");
  const chatModels = modelsForKind(provider, "chat");

  function resetForm() {
    const nextProvider = activeConfig?.provider ?? "opencode-go";
    setEditingId(null);
    setProvider(nextProvider);
    setApiKey("");
    setBaseUrl(modelProviders[nextProvider].defaultBaseUrl);
    setModelId(modelProviders[nextProvider].models[0]?.id ?? "");
    setDisplayName("");
    setMakeDefault(chatConfigs.length === 0);
    setErrors({});
    setError(null);
    setShowKey(false);
  }

  function fillFromConfig(config: ModelConfigSummary) {
    setEditingId(config.id);
    setProvider(config.provider);
    setApiKey("");
    setBaseUrl(config.baseUrl || modelProviders[config.provider].defaultBaseUrl);
    setModelId(config.modelId);
    setDisplayName(config.displayName);
    setMakeDefault(config.isDefault);
    setErrors({});
    setError(null);
    setShowKey(false);
  }

  function selectProvider(next: ModelProviderId) {
    if (next === provider) {
      return;
    }
    setProvider(next);
    if (!isEditing) {
      setBaseUrl(modelProviders[next].defaultBaseUrl);
      setModelId(modelProviders[next].models[0]?.id ?? "");
      setDisplayName("");
    }
    setErrors({});
  }

  function handleEdit(config: ModelConfigSummary) {
    fillFromConfig(config);
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: FormErrors = {};
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
      setErrors(nextErrors);
      if (nextErrors.apiKey) {
        apiKeyRef.current?.focus();
      } else if (nextErrors.baseUrl) {
        baseUrlRef.current?.focus();
      } else {
        modelIdRef.current?.focus();
      }
      return;
    }

    const label = displayName.trim() || defaultDisplayName(provider, modelId);
    setSaving(true);
    setError(null);
    try {
      const saved = await saveConfig({
        id: editingId ?? undefined,
        kind: "chat",
        provider,
        apiKey: apiKey.trim() || undefined,
        baseUrl,
        modelId,
        displayName: label,
        makeDefault,
      });
      showToast(saved.isDefault ? `对话模型已切换为 ${label}` : `模型配置已保存：${label}`);
      onClose();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(config: ModelConfigSummary) {
    setError(null);
    try {
      await removeConfig(config.id);
      showToast(`已移除模型：${config.displayName}`);
      if (editingId === config.id) {
        resetForm();
      }
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }

  async function handleSetDefault(config: ModelConfigSummary) {
    setError(null);
    try {
      await setDefaultConfig(config.id);
      showToast(`默认模型已切换为 ${config.displayName}`);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title="模型配置"
      description="这里配置对话模型；Embedding、ReRank 与搜索引擎可在管理端「模型配置」「搜索引擎」中维护。配置在企业内共用，API Key 只返回脱敏信息。"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-subtle">API Key 由服务端加密保存，浏览器不持久化明文</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" form="model-config-form" disabled={saving}>
              {saving ? "保存中…" : isEditing ? "保存修改" : "保存模型"}
            </Button>
          </div>
        </div>
      }
    >
      {loadError ? (
        <div className="mb-4">
          <InfoBanner tone="danger" icon="alert-circle" title="模型配置加载失败">
            {loadError}
          </InfoBanner>
        </div>
      ) : null}

      {chatConfigs.length > 0 ? (
        <section>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-fg">已配置模型</h3>
            <Badge tone="outline">{chatConfigs.length}</Badge>
          </div>
          <ul className="mt-2 space-y-2">
            {chatConfigs.map((config) => {
              const isDefault = config.isDefault;
              return (
                <li
                  key={config.id}
                  className={cn(
                    "rounded-xl border p-3",
                    isDefault ? "border-accent bg-accent-soft/50" : "border-border bg-surface",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-subtle">
                      <Icon
                        name={config.provider === "opencode-go" ? "sparkles" : "key-round"}
                        size={14}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium text-fg">{config.displayName}</p>
                        {isDefault ? <Badge tone="accent">默认</Badge> : null}
                        {!config.hasApiKey ? <Badge tone="warning">密钥缺失</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-subtle">
                        {modelProviders[config.provider].label} · {config.modelId}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-subtle">
                        {config.baseUrl}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-subtle">
                        {config.apiKeyMasked || "未保存密钥"}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-subtle">
                        {config.createdByName ? `由 ${config.createdByName} 配置` : "创建人已删除"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {!isDefault ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleSetDefault(config)}
                      >
                        设为默认
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(config)}>
                      编辑
                    </Button>
                    <button
                      type="button"
                      onClick={() => void handleRemove(config)}
                      className="inline-flex h-9 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium text-danger transition-colors duration-150 hover:bg-danger-soft"
                    >
                      移除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-3 py-3 text-xs leading-5 text-subtle">
          还没有配置模型。保存后，企业内所有成员都可以在对话中选择并使用该模型。
        </div>
      )}

      <div ref={formRef} className="mt-5 scroll-mt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-fg">{isEditing ? "更新模型参数" : "添加模型"}</h3>
          {isEditing ? (
            <Button size="sm" variant="ghost" onClick={resetForm}>
              取消编辑
            </Button>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] leading-5 text-subtle">
          {isEditing
            ? "API Key 留空表示保留服务端已保存的密钥。"
            : "选择服务商后填写 API Key、Base URL 与模型 ID。同一服务商下可配置多个模型。"}
        </p>

        {error ? (
          <div className="mt-3">
            <InfoBanner tone="danger" icon="alert-circle" title="保存失败">
              {error}
            </InfoBanner>
          </div>
        ) : null}

        <form id="model-config-form" onSubmit={handleSubmit} className="mt-3 space-y-4" noValidate>
          <FormField
            id="model-provider"
            label="服务商"
            required
            hint={providerDefinition.description}
          >
            <div className="relative">
              <select
                id="model-provider"
                value={provider}
                onChange={(event) => selectProvider(event.target.value as ModelProviderId)}
                className={cn(selectClass, "appearance-none pr-8")}
              >
                {chatProviders.map((option) => (
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
            id="model-api-key"
            label="API Key"
            required={!isEditing}
            error={errors.apiKey}
            hint={
              isEditing
                ? `已保存密钥：${editingConfig?.apiKeyMasked || "未保存"}；留空表示不修改。`
                : "提交后立即加密存储，接口响应与日志都不会包含明文。"
            }
          >
            <div className="relative">
              <input
                ref={apiKeyRef}
                id="model-api-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setErrors((previous) => ({ ...previous, apiKey: undefined }));
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  isEditing
                    ? "留空保持现有密钥"
                    : provider === "deepseek"
                      ? "sk-…"
                      : "OpenCode Go API Key"
                }
                aria-invalid={errors.apiKey ? true : undefined}
                aria-describedby={errors.apiKey ? "model-api-key-error" : "model-api-key-hint"}
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
            id="model-base-url"
            label="Base URL"
            required
            error={errors.baseUrl}
            hint="OpenAI 兼容端点，可在服务商默认地址基础上修改。"
          >
            <input
              ref={baseUrlRef}
              id="model-base-url"
              type="url"
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                setErrors((previous) => ({ ...previous, baseUrl: undefined }));
              }}
              spellCheck={false}
              aria-invalid={errors.baseUrl ? true : undefined}
              aria-describedby={errors.baseUrl ? "model-base-url-error" : "model-base-url-hint"}
              className={cn(inputClass, "font-mono")}
            />
          </FormField>

          <FormField
            id="model-id"
            label="模型 ID"
            required
            error={errors.modelId}
            hint="可以选择建议值，也可以输入服务商支持的自定义模型 ID。"
          >
            <input
              ref={modelIdRef}
              id="model-id"
              value={modelId}
              onChange={(event) => {
                setModelId(event.target.value);
                setErrors((previous) => ({ ...previous, modelId: undefined }));
              }}
              list={`model-options-${provider}`}
              spellCheck={false}
              placeholder={chatModels[0]?.id ?? "model-id"}
              aria-invalid={errors.modelId ? true : undefined}
              aria-describedby={errors.modelId ? "model-id-error" : "model-id-hint"}
              className={cn(inputClass, "font-mono")}
            />
            <datalist id={`model-options-${provider}`}>
              {chatModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </datalist>
          </FormField>

          <FormField
            id="model-display-name"
            label="显示名称"
            hint="留空时使用模型 ID；显示在对话框底部的模型选择器中。"
          >
            <input
              id="model-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="留空则使用模型 ID"
              className={inputClass}
            />
          </FormField>

          <label className="flex items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={isCurrentDefault || makeDefault}
              disabled={isCurrentDefault}
              onChange={(event) => setMakeDefault(event.target.checked)}
              className="mt-0.5 size-4 cursor-pointer rounded border-border accent-accent disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span>
              <span className="font-medium text-fg">
                {isCurrentDefault ? "当前默认模型" : "设为对话默认模型"}
              </span>
              <span className="mt-0.5 block text-[11px] leading-5 text-subtle">
                {isCurrentDefault
                  ? "保存后仍保持默认；如需切换，请在已配置模型中选择其他模型设为默认。"
                  : "保存后输入框底部的模型会立即切换。"}
              </span>
            </span>
          </label>
        </form>
      </div>
    </Drawer>
  );
}
