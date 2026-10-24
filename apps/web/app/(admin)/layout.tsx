import type { ReactNode } from "react";
import { AdminDataProvider } from "@/components/admin/admin-data";
import { AdminShell } from "@/components/admin/admin-shell";
import { DirectoryProvider } from "@/components/admin/directory";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminDataProvider>
      <DirectoryProvider>
        <AdminShell>{children}</AdminShell>
      </DirectoryProvider>
    </AdminDataProvider>
  );
}
