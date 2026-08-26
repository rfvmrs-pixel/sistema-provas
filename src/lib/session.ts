import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secretValue = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
const secret = new TextEncoder().encode(secretValue);

const ADMIN_COOKIE = "admin_session";
const EMPLOYEE_COOKIE = "employee_session";

export type AdminRole = "admin" | "diretoria" | "superintendencia" | "gestor";

export type AdminSessionData = {
  adminId: number;
  username: string;
  // null = enxerga todos os Contratos (role "admin", "diretoria" ou
  // "superintendencia"). Número = gestor travado no próprio contrato (Setor).
  sectorId: number | null;
  sectorName: string | null;
  // "admin" = super admin, edita tudo. "diretoria" e "superintendencia" veem
  // tudo, só leitura (mesmo nível de visão, sem poder de edição). "gestor" =
  // só o próprio Contrato, com escrita normal nele.
  role: AdminRole;
};
export type EmployeeSessionData = {
  employeeId: number;
  name: string;
  sectorId: number;
  sectorName: string;
  roleId: number;
  roleName: string;
  // "simulado" (padrão): login pessoal, vê/pratica qualquer prova do seu Setor+Função.
  // "oficial": entrou com o código de uso único de uma "prova do dia" (ou por
  // um link de aplicação — ver examLinkId) — só pode fazer o exame travado em
  // examId, e a sessão é encerrada ao finalizar.
  mode?: "simulado" | "oficial";
  examId?: number;
  sessionLabel?: string | null;
  // Presente quando o colaborador entrou por um link de aplicação (Prova
  // Geral/Direcionada) em vez do código de "prova do dia" clássico — usado só
  // pra registrar de onde veio a tentativa (ver attempts.examLinkId).
  examLinkId?: number;
};

async function sign(data: Record<string, unknown>, expires: string) {
  return new SignJWT(data)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret);
}

async function verify<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as T;
  } catch {
    return null;
  }
}

// ---- Admin session ----
export async function createAdminSession(data: AdminSessionData) {
  const token = await sign(data, "12h");
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function getAdminSession(): Promise<AdminSessionData | null> {
  const store = await cookies();
  return verify<AdminSessionData>(store.get(ADMIN_COOKIE)?.value);
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

// ---- Employee session (per exam-taking session) ----
export async function createEmployeeSession(data: EmployeeSessionData) {
  const token = await sign(data, "6h");
  const store = await cookies();
  store.set(EMPLOYEE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 6,
  });
}

export async function getEmployeeSession(): Promise<EmployeeSessionData | null> {
  const store = await cookies();
  return verify<EmployeeSessionData>(store.get(EMPLOYEE_COOKIE)?.value);
}

export async function clearEmployeeSession() {
  const store = await cookies();
  store.delete(EMPLOYEE_COOKIE);
}
