"use client";

import { useState } from "react";
import { type AclSubject, subjectKey, subjectName } from "@/lib/admin-data";
import { Icon } from "../icons";
import { SubjectSelect } from "./acl";
import { useAdminData } from "./admin-data";
import { Drawer } from "./drawer";
import { useToast } from "./toast";
import { Button, FormField, InfoBanner, inputClass, selectClass, textareaClass } from "./ui";

const embeddingOptions = [
  "bge-m3 · 1024 维",
  "text-embedding-3-large · 3072 维",
  "qwen3-embedding-0.6b · 1024 维",
];

export function CreateKnowledgeDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (knowledgeBaseId: string) => void;
}) {
  const { addKnowledgeBase } = useAdminData();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState(embeddingOptions[0] ?? "");
  const [dataset, setDataset] = useState("");
  const [defaultSubjects, setDefaultSubjects] = useState<AclSubject[]>([]);
  const [subjectValue, setSubjectValue] = useState("");
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; dataset?: string }>({});

  function parseSubject(value: string): AclSubject | null {
    const [type, id] = value.split(":");
    if ((type === "user" || type === "group") && id) {
      return { type, id };
    }
    return null;
  }

  function addSubject() {
    const subject = parseSubject(subjectValue);
    if (!subject) {
      setSubjectError("请选择用户或用户组");
      return;
    }
    if (defaultSubjects.some((item) => subjectKey(item) === subjectKey(subject))) {
      setSubjectError("该主体已在默认范围中");
      return;
    }
    setDefaultSubjects((previous) => [...previous, subject]);
    setSubjectValue("");
    setSubjectError(null);
  }

  function handleCreate() {
    const nextErrors: { name?: string; dataset?: string } = {};
    if (name.trim().length < 2) {
      nextErrors.name = "请输入至少 2 个字符的知识库名称";
    }
    if (dataset.trim().length === 0) {
      nextErrors.dataset = "请填写 RAGFlow 数据集 ID";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const knowledgeBase = addKnowledgeBase({
      name,
      description,
      embeddingModel,
      ragflowDatasetId: dataset,
      defaultSubjects,
    });
    showToast("知识库已创建");
    onCreated(knowledgeBase.id);
    onClose();
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="新建知识库"
      description="创建后可以继续上传文档并调整默认访问范围"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleCreate}>创建知识库</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField id="kb-name" label="名称" required error={errors.name}>
          <input
            id="kb-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setErrors((previous) => ({ ...previous, name: undefined }));
            }}
            placeholder="例如：售后知识库"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "kb-name-error" : undefined}
            className={inputClass}
          />
        </FormField>

        <FormField
          id="kb-description"
          label="描述"
          hint="说明这个知识库包含哪些文档，方便成员理解范围。"
        >
          <textarea
            id="kb-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="例如：客服与售后团队的处理规范、话术与常见问题。"
            className={textareaClass}
          />
        </FormField>

        <FormField
          id="kb-embedding"
          label="Embedding 模型"
          required
          hint="每个知识库固定一个模型和维度；更换模型需要重建索引。"
        >
          <select
            id="kb-embedding"
            value={embeddingModel}
            onChange={(event) => setEmbeddingModel(event.target.value)}
            className={selectClass}
          >
            {embeddingOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          id="kb-dataset"
          label="RAGFlow 数据集 ID"
          required
          error={errors.dataset}
          hint="只绑定已有数据集，API Key 由服务端保存。"
        >
          <input
            id="kb-dataset"
            value={dataset}
            onChange={(event) => {
              setDataset(event.target.value);
              setErrors((previous) => ({ ...previous, dataset: undefined }));
            }}
            placeholder="例如：ragflow_support_2026"
            aria-invalid={errors.dataset ? true : undefined}
            aria-describedby={errors.dataset ? "kb-dataset-error" : "kb-dataset-hint"}
            className={`${inputClass} font-mono`}
          />
        </FormField>

        <InfoBanner tone="warning" icon="alert-circle" title="创建后锁定">
          Embedding 模型创建后不可更改。更换模型需要新建知识库并重新解析全部文档。
        </InfoBanner>

        <section>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-fg">默认访问范围</p>
            <span className="text-[11px] text-subtle">{defaultSubjects.length} 个主体</span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-subtle">
            默认范围对该知识库的全部文档生效；文档可以再添加读取或拒绝例外。
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <SubjectSelect
              value={subjectValue}
              onChange={(value) => {
                setSubjectValue(value);
                setSubjectError(null);
              }}
              label="选择默认访问范围的用户或用户组"
            />
            <Button variant="secondary" onClick={addSubject}>
              <Icon name="plus" size={14} />
              添加
            </Button>
          </div>
          {subjectError ? <p className="mt-1 text-xs text-danger">{subjectError}</p> : null}
          {defaultSubjects.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {defaultSubjects.map((subject) => (
                <li
                  key={subjectKey(subject)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <Icon
                    name={subject.type === "group" ? "users" : "user"}
                    size={14}
                    className="shrink-0 text-subtle"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {subjectName(subject)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDefaultSubjects((previous) =>
                        previous.filter((item) => subjectKey(item) !== subjectKey(subject)),
                      )
                    }
                    aria-label={`移除 ${subjectName(subject)}`}
                    className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-danger"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-[11px] leading-5 text-subtle">
              尚未设置默认范围：创建后只有租户管理员可读，普通成员需要通过文档例外授权。
            </p>
          )}
        </section>
      </div>
    </Drawer>
  );
}
