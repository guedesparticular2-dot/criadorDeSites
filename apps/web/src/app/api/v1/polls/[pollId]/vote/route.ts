import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser } from "../../../../../../lib/auth";
import { castPollVote } from "../../../../../../lib/community";
import { getTenantFromHost } from "../../../../../../lib/tenant";

export async function POST(request: Request, { params }: { params: Promise<{ pollId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const tenant = await getTenantFromHost((await headers()).get("host") ?? "");
  if (!tenant) return NextResponse.json({ error: "Instância não encontrada." }, { status: 404 });
  try {
    const body = await request.json() as { optionId?: string };
    const { pollId } = await params;
    await castPollVote(tenant.id, user.id, pollId, String(body.optionId ?? ""));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível registrar o voto." }, { status: 422 });
  }
}
