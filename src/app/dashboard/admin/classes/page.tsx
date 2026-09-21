/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'

export default async function ClassesPage() {
  const supabase = await createClient()
  const { data: classes } = await supabase
    .from('classes')
    .select('*, students(id)')
    .order('id')

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Cohorts & Sections
            </span>
          </div>
          <h1 className="font-serif text-3xl font-normal text-ink tracking-tight">
            Classes
          </h1>
          <p className="text-sm text-muted mt-1 font-sans">
            7 fixed academic cohorts configured for the institution
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger-children">
        {((classes || []) as any[]).map((cls: any) => {
          const studentCount = Array.isArray(cls.students) ? cls.students.length : 0
          return (
            <div key={cls.id} className="card p-5 card-interactive hover:border-[#d8d0c5]">
              <div className="flex items-center gap-3.5 mb-4">
                <div className="w-10 h-10 rounded-md bg-canvas border border-hairline flex items-center justify-center text-ink font-serif text-lg font-normal">
                  {cls.id}
                </div>
                <div>
                  <h3 className="font-serif text-lg font-normal text-ink">{cls.class_name}</h3>
                  <p className="text-xs text-muted font-mono">
                    {studentCount} student{studentCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-hairline-soft">
                <a
                  href={`/dashboard/admin/students?class=${cls.id}`}
                  className="btn btn-secondary btn-sm flex-1 text-xs"
                >
                  View Students
                </a>
                <a
                  href={`/dashboard/admin/schedule?class=${cls.id}`}
                  className="btn btn-secondary btn-sm flex-1 text-xs"
                >
                  Schedule
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
