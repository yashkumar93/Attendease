'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createInstructor, updateInstructor, toggleInstructorStatus } from '@/app/actions/master-data'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/ToastProvider'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'
import type { Profile } from '@/lib/types/database'

export default function InstructorsPage() {
  const supabase = createClient()
  const { showToast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [instructors, setInstructors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingInstructor, setEditingInstructor] = useState<Profile | null>(null)

  const fetchInstructors = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'instructor')
      .order('full_name')
    if (data) setInstructors(data)
    setLoading(false)
  }

  useEffect(() => { fetchInstructors() }, [])

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createInstructor(formData)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast('Instructor created successfully')
        setShowAddModal(false)
        fetchInstructors()
      }
    })
  }

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingInstructor) return
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateInstructor(editingInstructor.id, formData)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast('Instructor updated successfully')
        setEditingInstructor(null)
        fetchInstructors()
      }
    })
  }

  const handleToggle = async (instructor: Profile) => {
    startTransition(async () => {
      const result = await toggleInstructorStatus(instructor.id, !instructor.is_active)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast(`Instructor ${!instructor.is_active ? 'activated' : 'deactivated'}`)
        fetchInstructors()
      }
    })
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Faculty Directory
            </span>
          </div>
          <h1 className="font-serif text-3xl font-normal text-ink tracking-tight">
            Instructors
          </h1>
          <p className="text-sm text-muted mt-1 font-sans">
            Manage teaching faculty accounts, credentials, and teaching status
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add instructor
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card h-12 w-full animate-pulse bg-surface-soft/60" />
            ))}
          </div>
        ) : instructors.length === 0 ? (
          <EmptyState
            title="No instructors yet"
            description="Add instructors to assign them to daily academic periods."
            action={<button onClick={() => setShowAddModal(true)} className="btn btn-primary">Add instructor</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {instructors.map((inst) => (
                  <tr key={inst.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary text-xs font-semibold">
                          {inst.full_name[0]?.toUpperCase()}
                        </div>
                        <span className="font-medium text-ink">{inst.full_name}</span>
                      </div>
                    </td>
                    <td className="text-muted">{inst.contact || '—'}</td>
                    <td>
                      <span className={`badge ${inst.is_active ? 'badge-active' : 'badge-inactive'}`}>
                        {inst.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingInstructor(inst)}
                          className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-surface-card transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleToggle(inst)}
                          disabled={isPending}
                          className={`p-1.5 rounded-md transition-colors ${
                            inst.is_active
                              ? 'text-muted-soft hover:text-danger hover:bg-danger-light'
                              : 'text-muted-soft hover:text-success hover:bg-success-light'
                          }`}
                          title={inst.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {inst.is_active ? (
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
      </div>

      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add instructor">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="label">Full Name *</label>
            <input name="full_name" required className="input" placeholder="e.g. Jane Smith" />
          </div>
          <div>
            <label className="label">Email *</label>
            <input name="email" type="email" required className="input" placeholder="jane@school.edu" />
          </div>
          <div>
            <label className="label">Password *</label>
            <input name="password" type="password" required minLength={6} className="input" placeholder="Min 6 characters" />
          </div>
          <div>
            <label className="label">Contact</label>
            <input name="contact" className="input" placeholder="e.g. +1 555-0144" />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-hairline">
            <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={isPending} className="btn btn-primary">
              {isPending ? 'Saving...' : 'Create instructor'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editingInstructor} onClose={() => setEditingInstructor(null)} title="Edit instructor">
        {editingInstructor && (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="label">Full Name *</label>
              <input name="full_name" defaultValue={editingInstructor.full_name} required className="input" />
            </div>
            <div>
              <label className="label">Contact</label>
              <input name="contact" defaultValue={editingInstructor.contact || ''} className="input" />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-hairline">
              <button type="button" onClick={() => setEditingInstructor(null)} className="btn btn-secondary">Cancel</button>
              <button type="submit" disabled={isPending} className="btn btn-primary">
                {isPending ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
