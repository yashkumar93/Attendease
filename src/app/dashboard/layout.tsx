import { Sidebar } from '@/components/ui/Sidebar'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { ChatBubble } from '@/components/ui/ChatBubble'
import { SessionTimeout } from '@/components/auth/SessionTimeout'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex h-[100dvh] overflow-hidden" style={{background: '#f5f5f7', color: '#1d1d1f'}}>
        <Sidebar />
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 overflow-y-auto pt-[calc(44px+env(safe-area-inset-top,0px))] lg:pt-0 focus:outline-none">
          <div className="px-4 py-5 sm:p-8 lg:p-10 max-w-5xl mx-auto pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
            {children}
          </div>
        </main>
      </div>
      <ChatBubble />
      <SessionTimeout />
    </ToastProvider>
  )
}
