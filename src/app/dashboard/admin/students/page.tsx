'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createStudent, updateStudent, toggleStudentStatus, bulkImportStudents } from '@/app/actions/master-data'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/ToastProvider'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'
import Papa from 'papaparse'
import type { Student, Class } from '@/lib/types/database'

export default function StudentsPage() {
  const supabase = createClient()
  const { showToast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [students, setStudents] = useState<(Student & { classes: { class_name: string } })[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterClass, setFilterClass] = useState<number | ''>('')
  const [filterStatus, setFilterStatus] = useState<string>('active')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)

  const fetchData = async () => {
    setLoading(true)
    const [studentsRes, classesRes] = await Promise.all([
      supabase.from('students').select('*, classes(class_name)').order('class_id').order('roll_number'),
      supabase.from('classes').select('*').order('id'),
    ])
    if (studentsRes.data) setStudents(studentsRes.data as typeof students)
    if (classesRes.data) setClasses(classesRes.data)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const filteredStudents = students.filter((s) => {
    if (filterClass && s.class_id !== filterClass) return false
    if (filterStatus && s.status !== filterStatus) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return s.name.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q)
    }
    return true
  })

  const handleAddStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createStudent(formData)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast('Student added successfully')
        setShowAddModal(false)
        fetchData()
      }
    })
  }

  const handleUpdateStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingStudent) return
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateStudent(editingStudent.id, formData)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast('Student updated successfully')
        setEditingStudent(null)
        fetchData()
      }
    })
  }

  const handleToggleStatus = async (student: Student) => {
    const newStatus = student.status === 'active' ? 'inactive' : 'active'
    startTransition(async () => {
      const result = await toggleStudentStatus(student.id, newStatus)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast(`Student ${newStatus === 'active' ? 'activated' : 'deactivated'}`)
        fetchData()
      }
    })
  }

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = (results.data as any[]).map((row) => ({
          name: row.name?.trim(),
          roll_number: row.roll_number?.trim(),
          class_id: parseInt(row.class_id),
          contact: row.contact?.trim() || undefined,
        }))

        startTransition(async () => {
          const result = await bulkImportStudents(rows)
          if (result.error) {
            showToast(result.error, 'error')
          } else {
            showToast(`Successfully imported ${rows.length} students`)
            setShowImportModal(false)
            fetchData()
          }
        })
      },
      error: () => {
        showToast('Unable to parse CSV file. Ensure columns match: name, roll_number, class_id.', 'error')
      },
    })
  }

  const StudentForm = ({ student, onSubmit }: { student?: Student; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">Full Name *</label>
        <input name="name" defaultValue={student?.name} required className="input" placeholder="e.g. John Doe" />
      </div>
      <div>
        <label className="label">Roll Number *</label>
        <input name="roll_number" defaultValue={student?.roll_number} required className="input font-mono" placeholder="e.g. 2024001" />
      </div>
      <div>
        <label className="label">Class *</label>
        <select name="class_id" defaultValue={student?.class_id || (classes.length === 1 ? classes[0].id : '')} required className="input">
          {classes.length > 1 && <option value="">Select class</option>}
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.class_name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Contact</label>
        <input name="contact" defaultValue={student?.contact || ''} className="input" placeholder="e.g. +1 555-0199" />
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-hairline">
        <button type="button" onClick={() => { setShowAddModal(false); setEditingStudent(null) }} className="btn btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? 'Saving...' : student ? 'Save changes' : 'Add student'}
        </button>
      </div>
    </form>
  )

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Student Directory
            </span>
          </div>
          <h1 className="font-serif text-3xl font-normal text-ink tracking-tight">
            Students
          </h1>
          <p className="text-sm text-muted mt-1 font-sans">
            Manage student enrollment and cohort assignment records
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Import CSV
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add student
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name or roll number"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input flex-1"
          />
          {classes.length > 1 && (
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value ? parseInt(e.target.value) : '')}
              className="input w-full sm:w-44"
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          )}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input w-full sm:w-36"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="card h-12 w-full animate-pulse bg-surface-soft/60" />
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <EmptyState
            title={searchQuery ? `No students matching "${searchQuery}"` : 'No students yet'}
            description={
              searchQuery
                ? 'Check the name or roll number for typos, or clear your search query.'
                : 'Add students to enroll them in cohorts and record attendance.'
            }
            action={
              searchQuery ? (
                <button onClick={() => setSearchQuery('')} className="btn btn-secondary">
                  Clear search
                </button>
              ) : (
                <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                  Add student
                </button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Roll No.</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id}>
                    <td className="font-mono text-xs">{student.roll_number}</td>
                    <td className="font-medium text-ink">{student.name}</td>
                    <td className="text-body">{student.classes?.class_name}</td>
                    <td className="text-muted">{student.contact || '—'}</td>
                    <td>
                      <span className={`badge ${student.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                        {student.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingStudent(student)}
                          className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-surface-card transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleToggleStatus(student)}
                          disabled={isPending}
                          className={`p-1.5 rounded-md transition-colors ${
                            student.status === 'active'
                              ? 'text-muted-soft hover:text-danger hover:bg-danger-light'
                              : 'text-muted-soft hover:text-success hover:bg-success-light'
                          }`}
                          title={student.status === 'active' ? 'Deactivate' : 'Activate'}
                        >
                          {student.status === 'active' ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filteredStudents.length > 0 && (
          <div className="px-5 py-3 border-t border-hairline text-xs text-muted">
            Showing {filteredStudents.length} of {students.length} students
          </div>
        )}
      </div>

      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add student">
        <StudentForm onSubmit={handleAddStudent} />
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editingStudent} onClose={() => setEditingStudent(null)} title="Edit student">
        {editingStudent && <StudentForm student={editingStudent} onSubmit={handleUpdateStudent} />}
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="Import students from CSV">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Upload a CSV file with the following columns: <code className="px-1.5 py-0.5 bg-surface-card border border-hairline rounded text-xs font-mono">name</code>, <code className="px-1.5 py-0.5 bg-surface-card border border-hairline rounded text-xs font-mono">roll_number</code>, <code className="px-1.5 py-0.5 bg-surface-card border border-hairline rounded text-xs font-mono">class_id</code>, <code className="px-1.5 py-0.5 bg-surface-card border border-hairline rounded text-xs font-mono">contact</code> (optional)
          </p>
          <div className="border border-dashed border-hairline rounded-lg p-8 text-center bg-canvas hover:border-primary/40 transition-colors">
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVImport}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <svg className="w-8 h-8 mx-auto text-muted-soft mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-medium text-ink">Choose CSV file</p>
              <p className="text-xs text-muted mt-1">or drag and drop</p>
            </label>
          </div>
          {isPending && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Importing students...
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
