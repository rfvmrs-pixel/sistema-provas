import { NextResponse } from "next/server";
import { getEmployeeAttemptHistory } from "@/lib/reports";
import { getEmployeeSession } from "@/lib/session";

// Lista as tentativas já finalizadas do colaborador logado — usado pela tela
// "Minhas provas" (só faz sentido no modo "simulado", login com senha
// pessoal: no modo "oficial" a sessão é encerrada assim que a prova termina,
// então não sobra login pra consultar depois).
export async function GET() {
  const employee = await getEmployeeSession();
  if (!employee) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const history = await getEmployeeAttemptHistory(employee.employeeId, 200);
  return NextResponse.json({ attempts: history });
}
