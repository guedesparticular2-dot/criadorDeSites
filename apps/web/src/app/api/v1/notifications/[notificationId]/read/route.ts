import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser } from "../../../../../../lib/auth";
import { acknowledgeMemberNotification } from "../../../../../../lib/community";
import { getTenantFromHost } from "../../../../../../lib/tenant";

export async function POST(_request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const tenant = await getTenantFromHost((await headers()).get("host") ?? "");
  if (!tenant) return NextResponse.json({ error: "Instância não encontrada." }, { status: 404 });
  try {
    const { notificationId } = await params;
    await acknowledgeMemberNotification(tenant.id, user.id, notificationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível confirmar a notificação." }, { status: 404 });
  }
}
