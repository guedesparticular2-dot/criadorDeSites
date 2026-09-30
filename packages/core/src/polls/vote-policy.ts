export function createVoteKey(tenantId: string, pollId: string, userId: string) {
  if (!tenantId || !pollId || !userId) throw new TypeError("Tenant, enquete e usuário são obrigatórios.");
  return `${tenantId}:${pollId}:${userId}`;
}

export function pollAcceptsVote(input: { opensAt: Date; closesAt: Date; now?: Date }) {
  const now = input.now ?? new Date();
  return now >= input.opensAt && now < input.closesAt;
}
