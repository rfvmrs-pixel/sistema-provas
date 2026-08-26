import { NextResponse } from "next/server";
import { requireAdmin, getVisibleSectorIds } from "@/lib/requireAdmin";
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

  const sectorIds = getVisibleSectorIds(guard.admin);

  const [sectorSummary, roleSummary, employeeSummary, topicSummary, topicBySector, topicByRole, recentAttempts] =
    await Promise.all([
      getSectorSummary(sectorIds),
      getRoleSummary(sectorIds),
      getEmployeeSummary(sectorIds),
      getTopicSummary(sectorIds),
      getTopicBySector(sectorIds),
      getTopicByRole(sectorIds),
      getRecentAttempts(30, sectorIds),
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
