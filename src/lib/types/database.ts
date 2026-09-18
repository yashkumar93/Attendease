export type UserRole = 'admin' | 'instructor'
export type StudentStatus = 'active' | 'inactive'
export type AttendanceStatus = 'Present' | 'Absent'
export type PeriodType = 'Lecture' | 'Lab' | 'Tutorial' | 'Other'

export interface Profile {
  id: string
  role: UserRole
  full_name: string
  contact: string | null
  subjects_qualified: string[] | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Class {
  id: number
  class_name: string
  created_at: string
}

export interface Subject {
  id: number
  subject_name: string
  created_at: string
}

export interface Student {
  id: number
  name: string
  roll_number: string
  class_id: number
  contact: string | null
  status: StudentStatus
  created_at: string
  updated_at: string
}

export interface Period {
  id: number
  date: string
  class_id: number
  subject_id: number
  instructor_id: string
  start_time: string
  end_time: string
  period_type: PeriodType
  created_by: string
  created_at: string
  updated_at: string
}

export interface AttendanceRecord {
  id: number
  period_id: number
  student_id: number
  status: AttendanceStatus
  marked_by: string
  marked_at: string
  last_modified_by: string | null
  last_modified_at: string | null
  remark: string | null
}

export interface AttendanceHistory {
  id: number
  attendance_id: number
  period_id: number
  student_id: number
  previous_status: AttendanceStatus | null
  new_status: AttendanceStatus
  changed_by: string
  changed_at: string
  remark: string | null
}

export interface ExportLog {
  id: number
  scope_description: string
  google_sheet_url: string | null
  exported_by: string
  exported_at: string
}

// Joined types for UI convenience
export interface PeriodWithDetails extends Period {
  classes: Class
  subjects: Subject
  profiles: Profile
}

export interface AttendanceWithStudent extends AttendanceRecord {
  students: Student
}

export interface AttendanceWithDetails extends AttendanceRecord {
  students: Student
  periods: PeriodWithDetails
}

// Supabase Database type definition
// This must match the exact Supabase generic format for type-safe queries
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: {
          id: string
          role: UserRole
          full_name: string
          contact?: string | null
          subjects_qualified?: string[] | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: UserRole
          full_name?: string
          contact?: string | null
          subjects_qualified?: string[] | null
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      classes: {
        Row: Class
        Insert: {
          id?: number
          class_name: string
          created_at?: string
        }
        Update: {
          id?: number
          class_name?: string
        }
        Relationships: []
      }
      subjects: {
        Row: Subject
        Insert: {
          id?: number
          subject_name: string
          created_at?: string
        }
        Update: {
          id?: number
          subject_name?: string
        }
        Relationships: []
      }
      students: {
        Row: Student
        Insert: {
          id?: number
          name: string
          roll_number: string
          class_id: number
          contact?: string | null
          status?: StudentStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          name?: string
          roll_number?: string
          class_id?: number
          contact?: string | null
          status?: StudentStatus
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          }
        ]
      }
      periods: {
        Row: Period
        Insert: {
          id?: number
          date: string
          class_id: number
          subject_id: number
          instructor_id: string
          start_time: string
          end_time: string
          period_type?: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          date?: string
          class_id?: number
          subject_id?: number
          instructor_id?: string
          start_time?: string
          end_time?: string
          period_type?: string
          created_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "periods_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periods_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periods_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      attendance: {
        Row: AttendanceRecord
        Insert: {
          id?: number
          period_id: number
          student_id: number
          status?: string
          marked_by: string
          marked_at?: string
          last_modified_by?: string | null
          last_modified_at?: string | null
          remark?: string | null
        }
        Update: {
          id?: number
          period_id?: number
          student_id?: number
          status?: string
          marked_by?: string
          marked_at?: string
          last_modified_by?: string | null
          last_modified_at?: string | null
          remark?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          }
        ]
      }
      attendance_history: {
        Row: AttendanceHistory
        Insert: {
          id?: number
          attendance_id: number
          period_id: number
          student_id: number
          previous_status?: string | null
          new_status: string
          changed_by: string
          changed_at?: string
          remark?: string | null
        }
        Update: {
          id?: number
          attendance_id?: number
          period_id?: number
          student_id?: number
          previous_status?: string | null
          new_status?: string
          changed_by?: string
          changed_at?: string
          remark?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_history_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          }
        ]
      }
      export_logs: {
        Row: ExportLog
        Insert: {
          id?: number
          scope_description: string
          google_sheet_url?: string | null
          exported_by: string
          exported_at?: string
        }
        Update: {
          id?: number
          scope_description?: string
          google_sheet_url?: string | null
          exported_by?: string
          exported_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
