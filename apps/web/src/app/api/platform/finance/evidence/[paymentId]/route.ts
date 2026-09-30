import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { getCurrentUser } from "../../../../../../lib/auth";
import { getPaymentEvidencePath } from "../../../../../../lib/platform-operations";

export async function GET(_request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isSuperuser || !user.isAdministrative) return new Response("Acesso restrito ao Superusuário com MFA.", { status: 403, headers: { "Cache-Control": "no-store" } });
  const { paymentId } = await params;
  try {
    const evidence = await getPaymentEvidencePath(user.id, paymentId);
    const bytes = await readFile(evidence.absolutePath);
    const extension = extname(evidence.absolutePath).toLowerCase();
    const type = extension === ".pdf" ? "application/pdf" : extension === ".png" ? "image/png" : "image/jpeg";
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="comprovante-${paymentId}${extension}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response("Comprovante não encontrado.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
