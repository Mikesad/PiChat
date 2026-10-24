"use client";

import { formatSizeLabel } from "@pichat/shared";
import { type ChangeEvent, type DragEvent, type FormEvent, useRef, useState } from "react";
import { createToolboxId, deriveSkillName, isHttpUrl, type SkillEntry } from "@/lib/toolbox-data";
import { cn } from "@/lib/utils";
import { Icon } from "../icons";
import { Drawer } from "./drawer";
import { StepIndicator, ToolboxSection } from "./toolbox-parts";
import { Button, FormField, InfoBanner, inputClass, SwitchField, textareaClass } from "./ui";

const maxArchiveBytes = 256 * 1024 * 1024;
const sourcePattern = /^@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export function ToolboxSkillDrawer({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (skill: SkillEntry) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [source, setSource] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  function acceptFile(nextFile: File) {
    if (!nextFile.name.toLowerCase().endsWith(".zip")) {
      setFileError("仅支持 zip 压缩包");
      return;
    }
    if (nextFile.size > maxArchiveBytes) {
      setFileError("压缩包不能超过 256 MB");
      return;
    }
    setFile(nextFile);
    setSource("");
    setFileError(null);
    setSourceError(null);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) {
      acceptFile(nextFile);
    }
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) {
      acceptFile(nextFile);
    }
  }

  function handleNext() {
    if (!file && !source.trim()) {
      setSourceError("请填写来源链接，或上传一个 zip 压缩包");
      return;
    }
    if (!file) {
      const value = source.trim();
      if (!sourcePattern.test(value) && !isHttpUrl(value)) {
        setSourceError("请输入 @owner/slug 或完整的 http(s) 链接");
        return;
      }
    }
    setName(file ? deriveSkillName(file.name) : deriveSkillName(source));
    setNameError(null);
    setStep(2);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("请输入技能名称");
      return;
    }
    onSave({
      id: createToolboxId("skill"),
      name: trimmedName,
      description: description.trim(),
      sourceType: file ? "zip" : "url",
      source: file ? file.name : source.trim(),
      enabled,
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title="添加技能"
      description="粘贴来源或上传 zip，先登记到空间目录。"
      footer={
        step === 1 ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button onClick={handleNext}>下一步</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              返回
            </Button>
            <Button type="submit" form="toolbox-skill-form">
              保存
            </Button>
          </div>
        )
      }
    >
      <StepIndicator steps={["登记", "安装"]} current={step} />

      {step === 1 ? (
        <div className="mt-5 space-y-5">
          <ToolboxSection
            title="从来源安装"
            description="粘贴 ClawHub、GitHub 或 SkillHub 链接，或 @owner/slug。压缩包不超过 256 MB。"
          >
            <div>
              <label htmlFor="toolbox-skill-source" className="sr-only">
                技能来源
              </label>
              <input
                id="toolbox-skill-source"
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setSourceError(null);
                  if (event.target.value.trim()) {
                    setFile(null);
                    setFileError(null);
                  }
                }}
                placeholder="ClawHub 用 @owner/slug，GitHub / SkillHub 请粘贴完整链接"
                spellCheck={false}
                className={cn(inputClass, "font-mono")}
              />
              {sourceError ? <p className="mt-1 text-xs text-danger">{sourceError}</p> : null}
            </div>
          </ToolboxSection>

          <ToolboxSection
            title="上传本地压缩包"
            description="把包含 SKILL.md 的 zip 拖到下方，或点击选择文件。压缩包不超过 256 MB。"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={handleInputChange}
              aria-label="选择技能压缩包"
              className="sr-only"
            />

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "flex w-full cursor-pointer flex-col items-center rounded-xl border border-dashed px-4 py-10 text-center transition-colors duration-150",
                dragging
                  ? "border-accent bg-accent-soft"
                  : "border-border-strong bg-surface-2/40 hover:border-accent hover:bg-surface-2",
              )}
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                <Icon name="upload" size={20} />
              </span>
              <span className="mt-3 text-sm font-medium text-fg">点击上传 zip 压缩包</span>
              <span className="mt-1 text-[11px] text-subtle">或将文件拖到此处</span>
            </button>

            {fileError ? <p className="text-xs text-danger">{fileError}</p> : null}

            {file ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                <Icon name="file-text" size={15} className="shrink-0 text-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{file.name}</p>
                  <p className="mt-0.5 text-[11px] text-subtle">
                    {formatSizeLabel(file.size) ?? "—"} · 待登记
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  aria-label={`移除 ${file.name}`}
                  className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ) : null}
          </ToolboxSection>
        </div>
      ) : (
        <form id="toolbox-skill-form" onSubmit={handleSubmit} className="mt-5 space-y-5" noValidate>
          <InfoBanner tone="neutral" icon="info" title="当前为前端预览">
            技能会先登记到本地目录，不会上传压缩包或执行脚本；接入后端后由服务端安装到沙箱。
          </InfoBanner>

          <ToolboxSection title="技能信息">
            <FormField
              id="toolbox-skill-name"
              label="技能名称"
              required
              error={nameError ?? undefined}
            >
              <input
                id="toolbox-skill-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                placeholder="例如：PDF 文档处理"
                className={inputClass}
              />
            </FormField>

            <FormField
              id="toolbox-skill-description"
              label="说明"
              hint="可选，用于在技能列表中区分用途。"
            >
              <textarea
                id="toolbox-skill-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="例如：读取、拆分与合并 PDF 文件"
                className={textareaClass}
              />
            </FormField>

            <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-2.5">
              <p className="text-[11px] text-subtle">登记来源</p>
              <p className="mt-1 truncate font-mono text-xs text-fg">
                {file ? file.name : source.trim()}
              </p>
            </div>

            <SwitchField
              checked={enabled}
              onChange={setEnabled}
              label="登记后启用"
              description="当前没有可用沙箱；带脚本的技能要等沙箱接入后才能实际运行。"
            />
          </ToolboxSection>

          <InfoBanner tone="warning" icon="triangle-alert" title="当前没有沙箱">
            技能可以登记和启用，但带脚本的能力需要先配置沙箱，智能体才能真正调用。
          </InfoBanner>
        </form>
      )}
    </Drawer>
  );
}
