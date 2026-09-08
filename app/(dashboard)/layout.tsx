import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <DashboardLayout
      userRole={user.role}
      userName={user.full_name || user.email}
      plan={user.plan}
    >
      {children}
    </DashboardLayout>
  );
}
