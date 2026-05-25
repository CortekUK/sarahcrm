// Full-screen WYSIWYG editor. The wrapper provides the fixed
// viewport box; the EmailEditorPage controls its own dark chrome
// (header + left sidebar) and scopes `escape-night-admin` to JUST
// the canvas, so the email preview renders on a true white surface
// while the surrounding admin chrome stays night-themed.
export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 bg-graphite">{children}</div>
}
