import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser } from "../../../../../../lib/auth";
import { createComment, listPublicComments } from "../../../../../../lib/community";
import { getTenantFromHost } from "../../../../../../lib/tenant";

export async function GET(_request: Request, { params }: { params: Promise<{ contentId: string }> }) {
  const user = await getCurrentUser();
  const tenant = await getTenantFromHost((await headers()).get("host") ?? "");
  if (!tenant) return NextResponse.json({ error: "Instância não encontrada." }, { status: 404 });
  const { contentId } = await params;
  const comments = await listPublicComments(tenant.id, contentId, user?.id);
  return NextResponse.json({ comments }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ contentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const tenant = await getTenantFromHost((await headers()).get("host") ?? "");
  if (!tenant) return NextResponse.json({ error: "Instância não encontrada." }, { status: 404 });
  try {
    const body = await request.json() as { body?: string };
    const { contentId } = await params;
    const commentId = await createComment(tenant.id, user.id, contentId, String(body.body ?? ""));
    return NextResponse.json({ id: commentId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível publicar o comentário." }, { status: 422 });
  }
}
