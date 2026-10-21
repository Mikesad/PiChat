"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { type AdminKnowledgeBase, defaultAccessLabel } from "@/lib/admin-data";
import { cn } from "@/lib/utils";
import { Icon } from "../icons";
import { Drawer } from "./drawer";
import { useToast } from "./toast";
import { Button, InfoBanner, SubjectChip } from "./ui";

const acceptedExtensions = [".pdf", ".docx", ".md", ".txt"];

interface SelectedFile {
  id: string;
  name: string;
  sizeLabel: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAccepted(name: string) {
  const lower = name.toLowerCase();
  return acceptedExtensions.some((extension) => lower.endsWith(extension));
}

export function UploadDrawer({
  knowledgeBase,
  onClose,
}: {
  knowledgeBase: AdminKnowledgeBase;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duplicates = new Set(
    files
      .filter((file) => knowledgeBase.documents.some((document) => document.title === file.name))
      .map((file) => file.name),
  );

  function addFiles(incoming: FileList | File[]) {
    const next: SelectedFile[] = [];
    let rejected = 0;
    for (const file of Array.from(incoming)) {
      if (!isAccepted(file.name)) {
        rejected += 1;
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        sizeLabel: formatSize(file.size),
      });
    }
    setFiles((previous) => {
      const merged = [...previous];
      for (const file of next) {
        if (!merged.some((item) => item.id === file.id)) {
          merged.push(file);
        }
      }
      return merged.slice(0, 20);
    });
    setError(
      rejected > 0
        ? `${rejected} 个文件类型不支持，仅支持 PDF、DOCX、MD、TXT。`
        : next.length + files.length > 20
          ? "单次最多上传 20 个文件。"
          : null,
    );
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      addFiles(event.target.files);
    }
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function requestClose() {
    onClose();
  }

  function handleUpload() {
    if (files.length === 0) {
      setError("请先选择文件");
      return;
    }
    showToast("上传文档：本冲刺未接入", "neutral");
  }

  return (
    <Drawer
      open
      onClose={requestClose}
      title="上传文档"
      description={`上传到「${knowledgeBase.name}」，解析完成后自动进入检索范围`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-subtle">已选 {files.length} 个文件</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={requestClose}>
              取消
            </Button>
            <Button onClick={handleUpload} disabled={files.length === 0}>
              <Icon name="upload" size={14} />
              开始上传
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-4">
        <InfoBanner tone="warning" icon="alert-circle" title="本冲刺未接入上传">
          文档上传、解析轮询与 RAGFlow 入库将在后续冲刺接入。当前选择文件不会写入服务端。
        </InfoBanner>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptedExtensions.join(",")}
        onChange={handleInputChange}
        aria-label="选择要上传的文档"
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
          "flex w-full cursor-pointer flex-col items-center rounded-xl border border-dashed px-4 py-9 text-center transition-colors duration-150",
          dragging
            ? "border-accent bg-accent-soft"
            : "border-border-strong bg-surface-2/40 hover:border-accent hover:bg-surface-2",
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-surface text-subtle">
          <Icon name="upload" size={18} />
        </span>
        <span className="mt-2.5 text-sm font-medium text-fg">拖拽文件到此处，或点击选择</span>
        <span className="mt-1 text-[11px] leading-5 text-subtle">
          支持 PDF、DOCX、MD、TXT，单次最多 20 个文件
        </span>
      </button>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      {files.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {files.map((file) => {
            const duplicate = duplicates.has(file.name);
            return (
              <li
                key={file.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <Icon name="file-text" size={15} className="shrink-0 text-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{file.name}</p>
                  <p className="mt-0.5 text-[11px] text-subtle">
                    {file.sizeLabel}
                    {duplicate ? " · 同名文档已存在，将作为新版本上传" : ""}
                  </p>
                </div>
                {duplicate ? <Icon name="alert-circle" size={14} className="text-warning" /> : null}
                <button
                  type="button"
                  onClick={() =>
                    setFiles((previous) => previous.filter((item) => item.id !== file.id))
                  }
                  aria-label={`移除 ${file.name}`}
                  className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <Icon name="x" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-subtle">
          还没有选择文件。上传后会先在后台解析，解析完成前不可检索。
        </p>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium text-fg">新文档的访问范围</p>
        <p className="mt-1 text-[11px] leading-5 text-subtle">
          将继承知识库默认范围：{defaultAccessLabel(knowledgeBase)}。文档例外可在上传后调整。
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {knowledgeBase.defaultSubjects.map((subject) => (
            <SubjectChip key={`${subject.type}-${subject.id}`} subject={subject} />
          ))}
        </div>
        {knowledgeBase.defaultSubjects.length === 0 ? (
          <div className="mt-2">
            <InfoBanner tone="warning" icon="lock" title="尚未设置默认范围">
              上传后只有租户管理员可读，普通成员需要通过文档例外授权。
            </InfoBanner>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
