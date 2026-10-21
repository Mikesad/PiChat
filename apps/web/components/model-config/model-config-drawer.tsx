"use client";

import { type FormEvent, useRef, useState } from "react";
import {
  defaultDisplayName,
  type ModelConfig,
  type ModelProviderId,
  maskApiKey,
  modelProviders,
  providerOptions,
} from "@/lib/model-config";
import { cn } from "@/lib/utils";
import { Drawer } from "../admin/drawer";
import { useToast } from "../admin/toast";
import { Badge, Button, FormField, InfoBanner, inputClass } from "../admin/ui";
import { Icon } from "../icons";
import { useModelConfig } from "./model-config-provider";

interface FormErrors {
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
}

export function ModelConfigDrawer({ onClose }: { onClose: () => void }) {
  const { configs, defaultConfigId, activeConfig, saveConfig, removeConfig, setDefaultConfig } =
    useModelConfig();
  const { showToast } = useToast();

  const initial = activeConfig;
  const initialProvider = initial?.provider ?? "opencode-go";
  const [provider, setProvider] = useState<ModelProviderId>(initialProvider);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(
    initial?.baseUrl ?? modelProviders[initialProvider].defaultBaseUrl,
  );
  const [modelId, setModelId] = useState(
    initial?.modelId ?? modelProviders[initialProvider].models[0]?.id ?? "",
  );
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [makeDefault, setMakeDefault] = useState(
    initial ? defaultConfigId === initial.provider || !defaultConfigId : true,
  );
  const [showKey, setShowKey] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const baseUrlRef = useRef<HTMLInputElement>(null);
  const modelIdRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const isCurrentDefault = defaultConfigId === provider;
  const providerDefinition = modelProviders[provider];

  function fillFromConfig(config: ModelConfig) {
    setProvider(config.provider);
    setApiKey(config.apiKey);
    setBaseUrl(config.baseUrl);
    setModelId(config.modelId);
    setDisplayName(config.displayName);
    setMakeDefault(defaultConfigId === config.provider || !defaultConfigId);
    setErrors({});
  }

  function selectProvider(next: ModelProviderId) {
    const existing = configs.find((config) => config.provider === next);
    if (existing) {
      fillFromConfig(existing);
      return;
    }
    setProvider(next);
    setApiKey("");
    setBaseUrl(modelProviders[next].defaultBaseUrl);
    setModelId(modelProviders[next].models[0]?.id ?? "");
    setDisplayName("");
    setMakeDefault(!defaultConfigId);
    setErrors({});
  }

  function handleEdit(config: ModelConfig) {
    fillFromConfig(config);
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    if (apiKey.trim().length === 0) {
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
    const willBecomeDefault = makeDefault || !defaultConfigId || isCurrentDefault;
    saveConfig({
      provider,
      apiKey,
      baseUrl,
      modelId,
      displayName: label,
      makeDefault,
    });
    showToast(willBecomeDefault ? `对话模型已切换为 ${label}` : `模型配置已保存：${label}`);
    onClose();
  }

  function handleRemove(config: ModelConfig) {
    removeConfig(config.provider);
    showToast(`已移除模型：${config.displayName}`);
    if (config.provider === provider) {
      const next = configs.find((item) => item.provider !== config.provider);
      if (next) {
        fillFromConfig(next);
      } else {
        selectProvider("opencode-go");
      }
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title="模型配置"
      description="当前支持 OpenCode Go 套餐与 DeepSeek 官方 API。保存后输入框底部的模型会立即更新。"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-subtle">API Key 不写入 localStorage</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" form="model-config-form">
              保存模型
            </Button>
          </div>
        </div>
      }
    >
      {configs.length > 0 ? (
        <section>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-fg">已配置模型</h3>
            <Badge tone="outline">{configs.length}</Badge>
          </div>
          <ul className="mt-2 space-y-2">
            {configs.map((config) => {
              const isDefault = defaultConfigId === config.provider;
              return (
                <li
                  key={config.provider}
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
                        {!config.apiKey ? <Badge tone="warning">密钥缺失</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-subtle">
                        {modelProviders[config.provider].label} · {config.modelId}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-subtle">
                        {config.baseUrl}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-subtle">
                        {maskApiKey(config.apiKey)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {!isDefault ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDefaultConfig(config.provider);
                          showToast(`默认模型已切换为 ${config.displayName}`);
                        }}
                      >
                        设为默认
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(config)}>
                      编辑
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleRemove(config)}
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
          还没有配置模型。填写下方参数并保存后，输入框底部的模型选择器会切换到你配置的模型。
        </div>
      )}

      <div ref={formRef} className="mt-5 scroll-mt-2">
        <h3 className="text-xs font-medium text-fg">
          {configs.some((config) => config.provider === provider) ? "更新模型参数" : "添加模型"}
        </h3>
        <p className="mt-1 text-[11px] leading-5 text-subtle">
          选择服务商后填写 API Key、Base URL 与模型 ID。同一服务商再次保存会覆盖旧配置。
        </p>

        <form id="model-config-form" onSubmit={handleSubmit} className="mt-3 space-y-4" noValidate>
          <fieldset>
            <legend className="text-xs font-medium text-fg">服务商</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {providerOptions.map((option) => (
                <label key={option.id} className="relative block cursor-pointer">
                  <input
                    type="radio"
                    name="model-provider"
                    value={option.id}
                    checked={provider === option.id}
                    onChange={() => selectProvider(option.id)}
                    className="peer sr-only"
                  />
                  <span className="flex h-full flex-col rounded-xl border border-border bg-surface p-3 transition-colors duration-150 peer-checked:border-accent peer-checked:bg-accent-soft peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    <span className="flex items-center gap-2 text-sm font-medium text-fg">
                      <Icon
                        name={option.id === "opencode-go" ? "sparkles" : "key-round"}
                        size={14}
                        className="text-accent-text"
                      />
                      {option.label}
                    </span>
                    <span className="mt-1 text-[11px] leading-5 text-subtle">
                      {option.description}
                    </span>
                    <span className="mt-1 truncate font-mono text-[10px] text-subtle">
                      {option.defaultBaseUrl}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <FormField
            id="model-api-key"
            label="API Key"
            required
            error={errors.apiKey}
            hint="过渡方案：仅保存在当前标签页的 sessionStorage；下一冲刺改为服务端加密存储。"
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
                placeholder={provider === "deepseek" ? "sk-…" : "OpenCode Go API Key"}
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
              placeholder={providerDefinition.models[0]?.id ?? "model-id"}
              aria-invalid={errors.modelId ? true : undefined}
              aria-describedby={errors.modelId ? "model-id-error" : "model-id-hint"}
              className={cn(inputClass, "font-mono")}
            />
            <datalist id={`model-options-${provider}`}>
              {providerDefinition.models.map((model) => (
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

          <InfoBanner tone="warning" icon="lock" title="过渡方案：密钥仅存浏览器">
            本冲刺模型配置仍保存在浏览器：元数据在 localStorage，API Key 在当前标签页的
            sessionStorage，关闭标签页后清除。下一冲刺将改为服务端加密存储
            （model_configs.encrypted_api_key），浏览器只拿脱敏信息。
          </InfoBanner>
        </form>
      </div>
    </Drawer>
  );
}
