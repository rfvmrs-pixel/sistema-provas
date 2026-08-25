import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getSectorSummary,
  getRoleSummary,
  getEmployeeSummary,
  getTopicSummary,
  getTopicBySector,
  getTopicByRole,
  getRecentAttempts,
} from "@/lib/reports";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const sectorId = guard.admin.sectorId ?? undefined;

  const [sectorSummary, roleSummary, employeeSummary, topicSummary, topicBySector, topicByRole, recentAttempts] =
    await Promise.all([
      getSectorSummary(sectorId),
      getRoleSummary(sectorId),
      getEmployeeSummary(sectorId),
      getTopicSummary(sectorId),
      getTopicBySector(sectorId),
      getTopicByRole(sectorId),
      getRecentAttempts(30, sectorId),
    ]);

  return NextResponse.json({
    sectorSummary,
    roleSummary,
    employeeSummary,
    topicSummary,
    topicBySector,
    topicByRole,
    recentAttempts,
  });
}
