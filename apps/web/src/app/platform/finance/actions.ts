"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperuser } from "../../../lib/auth";
import { createManualCharge, registerManualPayment, saveTenantContract, setCommercialSuspension } from "../../../lib/platform-operations";

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function runOperation(operation: () => Promise<unknown>, success: string) {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
    redirect(`/platform/finance?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath("/platform");
  revalidatePath("/platform/finance");
  redirect(`/platform/finance?sucesso=${encodeURIComponent(success)}`);
}

export async function saveTenantContractAction(formData: FormData) {
  const user = await requireSuperuser();
  await runOperation(() => saveTenantContract(user.id, {
    tenantId: value(formData, "tenantId"),
    planCode: value(formData, "planCode"),
    frequency: value(formData, "frequency"),
    contractedAmount: value(formData, "contractedAmount"),
    recurringAmount: value(formData, "recurringAmount"),
    reason: value(formData, "reason"),
  }), "Contrato atualizado e versionado.");
}

export async function createManualChargeAction(formData: FormData) {
  const user = await requireSuperuser();
  await runOperation(() => createManualCharge(user.id, {
    tenantId: value(formData, "tenantId"),
    referencePeriod: value(formData, "referencePeriod"),
    dueDate: value(formData, "dueDate"),
    amount: value(formData, "amount"),
    notes: value(formData, "notes"),
  }), "Cobrança manual registrada.");
}

export async function registerManualPaymentAction(formData: FormData) {
  const user = await requireSuperuser();
  const evidence = formData.get("evidence");
  await runOperation(() => registerManualPayment(user.id, {
    chargeId: value(formData, "chargeId"),
    amount: value(formData, "amount"),
    paidAt: value(formData, "paidAt"),
    method: value(formData, "method"),
    externalReference: value(formData, "externalReference"),
    evidence: evidence instanceof File && evidence.size > 0 ? evidence : null,
  }), "Recebimento confirmado e alocado à cobrança.");
}

export async function setCommercialSuspensionAction(formData: FormData) {
  const user = await requireSuperuser();
  const action = value(formData, "action");
  await runOperation(() => setCommercialSuspension(user.id, {
    tenantId: value(formData, "tenantId"),
    action,
    reason: value(formData, "reason"),
    confirmation: value(formData, "confirmation"),
  }), action === "SUSPEND" ? "Instância suspensa com auditoria." : "Instância reativada com auditoria.");
}
