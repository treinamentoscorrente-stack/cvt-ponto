import AdminPendingNotice from "../AdminPendingNotice";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <><AdminPendingNotice />{children}</>;
}
