"use client";

import { defaultPageSize, type PaginationMeta } from "@pichat/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { documentStats } from "@/lib/admin-data";
import { useAuth } from "../auth/auth-provider";
import { Icon, Spinner } from "../icons";
import { useAdminData } from "./admin-data";
import { CreateKnowledgeDrawer } from "./create-knowledge-drawer";
import { Pagination } from "./pagination";
import {
  Badge,
  Button,
  buttonStyles,
  EmptyState,
  InfoBanner,
  PageHeader,
  SearchInput,
  StatStrip,
  SubjectChip,
  TableShell,
  tdClass,
  thClass,
  trClass,
} from "./ui";

export function KnowledgeListPage() {
  const { knowledgeBases, status, error, reload } = useAdminData();
  const { user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const canManage = user?.role === "tenant_admin" || user?.role === "knowledge_admin";

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return knowledgeBases;
    }
    return knowledgeBases.filter(
      (knowledgeBase) =>
        knowledgeBase.name.toLowerCase().includes(normalized) ||
        knowledgeBase.description.toLowerCase().includes(normalized),
    );
  }, [knowledgeBases, query]);

  const pagination: PaginationMeta = useMemo(() => {
    const totalPages = filtered.length === 0 ? 0 : Math.ceil(filtered.length / pageSize);
    const currentPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    return {
      page: currentPage,
      pageSize,
      total: filtered.length,
      totalPages,
      hasNext: currentPage < totalPages,
      hasPrevious: currentPage > 1,
    };
  }, [filtered.length, page, pageSize]);

  const pagedKnowledgeBases = useMemo(() => {
    const offset = (pagination.page - 1) * pageSize;
    return filtered.slice(offset, offset + pageSize);
  }, [filtered, pageSize, pagination.page]);

  const totals = useMemo(() => {
    let documents = 0;
    let ready = 0;
    let failed = 0;
    for (const knowledgeBase of knowledgeBases) {
      const stats = documentStats(knowledgeBase);
      documents += stats.total;
      ready += stats.ready;
      failed += stats.failed;
    }
    return { documents, ready, failed };
  }, [knowledgeBases]);

  const header = (
    <PageHeader
      eyebrow="Knowledge"
      title="知识库"
      description="管理文档解析、检索范围与默认访问权限。权限变更会在下一次提问时生效。"
      actions={
        canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={15} />
            新建知识库
          </Button>
        ) : undefined
      }
    />
  );

  if (knowledgeBases.length === 0 && status === "loading") {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <Spinner className="text-accent" />
          <p className="text-sm text-muted">正在加载知识库…</p>
        </div>
      </div>
    );
  }

  if (knowledgeBases.length === 0 && status === "error") {
    return (
      <div className="space-y-6">
        {header}
        <InfoBanner
          tone="danger"
          icon="alert-circle"
          title="知识库加载失败"
          action={
            <Button size="sm" variant="secondary" onClick={() => void reload()}>
              重试
            </Button>
          }
        >
          {error ?? "请稍后重试。"}
        </InfoBanner>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {status === "error" ? (
        <InfoBanner
          tone="danger"
          icon="alert-circle"
          title="刷新失败，当前显示上次加载的数据"
          action={
            <Button size="sm" variant="secondary" onClick={() => void reload()}>
              重试
            </Button>
          }
        >
          {error ?? "请稍后重试。"}
        </InfoBanner>
      ) : null}

      <StatStrip
        items={[
          { label: "知识库", value: knowledgeBases.length, hint: "当前租户" },
          { label: "文档总数", value: totals.documents, hint: "不含已删除" },
          { label: "可检索", value: totals.ready, hint: "解析完成" },
          {
            label: "解析失败",
            value: totals.failed,
            hint: "需要处理",
            tone: totals.failed > 0 ? "danger" : "default",
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder="搜索知识库"
          label="搜索知识库"
        />
        <p className="text-xs text-subtle">
          共 {filtered.length} 个知识库 · {totals.documents} 篇文档
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          {knowledgeBases.length === 0 ? (
            <EmptyState
              icon="book-open"
              title="当前账号没有可见的知识库"
              description={
                canManage
                  ? "创建知识库后即可上传文档并配置默认访问范围。"
                  : "请联系管理员为你的账号或部门授予读取权限。"
              }
              action={
                canManage ? (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Icon name="plus" size={15} />
                    新建知识库
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              icon="search"
              title="没有匹配的知识库"
              description="换一个关键词，或清除搜索条件后重试。"
              action={
                <Button variant="secondary" onClick={() => setQuery("")}>
                  清除搜索
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <>
          <div className="hidden xl:block">
            <TableShell
              minWidth={720}
              footer={
                <>
                  <span>
                    当前页 {pagedKnowledgeBases.length} 个 · 共 {filtered.length} 个
                  </span>
                  <span>默认范围对全库文档生效</span>
                </>
              }
            >
              <thead>
                <tr>
                  <th className={thClass}>知识库</th>
                  <th className={thClass}>文档</th>
                  <th className={thClass}>默认访问</th>
                  <th className={thClass}>文档级权限</th>
                  <th className={thClass}>最近变更</th>
                  <th className={thClass}>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedKnowledgeBases.map((knowledgeBase) => {
                  const stats = documentStats(knowledgeBase);
                  const denyCount = knowledgeBase.documents.filter((document) =>
                    document.exceptions.some((exception) => exception.permission === "deny"),
                  ).length;
                  return (
                    <tr key={knowledgeBase.id} className={trClass}>
                      <td className={tdClass}>
                        <Link
                          href={`/knowledge/${knowledgeBase.id}`}
                          className="group flex items-start gap-2.5"
                        >
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle transition-colors group-hover:bg-accent-soft group-hover:text-accent-text">
                            <Icon name="book-open" size={16} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-fg">
                              {knowledgeBase.name}
                            </span>
                            <span className="mt-0.5 block max-w-[280px] truncate text-[11px] text-subtle">
                              {knowledgeBase.description}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className={tdClass}>
                        <p className="text-sm font-medium tabular-nums text-fg">
                          {stats.total} 篇文档
                        </p>
                        <p className="mt-0.5 text-[11px] text-subtle">
                          当前可读 {knowledgeBase.readableDocumentCount} 篇
                        </p>
                      </td>
                      <td className={tdClass}>
                        {knowledgeBase.defaultSubjects.length === 0 &&
                        knowledgeBase.deniedSubjects.length === 0 ? (
                          <Badge tone="warning">未设置</Badge>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {knowledgeBase.defaultSubjects.slice(0, 2).map((subject) => (
                              <SubjectChip
                                key={`${subject.type}-${subject.id}`}
                                subject={subject}
                              />
                            ))}
                            {knowledgeBase.defaultSubjects.length > 2 ? (
                              <span className="text-[11px] text-subtle">
                                +{knowledgeBase.defaultSubjects.length - 2}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className={tdClass}>
                        <p className="text-sm tabular-nums text-fg">{stats.withExceptions} 篇</p>
                        <p className="mt-0.5 text-[11px] text-subtle">
                          {denyCount > 0 ? `${denyCount} 篇含拒绝` : "无拒绝规则"}
                        </p>
                      </td>
                      <td className={tdClass}>
                        <p className="text-xs text-muted">{knowledgeBase.updatedLabel}</p>
                      </td>
                      <td className={`${tdClass} text-right`}>
                        <Link
                          href={`/knowledge/${knowledgeBase.id}`}
                          aria-label={`打开 ${knowledgeBase.name}`}
                          className={buttonStyles("ghost", "sm", "px-2")}
                        >
                          打开
                          <Icon name="chevron-right" size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          </div>

          <ul className="space-y-2 xl:hidden">
            {pagedKnowledgeBases.map((knowledgeBase) => {
              const stats = documentStats(knowledgeBase);
              return (
                <li key={knowledgeBase.id}>
                  <Link
                    href={`/knowledge/${knowledgeBase.id}`}
                    className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2/60"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
                        <Icon name="book-open" size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{knowledgeBase.name}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-subtle">
                          {knowledgeBase.description}
                        </p>
                      </div>
                      <Icon name="chevron-right" size={15} className="mt-1 shrink-0 text-subtle" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
                      <span>{stats.total} 篇文档</span>
                      <span>当前可读 {knowledgeBase.readableDocumentCount} 篇</span>
                      <span>{stats.withExceptions} 篇有文档级权限</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {knowledgeBase.defaultSubjects.length === 0 &&
                      knowledgeBase.deniedSubjects.length === 0 ? (
                        <Badge tone="warning">未设置默认访问</Badge>
                      ) : (
                        knowledgeBase.defaultSubjects
                          .slice(0, 3)
                          .map((subject) => (
                            <SubjectChip key={`${subject.type}-${subject.id}`} subject={subject} />
                          ))
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <Pagination
            pagination={pagination}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
          />
        </>
      )}

      {createOpen ? (
        <CreateKnowledgeDrawer
          onClose={() => setCreateOpen(false)}
          onCreated={(knowledgeBaseId) => {
            setCreateOpen(false);
            router.push(`/knowledge/${knowledgeBaseId}`);
          }}
        />
      ) : null}
    </div>
  );
}
