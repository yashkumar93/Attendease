/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
export default async function ClassesPage() {
  const supabase = await createClient()
  const { data: classes } = await supabase
    .from('classes')
    .select('*, students(id)')
    .order('id')

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <p className="text-xs font-medium text-muted mb-2">
            Academic structure
          </p>
          <h1 className="text-[28px] font-semibold text-ink tracking-tight leading-tight">
            Classes
          </h1>
          <p className="text-muted text-sm mt-1">
            7 fixed academic classes configured for the institution
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger-children">
        {((classes || []) as any[]).map((cls: any) => {
          const studentCount = Array.isArray(cls.students) ? cls.students.length : 0
          return (
            <div key={cls.id} className="card p-5 card-interactive hover:border-[#d8d0c5]">
              <div className="flex items-center gap-3.5 mb-4">
                <div className="w-10 h-10 rounded-md bg-canvas border border-hairline flex items-center justify-center text-ink font-mono text-base font-medium">
                  {cls.id}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink">{cls.class_name}</h3>
                  <p className="text-xs text-muted font-mono">
                    {studentCount === 1 ? '1 student' : `${studentCount} students`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-hairline-soft">
                <a
                  href={`/dashboard/admin/students?class=${cls.id}`}
                  className="btn btn-secondary btn-sm flex-1 text-xs"
                >
                  View students
                </a>
                <a
                  href={`/dashboard/admin/schedule?class=${cls.id}`}
                  className="btn btn-secondary btn-sm flex-1 text-xs"
                >
                  View schedule
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
