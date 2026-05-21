// The editor needs to hide the dashboard sidebar so it can use the full
// browser width for the canvas + AI panel.
export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 bg-white">{children}</div>
}
