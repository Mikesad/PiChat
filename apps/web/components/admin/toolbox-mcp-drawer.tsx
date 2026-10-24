"use client";

import { type FormEvent, useState } from "react";
import {
  createToolboxId,
  isHttpUrl,
  type McpAuthType,
  type McpServerEntry,
  type McpTransport,
  maskCredential,
  mcpAuthMeta,
  mcpTransportMeta,
  parseMcpImport,
  type ToolboxHeader,
} from "@/lib/toolbox-data";
import { cn } from "@/lib/utils";
import { Icon } from "../icons";
import { Drawer } from "./drawer";
import { ChoiceButton, StepIndicator, ToolboxSection } from "./toolbox-parts";
import { Badge, Button, FormField, InfoBanner, inputClass, SwitchField, textareaClass } from "./ui";

const importPlaceholder = `{
  "mcpServers": {
    "example": {
      "type": "sse",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}`;

const authHeaderHint =
  "留空默认 X-API-Key，Bearer 方式请填 Authorization，并在下方密钥值中写 “Bearer <token>”；需要裸 token 时填 Authorization 并直接填入 token。";

export function ToolboxMcpDrawer({
  server,
  onClose,
  onSave,
}: {
  server: McpServerEntry | null;
  onClose: () => void;
  onSave: (server: McpServerEntry) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(server?.name ?? "");
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [transport, setTransport] = useState<McpTransport>(server?.transport ?? "sse");
  const [url, setUrl] = useState(server?.url ?? "");
  const [headers, setHeaders] = useState<ToolboxHeader[]>(server?.headers ?? []);
  const [authType, setAuthType] = useState<McpAuthType>(server?.authType ?? "none");
  const [authHeaderName, setAuthHeaderName] = useState(server?.authHeaderName ?? "X-API-Key");
  const [credential, setCredential] = useState("");
  const [showCredential, setShowCredential] = useState(false);
  const [purpose, setPurpose] = useState(server?.purpose ?? "");
  const [autoInvoke, setAutoInvoke] = useState(server?.autoInvoke ?? true);
  const [errors, setErrors] = useState<{ name?: string; url?: string; authHeaderName?: string }>(
    {},
  );
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const isEditing = server !== null;

  function updateHeader(id: string, patch: Partial<ToolboxHeader>) {
    setHeaders((previous) =>
      previous.map((header) => (header.id === id ? { ...header, ...patch } : header)),
    );
  }

  function validateConnection() {
    const nextErrors: typeof errors = {};
    if (!name.trim()) {
      nextErrors.name = "请输入服务名称";
    }
    if (!url.trim()) {
      nextErrors.url = "请输入服务 URL";
    } else if (!isHttpUrl(url)) {
      nextErrors.url = "请输入以 http:// 或 https:// 开头的 URL";
    }
    if (authType === "api-key" && !authHeaderName.trim()) {
      nextErrors.authHeaderName = "请输入请求头名称";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleNext() {
    if (validateConnection()) {
      setStep(2);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateConnection()) {
      setStep(1);
      return;
    }

    const trimmedCredential = credential.trim();
    const keepCredential =
      authType === "api-key" && (trimmedCredential.length > 0 || (server?.hasCredential ?? false));

    onSave({
      id: server?.id ?? createToolboxId("mcp"),
      name: name.trim(),
      transport,
      url: url.trim(),
      headers: headers
        .filter((header) => header.name.trim())
        .map((header) => ({
          ...header,
          name: header.name.trim(),
          value: header.value.trim(),
        })),
      authType,
      authHeaderName: authType === "api-key" ? authHeaderName.trim() || "X-API-Key" : "",
      hasCredential: keepCredential,
      credentialHint: keepCredential
        ? trimmedCredential
          ? maskCredential(trimmedCredential)
          : (server?.credentialHint ?? "")
        : "",
      purpose: purpose.trim(),
      autoInvoke,
      enabled,
      createdAt: server?.createdAt ?? new Date().toISOString(),
    });
  }

  function handleImport() {
    try {
      const imported = parseMcpImport(importText);
      setName(imported.name);
      setUrl(imported.url);
      setTransport(imported.transport);
      setHeaders(imported.headers);
      if (imported.authorization) {
        setAuthType("api-key");
        setAuthHeaderName("Authorization");
        setCredential(imported.authorization.replace(/^Bearer\s+/i, ""));
      }
      setErrors((previous) => ({ ...previous, name: undefined, url: undefined }));
      setImportError(null);
      setImportOpen(false);
      setImportText("");
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : "配置解析失败");
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={isEditing ? "编辑 MCP 服务" : "添加 MCP 服务"}
      description="连接外部 MCP 服务，智能体即可调用其中的工具。"
      footer={
        step === 1 ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button onClick={handleNext}>保存并下一步</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              返回
            </Button>
            <Button type="submit" form="toolbox-mcp-form">
              保存
            </Button>
          </div>
        )
      }
    >
      <StepIndicator steps={["连接配置", "工具与用途说明"]} current={step} />

      {step === 1 ? (
        <div className="mt-5 space-y-5">
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <button
              type="button"
              aria-expanded={importOpen}
              onClick={() => setImportOpen((previous) => !previous)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
            >
              <span className="flex items-center gap-2 text-xs font-medium text-fg">
                <Icon name="code" size={14} className="text-subtle" />
                从代码导入
              </span>
              <Icon
                name={importOpen ? "chevron-down" : "chevron-right"}
                size={14}
                className="text-subtle"
              />
            </button>
            {importOpen ? (
              <div className="border-t border-border p-3">
                <p className="text-[11px] leading-5 text-subtle">
                  粘贴 mcpServers JSON 配置，自动填入名称、URL、传输类型与请求头。
                </p>
                <label htmlFor="toolbox-mcp-import" className="sr-only">
                  MCP JSON 配置
                </label>
                <textarea
                  id="toolbox-mcp-import"
                  value={importText}
                  onChange={(event) => {
                    setImportText(event.target.value);
                    setImportError(null);
                  }}
                  placeholder={importPlaceholder}
                  spellCheck={false}
                  className={cn(textareaClass, "mt-2 min-h-36 font-mono text-xs")}
                />
                {importError ? <p className="mt-1 text-xs text-danger">{importError}</p> : null}
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleImport}
                    disabled={!importText.trim()}
                  >
                    解析并填入
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <ToolboxSection title="基本信息">
            <FormField id="toolbox-mcp-name" label="服务名称" required error={errors.name}>
              <input
                id="toolbox-mcp-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setErrors((previous) => ({ ...previous, name: undefined }));
                }}
                placeholder="请输入服务名称"
                className={inputClass}
              />
            </FormField>

            <SwitchField
              checked={enabled}
              onChange={setEnabled}
              label="启用服务"
              description="关闭后该服务不会被调用。"
            />
          </ToolboxSection>

          <ToolboxSection title="连接配置">
            <FormField id="toolbox-mcp-transport" label="传输类型" required>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(mcpTransportMeta) as McpTransport[]).map((id) => (
                  <ChoiceButton
                    key={id}
                    active={transport === id}
                    onClick={() => setTransport(id)}
                    icon={id === "sse" ? "plug" : "globe"}
                  >
                    {mcpTransportMeta[id].label}
                  </ChoiceButton>
                ))}
              </div>
            </FormField>

            <FormField id="toolbox-mcp-url" label="服务 URL" required error={errors.url}>
              <input
                id="toolbox-mcp-url"
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setErrors((previous) => ({ ...previous, url: undefined }));
                }}
                placeholder="https://example.com/mcp"
                spellCheck={false}
                className={cn(inputClass, "font-mono")}
              />
            </FormField>

            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">自定义请求头（可选）</p>
                  <p className="mt-1 text-[11px] leading-5 text-subtle">
                    附加到每次 MCP 请求的 HTTP 请求头，常用于企业网关鉴权、链路追踪等场景。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setHeaders((previous) => [
                      ...previous,
                      { id: createToolboxId("header"), name: "", value: "" },
                    ])
                  }
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent-text transition-colors hover:text-accent-hover"
                >
                  <Icon name="plus" size={13} />
                  添加请求头
                </button>
              </div>
              {headers.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {headers.map((header) => (
                    <div
                      key={header.id}
                      className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]"
                    >
                      <input
                        aria-label="请求头名称"
                        value={header.name}
                        onChange={(event) => updateHeader(header.id, { name: event.target.value })}
                        placeholder="Header 名称"
                        spellCheck={false}
                        className={cn(inputClass, "font-mono")}
                      />
                      <input
                        aria-label="请求头值"
                        value={header.value}
                        onChange={(event) => updateHeader(header.id, { value: event.target.value })}
                        placeholder="Header 值"
                        spellCheck={false}
                        className={cn(inputClass, "font-mono")}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setHeaders((previous) => previous.filter((item) => item.id !== header.id))
                        }
                        aria-label={`移除请求头 ${header.name || "未命名"}`}
                        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </ToolboxSection>

          <ToolboxSection title="认证配置">
            <FormField id="toolbox-mcp-auth" label="认证方式">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(mcpAuthMeta) as McpAuthType[]).map((id) => (
                  <ChoiceButton key={id} active={authType === id} onClick={() => setAuthType(id)}>
                    {mcpAuthMeta[id].label}
                  </ChoiceButton>
                ))}
              </div>
            </FormField>

            {authType === "api-key" ? (
              <>
                <FormField
                  id="toolbox-mcp-auth-header"
                  label="请求头名称"
                  required
                  error={errors.authHeaderName}
                  hint={authHeaderHint}
                >
                  <input
                    id="toolbox-mcp-auth-header"
                    value={authHeaderName}
                    onChange={(event) => {
                      setAuthHeaderName(event.target.value);
                      setErrors((previous) => ({ ...previous, authHeaderName: undefined }));
                    }}
                    placeholder="X-API-Key"
                    spellCheck={false}
                    className={cn(inputClass, "font-mono")}
                  />
                </FormField>

                <FormField
                  id="toolbox-mcp-credential"
                  label="密钥值 / Token"
                  hint={
                    isEditing && server?.hasCredential
                      ? `已保存：${server.credentialHint}；留空表示不修改。明文不会写入浏览器存储。`
                      : "可选。明文不会写入浏览器存储，只在本次配置中使用。"
                  }
                >
                  <div className="relative">
                    <input
                      id="toolbox-mcp-credential"
                      type={showCredential ? "text" : "password"}
                      value={credential}
                      onChange={(event) => setCredential(event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="可选"
                      className={cn(inputClass, "pr-10 pl-9 font-mono")}
                    />
                    <Icon
                      name="lock"
                      size={14}
                      className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCredential((previous) => !previous)}
                      aria-label={showCredential ? "隐藏密钥" : "显示密钥"}
                      className="absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      <Icon name={showCredential ? "eye-off" : "eye"} size={14} />
                    </button>
                  </div>
                </FormField>
              </>
            ) : null}

            {authType === "oauth" ? (
              <InfoBanner tone="neutral" icon="key-round" title="OAuth 授权流程待接入">
                保存后会记录 OAuth 配置；首次连接时需要在浏览器完成授权，当前版本尚未接入。
              </InfoBanner>
            ) : null}

            {authType === "none" ? (
              <p className="text-[11px] leading-5 text-subtle">
                不使用专用认证。如果服务需要 Header 鉴权，请在上方「自定义请求头」中补充。
              </p>
            ) : null}
          </ToolboxSection>
        </div>
      ) : (
        <form id="toolbox-mcp-form" onSubmit={handleSubmit} className="mt-5 space-y-5" noValidate>
          <div className="rounded-xl border border-border bg-surface px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Icon name="plug" size={14} className="text-accent-text" />
              <p className="text-sm font-medium text-fg">{name.trim() || "未命名服务"}</p>
              <Badge tone="outline">{mcpTransportMeta[transport].label}</Badge>
            </div>
            <p className="mt-1 truncate font-mono text-[10px] text-subtle">
              {url.trim() || "未填写 URL"}
            </p>
          </div>

          <InfoBanner tone="neutral" icon="info" title="工具清单将在连接后同步">
            当前为前端预览，保存后只保留连接配置；接入后端后由服务端连接 MCP 服务并拉取工具清单。
          </InfoBanner>

          <ToolboxSection
            title="用途说明"
            description="告诉模型这个服务能做什么，帮助它在合适的时候调用。"
          >
            <FormField
              id="toolbox-mcp-purpose"
              label="服务用途"
              hint="可选，但建议填写。会展示在服务卡片中。"
            >
              <textarea
                id="toolbox-mcp-purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="例如：查询企业内部的订单与库存数据。"
                className={textareaClass}
              />
            </FormField>

            <SwitchField
              checked={autoInvoke}
              onChange={setAutoInvoke}
              label="允许智能体自动调用"
              description="关闭后只在用户明确要求时使用该服务。"
            />
          </ToolboxSection>

          <ToolboxSection title="工具与调用范围" description="连接成功后会自动读取工具清单。">
            <div className="rounded-xl border border-dashed border-border bg-surface-2/40 px-4 py-8 text-center">
              <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-surface text-subtle">
                <Icon name="plug" size={18} />
              </span>
              <p className="mt-2 text-sm font-medium text-fg">暂未同步工具</p>
              <p className="mt-1 text-xs leading-5 text-subtle">
                保存连接配置后，接入后端即可自动拉取工具清单。
              </p>
            </div>
          </ToolboxSection>
        </form>
      )}
    </Drawer>
  );
}
