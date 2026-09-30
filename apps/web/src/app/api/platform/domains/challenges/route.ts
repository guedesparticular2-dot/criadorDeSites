import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { createDomainChallenge } from "../../../../../lib/platform-domains";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isSuperuser || !user.isAdministrative) return NextResponse.json({ error: "Acesso restrito ao Superusuário com MFA." }, { status: 403 });
  try {
    const body = await request.json() as { tenantId?: string; hostname?: string; method?: string };
    const challenge = await createDomainChallenge(user.id, {
      tenantId: String(body.tenantId ?? ""),
      hostname: String(body.hostname ?? ""),
      method: String(body.method ?? ""),
    });
    return NextResponse.json(challenge, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível criar o desafio." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
