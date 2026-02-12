import type { FastifyInstance } from "fastify";
import type { RespondRequest } from "@claude-watch/shared";
import type { PendingStore } from "../services/pending-store.js";

export function registerRespondRoutes(
  app: FastifyInstance,
  pendingStore: PendingStore,
): void {
  app.post<{
    Params: { id: string };
    Body: RespondRequest;
  }>("/sessions/:id/respond", async (request, reply) => {
    const { approvalId, decision, reason } = request.body;

    const resolved = pendingStore.resolve(approvalId, decision, reason);

    if (!resolved) {
      return reply.status(404).send({ error: "Approval not found or already resolved" });
    }

    return { ok: true };
  });
}
