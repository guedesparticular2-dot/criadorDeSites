import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser } from "../../../../../lib/auth";
import { deleteOwnComment } from "../../../../../lib/community";
import { getTenantFromHost } from "../../../../../lib/tenant";

export async function DELETE(_request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const tenant = await getTenantFromHost((await headers()).get("host") ?? "");
  if (!tenant) return NextResponse.json({ error: "Instância não encontrada." }, { status: 404 });
  try {
    const { commentId } = await params;
    await deleteOwnComment(tenant.id, user.id, commentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível remover o comentário." }, { status: 422 });
  }
}
