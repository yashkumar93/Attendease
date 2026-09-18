'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createSubject, updateSubject, deleteSubject } from '@/app/actions/master-data'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/ToastProvider'
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
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subjects</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage subjects available for class periods</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Subject
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger-children">
        {loading ? (
          [...Array(6)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)
        ) : subjects.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              title="No subjects yet"
              description="Add subjects to assign them to class periods"
              action={<button onClick={() => setShowAddModal(true)} className="btn btn-primary">Add Subject</button>}
            />
          </div>
        ) : (
          subjects.map((subject) => (
            <div key={subject.id} className="card p-4 flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary-light flex items-center justify-center">
                  <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <span className="font-medium text-foreground">{subject.subject_name}</span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditingSubject(subject)} className="btn btn-ghost btn-sm btn-icon">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <button onClick={() => setDeletingSubject(subject)} className="btn btn-ghost btn-sm btn-icon text-danger">
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
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Subject" size="sm">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="label">Subject Name *</label>
            <input name="subject_name" required className="input" placeholder="e.g., Mathematics" autoFocus />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={isPending} className="btn btn-primary">{isPending ? 'Adding...' : 'Add'}</button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editingSubject} onClose={() => setEditingSubject(null)} title="Edit Subject" size="sm">
        {editingSubject && (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="label">Subject Name *</label>
              <input name="subject_name" defaultValue={editingSubject.subject_name} required className="input" autoFocus />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditingSubject(null)} className="btn btn-secondary">Cancel</button>
              <button type="submit" disabled={isPending} className="btn btn-primary">{isPending ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deletingSubject}
        onClose={() => setDeletingSubject(null)}
        onConfirm={handleDelete}
        title="Delete Subject"
        message={`Are you sure you want to delete "${deletingSubject?.subject_name}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={isPending}
      />
    </div>
  )
}
