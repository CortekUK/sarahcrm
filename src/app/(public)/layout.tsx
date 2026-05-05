import { Header } from '@/components/website/Header'
import { Footer } from '@/components/website/Footer'
import { StickyCTA } from '@/components/website/StickyCTA'
import { CustomCursor } from '@/components/website/CustomCursor'
import { LoadingScreen } from '@/components/website/LoadingScreen'
import { ThemeProvider } from '@/components/website/ThemeContext'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider>
      <LoadingScreen />
      <Header />
      <main className="min-h-screen">{children}</main>
      <Footer />
      <StickyCTA />
      <CustomCursor />
      <div className="film-grain" />
    </ThemeProvider>
  )
}
