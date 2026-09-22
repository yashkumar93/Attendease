'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createSubject, updateSubject, deleteSubject } from '@/app/actions/master-data'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/ToastProvider'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'
import type { Subject } from '@/lib/types/database'

export default function SubjectsPage() {
  const supabase = createClient()
  const { showToast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [deletingSubject, setDeletingSubject] = useState<Subject | null>(null)

  const fetchSubjects = async () => {
    setLoading(true)
    const { data } = await supabase.from('subjects').select('*').order('subject_name')
    if (data) setSubjects(data)
    setLoading(false)
  }

  useEffect(() => { fetchSubjects() }, [])

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createSubject(formData)
      if (result.error) showToast(result.error, 'error')
      else { showToast('Subject added'); setShowAddModal(false); fetchSubjects() }
    })
  }

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingSubject) return
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateSubject(editingSubject.id, formData)
      if (result.error) showToast(result.error, 'error')
      else { showToast('Subject updated'); setEditingSubject(null); fetchSubjects() }
    })
  }

  const handleDelete = async () => {
    if (!deletingSubject) return
    startTransition(async () => {
      const result = await deleteSubject(deletingSubject.id)
      if (result.error) showToast(result.error, 'error')
      else { showToast('Subject deleted'); setDeletingSubject(null); fetchSubjects() }
    })
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Course Catalog
            </span>
          </div>
          <h1 className="font-serif text-3xl font-normal text-ink tracking-tight">
            Subjects
          </h1>
          <p className="text-sm text-muted mt-1 font-sans">
            Manage academic subjects available for daily curriculum and period assignment
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add subject
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {loading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="card h-20 animate-pulse bg-surface-soft/60" />
          ))
        ) : subjects.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              title="No subjects yet"
              description="Add subjects to assign them to class periods."
              action={<button onClick={() => setShowAddModal(true)} className="btn btn-primary">Add subject</button>}
            />
          </div>
        ) : (
          subjects.map((subject) => (
            <div key={subject.id} className="card p-5 flex items-center justify-between group hover:border-[#d8d0c5] transition-all">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-md bg-canvas border border-hairline flex items-center justify-center text-primary">
                  <AnthropicSpikeMark className="w-4 h-4 text-primary" />
                </div>
                <span className="font-medium text-ink">{subject.subject_name}</span>
              </div>
              <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditingSubject(subject)}
                  className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-canvas transition-colors"
                  title="Edit subject"
                  aria-label="Edit subject"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <button
                  onClick={() => setDeletingSubject(subject)}
                  className="p-1.5 rounded-md text-muted-soft hover:text-danger hover:bg-danger-light transition-colors"
                  title="Delete subject"
                  aria-label="Delete subject"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add subject">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="label">Subject Name *</label>
            <input name="subject_name" required className="input" placeholder="e.g. Data Structures & Algorithms" />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-hairline">
            <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={isPending} className="btn btn-primary">
              {isPending ? 'Saving...' : 'Add subject'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editingSubject} onClose={() => setEditingSubject(null)} title="Edit subject">
        {editingSubject && (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="label">Subject Name *</label>
              <input name="subject_name" defaultValue={editingSubject.subject_name} required className="input" />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-hairline">
              <button type="button" onClick={() => setEditingSubject(null)} className="btn btn-secondary">Cancel</button>
              <button type="submit" disabled={isPending} className="btn btn-primary">
                {isPending ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deletingSubject}
        onClose={() => setDeletingSubject(null)}
        onConfirm={handleDelete}
        title="Delete Subject"
        message={`Delete "${deletingSubject?.subject_name}"? This will affect any periods assigned to this subject.`}
        confirmLabel="Delete Subject"
        loading={isPending}
      />
    </div>
  )
}
