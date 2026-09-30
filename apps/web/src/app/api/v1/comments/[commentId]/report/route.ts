import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser } from "../../../../../../lib/auth";
import { reportComment } from "../../../../../../lib/moderation";
import { getTenantFromHost } from "../../../../../../lib/tenant";

export async function POST(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const tenant = await getTenantFromHost((await headers()).get("host") ?? "");
  if (!tenant) return NextResponse.json({ error: "Instância não encontrada." }, { status: 404 });
  try {
    const body = await request.json() as { reason?: string };
    const { commentId } = await params;
    const caseId = await reportComment(tenant.id, user.id, commentId, String(body.reason ?? ""));
    return NextResponse.json({ caseId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível registrar a denúncia." }, { status: 422 });
  }
}
