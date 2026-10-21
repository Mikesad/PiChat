import { KnowledgeDetailPage } from "@/components/admin/knowledge-detail";

export const metadata = {
  title: "知识库详情 · PiChat",
};

export default async function KnowledgeDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KnowledgeDetailPage knowledgeBaseId={id} />;
}
