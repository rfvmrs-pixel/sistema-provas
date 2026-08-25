import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getSectorSummary,
  getRoleSummary,
  getEmployeeSummary,
  getTopicSummary,
  getTopicBySector,
  getTopicByRole,
} from "@/lib/reports";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const [sectorSummary, roleSummary, employeeSummary, topicSummary, topicBySector, topicByRole] =
    await Promise.all([
      getSectorSummary(),
      getRoleSummary(),
      getEmployeeSummary(),
      getTopicSummary(),
      getTopicBySector(),
      getTopicByRole(),
    ]);

  return NextResponse.json({
    sectorSummary,
    roleSummary,
    employeeSummary,
    topicSummary,
    topicBySector,
    topicByRole,
  });
}
