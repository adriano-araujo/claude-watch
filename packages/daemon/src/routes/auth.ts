import type { FastifyInstance } from "fastify";
import type { PairRequest, PairResponse } from "@claude-watch/shared";
import type { AuthService } from "../services/auth-service.js";

export function registerAuthRoutes(
  app: FastifyInstance,
  authService: AuthService,
): void {
  app.post<{ Body: PairRequest }>("/auth/pair", async (request, reply) => {
    const { pin } = request.body;

    const result = await authService.validatePin(pin);

    if (!result) {
      return reply.status(401).send({ error: "Invalid or expired PIN" });
    }

    const response: PairResponse = {
      token: result.token,
      deviceId: result.deviceId,
    };

    return response;
  });
}
