export interface StaffProfile {
  name: string
  post: string
  email: string
  role: 'admin' | 'instructor'
  initials: string
}

export const STAFF_DIRECTORY: Record<string, StaffProfile> = {
  'ujjwal@niat.in': {
    name: 'Ujjwal',
    post: 'Business Operations Associate (BOA)',
    email: 'Ujjwal@niat.in',
    role: 'admin',
    initials: 'UJ',
  },
  'divesh@niat.in': {
    name: 'Divesh',
    post: 'Program Manager (PM)',
    email: 'divesh@niat.in',
    role: 'admin',
    initials: 'DV',
  },
  'pankaj@niat.in': {
    name: 'Pankaj',
    post: 'Program Manager Associate (PMA)',
    email: 'pankaj@niat.in',
    role: 'admin',
    initials: 'PK',
  },
  'yash@niat.in': {
    name: 'Yash',
    post: 'Tech Instructor (Frontend Technologies & GENAI )',
    email: 'Yash@niat.in',
    role: 'instructor',
    initials: 'YS',
  },
  'skund@niat.in': {
    name: 'Skund',
    post: 'Tech Instructor (Backend Systems)',
    email: 'Skund@niat.in',
    role: 'instructor',
    initials: 'SK',
  },
  'inderjit@niat.in': {
    name: 'Inderjit',
    post: 'English Instructor (English & Communication Studies)',
    email: 'Inderjit@niat.in',
    role: 'instructor',
    initials: 'IJ',
  },
  'rishabh@niat.in': {
    name: 'Rishabh',
    post: 'Mathematics Instructor (Maths & Aptitude)',
    email: 'Rishabh@niat.in',
    role: 'instructor',
    initials: 'RB',
  },
}

export function getStaffByEmail(email?: string | null): StaffProfile | null {
  if (!email) return null
  const normalized = email.trim().toLowerCase()
  return STAFF_DIRECTORY[normalized] || null
}
