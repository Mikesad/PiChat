"use client";

import { formatSizeLabel } from "@pichat/shared";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { type AdminKnowledgeBase, defaultAccessLabel } from "@/lib/admin-data";
import { apiErrorMessage, uploadDocument } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Icon, Spinner } from "../icons";
import { useAdminData } from "./admin-data";
import { Drawer } from "./drawer";
import { useToast } from "./toast";
import { Button, InfoBanner, SubjectChip } from "./ui";

const acceptedExtensions = [".pdf", ".docx", ".md", ".txt"];
const maxBytes = 20 * 1024 * 1024;

type FileStatus = "pending" | "uploading" | "success" | "error";

interface SelectedFile {
  id: string;
  file: File;
  status: FileStatus;
  error: string | null;
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
  const { reload } = useAdminData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const duplicates = new Set(
    files
      .filter((file) =>
        knowledgeBase.documents.some((document) => document.title === file.file.name),
      )
      .map((file) => file.file.name),
  );
  const failedCount = files.filter((file) => file.status === "error").length;
  const successCount = files.filter((file) => file.status === "success").length;

  function addFiles(incoming: FileList | File[]) {
    const next: SelectedFile[] = [];
    let rejected = 0;
    for (const file of Array.from(incoming)) {
      if (!isAccepted(file.name)) {
        rejected += 1;
        continue;
      }
      if (file.size > maxBytes) {
        rejected += 1;
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        status: "pending",
        error: null,
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
        ? `${rejected} 个文件类型不支持或超过 20MB，仅支持 PDF、DOCX、MD、TXT。`
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
    if (!uploading) {
      addFiles(event.dataTransfer.files);
    }
  }

  function updateFile(id: string, patch: Partial<SelectedFile>) {
    setFiles((previous) => previous.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function requestClose() {
    if (uploading) {
      return;
    }
    onClose();
  }

  async function handleUpload() {
    const targets = files.filter((file) => file.status !== "success");
    if (targets.length === 0) {
      setError("请先选择文件");
      return;
    }

    setError(null);
    setUploading(true);
    let failed = 0;

    for (const target of targets) {
      updateFile(target.id, { status: "uploading", error: null });
      try {
        await uploadDocument(knowledgeBase.id, target.file);
        updateFile(target.id, { status: "success", error: null });
      } catch (cause) {
        failed += 1;
        updateFile(target.id, { status: "error", error: apiErrorMessage(cause) });
      }
    }

    await reload();
    setUploading(false);

    if (failed === 0) {
      showToast(`${targets.length} 个文件已上传，解析完成后可检索`);
      onClose();
      return;
    }

    showToast(`${failed} 个文件上传失败，请查看文件列表中的原因`, "danger");
  }

  return (
    <Drawer
      open
      onClose={requestClose}
      title="上传文档"
      description={`上传到「${knowledgeBase.name}」，解析完成后自动进入检索范围`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-subtle">
            已选 {files.length} 个 · 成功 {successCount} 个
            {failedCount > 0 ? ` · 失败 ${failedCount} 个` : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={requestClose} disabled={uploading}>
              取消
            </Button>
            <Button onClick={() => void handleUpload()} disabled={files.length === 0 || uploading}>
              {uploading ? <Spinner /> : <Icon name="upload" size={14} />}
              {uploading ? "上传中…" : failedCount > 0 ? "重试失败文件" : "开始上传"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-4">
        <InfoBanner tone="accent" icon="info" title="上传后由后台解析">
          文件会保存到服务端，并通过任务队列上传到
          RAGFlow。解析状态会在文档列表中自动刷新，完成后才可检索。
        </InfoBanner>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptedExtensions.join(",")}
        onChange={handleInputChange}
        disabled={uploading}
        aria-label="选择要上传的文档"
        className="sr-only"
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!uploading) {
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        disabled={uploading}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center rounded-xl border border-dashed px-4 py-9 text-center transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
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
          支持 PDF、DOCX、MD、TXT，单个文件最大 20MB，单次最多 20 个文件
        </span>
      </button>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      {files.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {files.map((file) => {
            const duplicate = duplicates.has(file.file.name);
            return (
              <li
                key={file.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
              >
                {file.status === "uploading" ? (
                  <Spinner className="shrink-0 text-accent" />
                ) : (
                  <Icon
                    name={file.status === "error" ? "alert-circle" : "file-text"}
                    size={15}
                    className={cn(
                      "shrink-0",
                      file.status === "error" ? "text-danger" : "text-subtle",
                    )}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{file.file.name}</p>
                  <p className="mt-0.5 text-[11px] text-subtle">
                    {formatSizeLabel(file.file.size) ?? "—"}
                    {file.status === "uploading" ? " · 上传中…" : ""}
                    {file.status === "success" ? " · 已上传，等待解析" : ""}
                    {file.status === "pending" && duplicate
                      ? " · 同名文档已存在，将作为新文档上传"
                      : ""}
                  </p>
                  {file.error ? (
                    <p className="mt-0.5 text-[11px] text-danger">{file.error}</p>
                  ) : null}
                </div>
                {file.status === "success" ? (
                  <Icon name="check-circle" size={14} className="shrink-0 text-success" />
                ) : file.status === "pending" && duplicate ? (
                  <Icon name="alert-circle" size={14} className="shrink-0 text-warning" />
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setFiles((previous) => previous.filter((item) => item.id !== file.id))
                  }
                  disabled={uploading || file.status === "success"}
                  aria-label={`移除 ${file.file.name}`}
                  className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
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
