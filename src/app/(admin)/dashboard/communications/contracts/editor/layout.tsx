// Full-screen overlay for the contract builder — mirrors the email template
// editor layout so the admin sidebar is hidden while composing.
export default function ContractEditorLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 bg-graphite">{children}</div>
}
