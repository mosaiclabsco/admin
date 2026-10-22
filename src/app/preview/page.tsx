import { notFound } from "next/navigation";
import { AdminPreview } from "@/components/admin-preview";
export default function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AdminPreview />;
}
