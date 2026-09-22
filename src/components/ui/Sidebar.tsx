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
    label: 'Schedule',
    href: '/dashboard/admin/schedule',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    adminOnly: true,
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
    label: 'Subjects',
    href: '/dashboard/admin/subjects',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
    adminOnly: true,
  },
  {
    label: 'Export',
    href: '/dashboard/admin/export',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
    adminOnly: true,
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

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userMetadata, setUserMetadata] = useState<Record<string, any> | null>(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

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
        <div className="w-7 h-7 rounded bg-grove/90 border border-grove-mid/50 flex items-center justify-center flex-shrink-0">
          <AnthropicSpikeMark className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-on-dark text-[15px] font-semibold tracking-tight leading-tight">AttendEase</p>
          <p className="text-on-dark-soft text-[11px] font-medium tracking-wide">Attendance Register</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {filteredNavItems.map((item) => {
          if (item.href === '#quick-mark') {
            return (
              <button
                key={item.href}
                onClick={() => {
                  setMobileOpen(false)
                  window.dispatchEvent(new CustomEvent('open-quick-mark'))
                }}
                className="flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors duration-120 w-full text-on-dark-soft hover:bg-surface-dark-elevated hover:text-on-dark"
              >
                {item.icon}
                {item.label}
                <div className="ms-auto">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-grove/25 text-grove-mid font-semibold">Quick</span>
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
              className={`relative flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors duration-120 active:opacity-75 ${
                active
                  ? 'bg-surface-dark-elevated text-on-dark'
                  : 'text-on-dark-soft hover:bg-surface-dark-elevated/60 hover:text-on-dark'
              }`}
            >
              {/* Grove active indicator — a left-edge rule, not a dot */}
              {active && (
                <span className="absolute inset-y-0.5 start-0 w-0.5 rounded-e bg-grove-mid" />
              )}
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User profile footer */}
      <div className="px-3 py-4 border-t border-white/8">
        <div className="flex items-center gap-1.5 px-2 py-2 rounded-md hover:bg-surface-dark-elevated transition-colors group">
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
            <div className="w-7 h-7 rounded bg-surface-dark-elevated border border-white/10 group-hover:border-grove/50 flex items-center justify-center text-on-dark text-xs font-semibold flex-shrink-0 transition-colors">
              {displayInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-on-dark font-medium truncate leading-tight group-hover:text-white transition-colors">
                {displayName}
              </p>
              <p className="text-[11px] text-on-dark-soft truncate leading-tight mt-0.5" title={displayPost}>
                {displayPost}
              </p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded text-on-dark-muted hover:text-on-dark-soft hover:bg-white/10 transition-colors flex-shrink-0"
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
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 bg-surface-dark border-b border-white/8 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded text-on-dark-soft hover:text-on-dark hover:bg-surface-dark-elevated transition-colors"
            aria-label="Open navigation"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-grove/90 flex items-center justify-center">
              <AnthropicSpikeMark className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-[15px] font-semibold text-on-dark tracking-tight">AttendEase</span>
          </div>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-quick-mark'))}
          className="text-xs px-2.5 py-1 rounded bg-surface-dark-elevated text-on-dark-soft font-medium border border-white/8 active:scale-95 transition-transform"
        >
          Quick mark
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 start-0 z-40 w-64 bg-surface-dark border-e border-white/8 flex flex-col transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
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
