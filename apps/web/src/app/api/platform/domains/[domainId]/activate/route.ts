import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { activateCanonicalDomain } from "../../../../../../lib/platform-domains";

export async function POST(request: Request, { params }: { params: Promise<{ domainId: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isSuperuser || !user.isAdministrative) return NextResponse.json({ error: "Acesso restrito ao Superusuário com MFA." }, { status: 403 });
  const { domainId } = await params;
  try {
    const body = await request.json() as { reason?: string };
    await activateCanonicalDomain(user.id, domainId, String(body.reason ?? ""));
    return NextResponse.json({ active: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível ativar o domínio." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
