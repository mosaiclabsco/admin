import { requireAdmin } from "@/lib/supabase/server";
import { loadJobsSnapshot } from "@/lib/jobs";
import { JobsDashboard } from "@/components/jobs-dashboard";
export default async function JobsPage({
  params,
}: PageProps<"/[platform]/jobs">) {
  await requireAdmin();
  const { platform } = await params;
  return (
    <JobsDashboard
      initial={await loadJobsSnapshot(platform)}
      platform={platform}
    />
  );
}
