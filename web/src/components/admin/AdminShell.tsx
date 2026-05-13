import type { ReactNode } from "react";
import type { AdminSection, AdminUser } from "@/types/admin";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export function AdminShell({
  admin,
  admins,
  onSelectAdmin,
  activeSection,
  onSelectSection,
  children,
}: {
  admin: AdminUser;
  admins: AdminUser[];
  onSelectAdmin: (id: string) => void;
  activeSection: AdminSection;
  onSelectSection: (section: AdminSection) => void;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell-bg admin-grid min-h-screen text-white">
      <AdminHeader admins={admins} selectedAdminId={admin.id} onSelectAdmin={onSelectAdmin} />
      <div className="grid min-h-[calc(100vh-89px)] lg:grid-cols-[300px_1fr]">
        <AdminSidebar admin={admin} activeSection={activeSection} onSelectSection={onSelectSection} />
        <main className="px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
