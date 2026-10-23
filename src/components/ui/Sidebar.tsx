'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types/database'
import { AnthropicSpikeMark } from './AnthropicSpikeMark'
import { ProfileModal } from './ProfileModal'
import { getStaffByEmail } from '@/lib/constants/staff'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  adminOnly?: boolean
  instructorOnly?: boolean
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    label: 'Attendance',
    href: '/dashboard/admin/attendance',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    adminOnly: true,
  },
  {
    label: 'Attendance',
    href: '/dashboard/instructor/attendance',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    instructorOnly: true,
  },
  {
    label: 'Schedule',
    href: '/dashboard/admin/schedule',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-4.5h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
      </svg>
    ),
    adminOnly: true,
  },
  {
    label: 'Analytics',
    href: '/dashboard/analytics',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    label: 'Audit Trail',
    href: '/dashboard/audit',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    label: 'Students',
    href: '/dashboard/admin/students',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
      </svg>
    ),
    adminOnly: true,
  },
  {
    label: 'Instructors',
    href: '/dashboard/admin/instructors',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    adminOnly: true,
  },
  {
    label: 'Export',
    href: '/dashboard/export',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
  },
  {
    label: 'Quick Mark',
    href: '#quick-mark',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
]

interface UserMeta {
  name?: string
  full_name?: string
  post?: string
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userMetadata, setUserMetadata] = useState<UserMeta | null>(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobileScreen, setIsMobileScreen] = useState(false)

  // Track screen size for inert management on mobile drawer
  useEffect(() => {
    const checkMobile = () => setIsMobileScreen(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close mobile navigation on Escape
  useEffect(() => {
    if (!mobileOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserEmail(user.email || null)
        setUserMetadata(user.user_metadata || null)
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        if (data) setProfile(data)
      }
    }
    loadProfile()
  }, [supabase])

  const staff = getStaffByEmail(userEmail)
  const displayName = staff?.name || userMetadata?.name || userMetadata?.full_name || profile?.full_name || 'Loading...'
  const displayPost = staff?.post || userMetadata?.post || (profile?.role === 'admin' ? 'Administrator' : 'Faculty Instructor')
  const displayInitials = staff?.initials || displayName.slice(0, 2).toUpperCase()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const filteredNavItems = navItems.filter((item) => {
    if (!profile) return false
    if (item.adminOnly && profile.role !== 'admin') return false
    if (item.instructorOnly && profile.role !== 'instructor') return false
    return true
  })

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const sidebarContent = (
    <>
      {/* Brand header */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/8">
        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{background: 'rgba(0,102,204,0.2)', border: '1px solid rgba(0,102,204,0.35)'}}>
          <AnthropicSpikeMark className="w-3 h-3 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold leading-tight" style={{fontSize: '15px', letterSpacing: '-0.022em'}}>AttendEase</p>
          <p style={{color: 'rgba(255,255,255,0.4)', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase'}}>Attendance Register</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto overscroll-contain" aria-label="Main Navigation">
        {filteredNavItems.map((item) => {
          if (item.href === '#quick-mark') {
            return (
              <button
                key={item.href}
                onClick={() => {
                  setMobileOpen(false)
                  window.dispatchEvent(new CustomEvent('open-quick-mark'))
                }}
                className="flex items-center gap-3 px-3 py-2 rounded w-full text-left transition-colors duration-120"
                style={{color: 'rgba(255,255,255,0.55)', fontSize: '12px', letterSpacing: '-0.01em'}}
              >
                {item.icon}
                {item.label}
                <div className="ms-auto">
                  <span style={{fontSize: '10px', padding: '2px 7px', borderRadius: '9999px', background: 'rgba(0,102,204,0.2)', color: '#2997ff', fontWeight: 600, letterSpacing: '0.08em'}}>Quick</span>
                </div>
              </button>
            )
          }
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center gap-3 px-3 py-2 rounded transition-colors duration-120 active:opacity-75 ${
                active
                  ? 'bg-white/10'
                  : 'hover:bg-white/6'
              }`}
              style={{color: active ? '#ffffff' : 'rgba(255,255,255,0.55)', fontSize: '12px', letterSpacing: '-0.01em'}}
            >
              {/* Action Blue active indicator */}
              {active && (
                <span className="absolute inset-y-1 start-0 w-0.5 rounded-e" style={{background: '#0066cc'}} />
              )}
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User profile footer */}
      <div className="px-3 py-4 border-t border-white/8">
        <div className="flex items-center gap-1.5 px-2 py-2 rounded hover:bg-white/6 transition-colors group">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false)
              setProfileModalOpen(true)
            }}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-start cursor-pointer select-none focus:outline-none"
            title="View staff profile"
            aria-label="View staff profile"
          >
            <div className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 transition-colors" style={{background: 'rgba(0,102,204,0.2)', border: '1px solid rgba(0,102,204,0.35)'}}>
              {displayInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate leading-tight" style={{fontSize: '13px', letterSpacing: '-0.01em'}}>
                {displayName}
              </p>
              <p className="truncate leading-tight mt-0.5" style={{fontSize: '11px', color: 'rgba(255,255,255,0.4)'}} title={displayPost}>
                {displayPost}
              </p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded transition-colors flex-shrink-0"
            style={{color: 'rgba(255,255,255,0.35)'}}
            title="Sign out"
            aria-label="Sign out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar — Apple global-nav, 44px + safe-area */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 h-[calc(44px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] border-b border-white/8 flex items-center justify-between px-4" style={{background: '#000000'}}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded transition-colors"
            style={{color: 'rgba(255,255,255,0.6)'}}
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
            aria-controls="sidebar-drawer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{background: 'rgba(0,102,204,0.2)'}}>
              <AnthropicSpikeMark className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-white font-semibold" style={{fontSize: '15px', letterSpacing: '-0.022em'}}>AttendEase</span>
          </div>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-quick-mark'))}
          className="px-3 py-1.5 rounded-full text-white font-medium transition-transform duration-150 ease-out enabled:active:scale-[0.96]"
          style={{background: '#0066cc', fontSize: '12px', letterSpacing: '-0.01em'}}
        >
          Quick mark
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — Apple global-nav: pure black */}
      <aside
        id="sidebar-drawer"
        aria-label="Sidebar Navigation"
        inert={isMobileScreen && !mobileOpen ? true : undefined}
        className={`fixed lg:static inset-y-0 start-0 z-40 w-60 border-e border-white/8 flex flex-col transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:translate-x-0'
        }`}
        style={{background: '#000000'}}
      >
        {sidebarContent}
      </aside>

      {/* Profile Details Modal */}
      <ProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        profile={profile}
        email={userEmail}
        post={userMetadata?.post}
        onLogout={handleLogout}
      />
    </>
  )
}
