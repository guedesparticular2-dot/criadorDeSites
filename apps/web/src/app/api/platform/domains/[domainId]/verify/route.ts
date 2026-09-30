import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { verifyDomainChallenge } from "../../../../../../lib/platform-domains";

export async function POST(_request: Request, { params }: { params: Promise<{ domainId: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isSuperuser || !user.isAdministrative) return NextResponse.json({ error: "Acesso restrito ao Superusuário com MFA." }, { status: 403 });
  const { domainId } = await params;
  try {
    await verifyDomainChallenge(user.id, domainId);
    return NextResponse.json({ verified: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível verificar o domínio." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
