'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function InstructorPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/instructor/attendance')
  }, [router])

  return null
}
