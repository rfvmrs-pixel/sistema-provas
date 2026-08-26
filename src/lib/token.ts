import { randomBytes } from "crypto";

// Token público de link de prova: só precisa ser difícil de adivinhar, não
// criptograficamente perfeito — 24 bytes em base64url dá bastante entropia
// pra caber numa URL curta.
export function generateLinkToken(): string {
  return randomBytes(18).toString("base64url");
}
