"use client";

import type {
  SearchConfigSummary,
  SearchEngineProviderId,
  TestSearchConfigResponse,
} from "@pichat/shared";
import { searchEngineProviderOptions, searchEngineProviders } from "@pichat/shared";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { canManageSharedConfigs } from "@/lib/admin-data";
import {
  apiErrorMessage,
  createSearchConfig,
  deleteSearchConfig,
  fetchSearchConfigs,
  setDefaultSearchConfig,
  testSearchConfig,
  updateSearchConfig,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/auth-provider";
import { Icon } from "../icons";
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
  selectClass,
} from "./ui";

export function SearchSettings() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canManage = canManageSharedConfigs(user?.role);
  const [configs, setConfigs] = useState<SearchConfigSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SearchConfigSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<SearchConfigSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchSearchConfigs();
      setConfigs(response.searchConfigs);
      setError(null);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSetDefault(config: SearchConfigSummary) {
    if (!canManage) {
      return;
    }
    setActionError(null);
    try {
      const response = await setDefaultSearchConfig(config.id);
      setConfigs((previous) =>
        previous
          .map((item) => ({
            ...item,
            isDefault: item.id === response.searchConfig.id,
          }))
          .sort(sortConfigs),
      );
      showToast(`默认搜索引擎已切换为 ${config.name}`);
    } catch (cause) {
      setActionError(apiErrorMessage(cause));
    }
  }

  async function handleRemove(config: SearchConfigSummary) {
    if (!canManage) {
      return;
    }
    setActionError(null);
    try {
      await deleteSearchConfig(config.id);
      setRemoving(null);
      await reload();
      showToast(`已移除搜索引擎：${config.name}`);
    } catch (cause) {
      setActionError(apiErrorMessage(cause));
    }
  }

  const drawerOpen = canManage && (creating || editing !== null);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="联网能力"
        title="搜索引擎"
        description="企业内共用联网搜索使用的引擎：管理员配置一次，所有成员开启联网后直接使用。当前支持 Tavily；API Key 由服务端加密保存，只在单次聊天运行中传给 Agent Runtime。"
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setActionError(null);
                setEditing(null);
                setCreating(true);
              }}
            >
              <Icon name="plus" size={15} />
              添加搜索引擎
            </Button>
          ) : null
        }
      />

      {!canManage ? (
        <InfoBanner tone="neutral" icon="lock" title="只读模式">
          共享搜索引擎由企业管理员统一维护。开启联网搜索后会自动使用默认配置。
        </InfoBanner>
      ) : null}

      {error ? (
        <InfoBanner tone="danger" icon="alert-circle" title="搜索引擎加载失败">
          {error}
        </InfoBanner>
      ) : null}
      {actionError ? (
        <InfoBanner tone="danger" icon="alert-circle" title="操作失败">
          {actionError}
        </InfoBanner>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-xs text-subtle">
          正在加载搜索引擎配置…
        </div>
      ) : configs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon="globe"
            title="还没有配置搜索引擎"
            description="添加 Tavily 配置后，对话中的联网搜索会使用该 API Key；未配置时回退到服务端环境变量。"
            action={
              canManage ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(null);
                    setCreating(true);
                  }}
                >
                  <Icon name="plus" size={14} />
                  添加搜索引擎
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {configs.map((config) => (
            <article
              key={config.id}
              className={cn(
                "flex flex-col rounded-xl border bg-surface p-3.5",
                config.isDefault ? "border-accent" : "border-border",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent-text">
                  <Icon name="globe" size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="truncate text-sm font-medium text-fg">{config.name}</h3>
                    {config.isDefault ? <Badge tone="accent">默认</Badge> : null}
                    {!config.hasApiKey ? <Badge tone="warning">密钥缺失</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-[11px] text-subtle">
                    {searchEngineProviders[config.provider].label}
                    {config.remark ? ` · ${config.remark}` : ""}
                  </p>
                  <div className="mt-1.5 space-y-0.5 font-mono text-[10px] text-subtle">
                    <p>{config.apiKeyMasked || "未保存密钥"}</p>
                    <p className="truncate">{config.proxy || "直连，未配置代理"}</p>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-subtle">
                    {config.createdByName ? `由 ${config.createdByName} 配置` : "创建人已删除"}
                  </p>
                </div>
              </div>

              {canManage ? (
                <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
                  {!config.isDefault ? (
                    <Button size="sm" variant="ghost" onClick={() => void handleSetDefault(config)}>
                      设为默认
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setActionError(null);
                      setCreating(false);
                      setEditing(config);
                    }}
                  >
                    编辑
                  </Button>
                  <button
                    type="button"
                    onClick={() => setRemoving(config)}
                    className="inline-flex h-9 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium text-danger transition-colors duration-150 hover:bg-danger-soft"
                  >
                    移除
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setCreating(true);
              }}
              className="flex min-h-[152px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface/60 text-subtle transition-colors duration-150 hover:border-accent hover:bg-accent-soft/40 hover:text-fg"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-surface-2">
                <Icon name="plus" size={17} />
              </span>
              <span className="text-xs font-medium">添加搜索引擎</span>
            </button>
          ) : null}
        </div>
      )}

      {drawerOpen ? (
        <SearchConfigFormDrawer
          config={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async (saved) => {
            setCreating(false);
            setEditing(null);
            await reload();
            showToast(
              saved.isDefault ? `默认搜索引擎已设为 ${saved.name}` : `已保存 ${saved.name}`,
            );
          }}
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
        title="移除搜索引擎配置？"
        description={
          removing
            ? `将删除「${removing.name}」。如果它当前是默认配置，系统会自动把最近更新的其他配置设为默认。`
            : ""
        }
        confirmLabel="移除"
        tone="danger"
      />
    </div>
  );
}

function sortConfigs(left: SearchConfigSummary, right: SearchConfigSummary) {
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}

function SearchConfigFormDrawer({
  config,
  onClose,
  onSaved,
}: {
  config: SearchConfigSummary | null;
  onClose: () => void;
  onSaved: (config: SearchConfigSummary) => Promise<void>;
}) {
  const { showToast } = useToast();
  const isEditing = config !== null;
  const [provider, setProvider] = useState<SearchEngineProviderId>(config?.provider ?? "tavily");
  const [name, setName] = useState(config?.name ?? "Tavily Search");
  const [remark, setRemark] = useState(config?.remark ?? "");
  const [apiKey, setApiKey] = useState("");
  const [proxy, setProxy] = useState(config?.proxy ?? "");
  const [makeDefault, setMakeDefault] = useState(config?.isDefault ?? false);
  const [showKey, setShowKey] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; apiKey?: string; proxy?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestSearchConfigResponse | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const proxyRef = useRef<HTMLInputElement>(null);
  const definition = searchEngineProviders[provider];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (name.trim().length === 0) {
      nextErrors.name = "请输入名称";
    }
    if (!isEditing && apiKey.trim().length === 0) {
      nextErrors.apiKey = "请输入 API Key";
    }
    if (proxy.trim() && !/^(https?|socks4|socks4a|socks5|socks5h):\/\//i.test(proxy.trim())) {
      nextErrors.proxy = "代理地址必须以 http:// 或 https:// 开头";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      if (nextErrors.name) {
        nameRef.current?.focus();
      } else if (nextErrors.apiKey) {
        apiKeyRef.current?.focus();
      } else {
        proxyRef.current?.focus();
      }
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const input = {
        provider,
        name: name.trim(),
        remark: remark.trim() || undefined,
        proxy: proxy.trim(),
        makeDefault,
      };
      const apiKeyValue = apiKey.trim();
      const saved = config
        ? (
            await updateSearchConfig(config.id, {
              ...input,
              apiKey: apiKeyValue || undefined,
            })
          ).searchConfig
        : (await createSearchConfig({ ...input, apiKey: apiKeyValue })).searchConfig;
      await onSaved(saved);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testSearchConfig({
        id: config?.id,
        provider,
        apiKey: apiKey.trim() || undefined,
        proxy: proxy.trim() || undefined,
      });
      setTestResult(result);
      showToast(result.message, result.ok ? "success" : "danger");
    } catch (cause) {
      showToast(apiErrorMessage(cause), "danger");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={isEditing ? "编辑搜索引擎" : "添加搜索引擎"}
      description={`${definition.label}：${definition.description}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="secondary"
            onClick={() => void handleTest()}
            disabled={testing || saving}
          >
            {testing ? "测试中…" : "测试连接"}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button type="submit" form="search-config-form" disabled={saving || testing}>
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
      {testResult ? (
        <div className="mb-4">
          <InfoBanner
            tone={testResult.ok ? "accent" : "danger"}
            icon={testResult.ok ? "check-circle" : "alert-circle"}
            title={testResult.ok ? "连接成功" : "连接失败"}
          >
            {testResult.message}（{testResult.latencyMs} ms）
          </InfoBanner>
        </div>
      ) : null}

      <form id="search-config-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        <section>
          <h3 className="text-xs font-semibold tracking-wide text-fg">基本信息</h3>
          <div className="mt-3 space-y-4">
            <FormField id="search-provider" label="引擎类型" required hint={definition.description}>
              <div className="relative">
                <select
                  id="search-provider"
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as SearchEngineProviderId)}
                  className={cn(selectClass, "appearance-none pr-8")}
                >
                  {searchEngineProviderOptions.map((option) => (
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

            <FormField id="search-name" label="名称" required error={errors.name}>
              <input
                ref={nameRef}
                id="search-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setErrors((previous) => ({ ...previous, name: undefined }));
                }}
                placeholder={definition.label}
                className={inputClass}
              />
            </FormField>

            <FormField id="search-remark" label="备注" hint="可选，例如：测试环境用。">
              <input
                id="search-remark"
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="可选，如：测试环境用"
                className={inputClass}
              />
            </FormField>
          </div>
        </section>

        <section className="border-t border-border pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-fg">连接配置</h3>
          <div className="mt-3">
            <FormField
              id="search-api-key"
              label="API Key"
              required={!isEditing}
              error={errors.apiKey}
              hint={
                isEditing
                  ? `已保存密钥：${config?.apiKeyMasked || "未保存"}；留空表示不修改。`
                  : "提交后立即加密存储，接口响应与日志都不会包含明文。"
              }
            >
              <div className="relative">
                <input
                  ref={apiKeyRef}
                  id="search-api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setErrors((previous) => ({ ...previous, apiKey: undefined }));
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={isEditing ? "留空保持现有密钥" : definition.apiKeyHint}
                  className={cn(inputClass, "pr-10 pl-9 font-mono")}
                />
                <Icon
                  name="lock"
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
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
            <p className="mt-2 text-[11px] text-subtle">
              获取密钥：
              <a
                href={definition.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-1 inline-flex items-center gap-1 text-accent-text hover:underline"
              >
                打开 {definition.shortLabel} 控制台
                <Icon name="external-link" size={11} />
              </a>
            </p>
          </div>
        </section>

        <section className="border-t border-border pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-fg">选项</h3>
          <div className="mt-3 space-y-4">
            <FormField
              id="search-proxy"
              label="HTTP 代理"
              error={errors.proxy}
              hint="可选，例如 http://proxy.example.com:3128。留空时使用系统环境变量 HTTPS_PROXY。"
            >
              <input
                ref={proxyRef}
                id="search-proxy"
                value={proxy}
                onChange={(event) => {
                  setProxy(event.target.value);
                  setErrors((previous) => ({ ...previous, proxy: undefined }));
                }}
                placeholder="例如 http://proxy.example.com:3128（可选）"
                spellCheck={false}
                className={cn(inputClass, "font-mono")}
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
                  {config?.isDefault ? "当前默认搜索引擎" : "设为默认"}
                </span>
                <span className="mt-0.5 block text-[11px] leading-5 text-subtle">
                  当对话开启联网搜索且没有指定特定搜索引擎时，默认使用此配置。
                </span>
              </span>
            </label>
          </div>
        </section>
      </form>
    </Drawer>
  );
}
