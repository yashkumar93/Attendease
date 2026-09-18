/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'

export default async function ClassesPage() {
  const supabase = await createClient()
  const { data: classes } = await supabase
    .from('classes')
    .select('*, students(id)')
    .order('id')

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Classes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          7 fixed classes configured for the institution
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger-children">
        {((classes || []) as any[]).map((cls: any) => {
          const studentCount = Array.isArray(cls.students) ? cls.students.length : 0
          return (
            <div key={cls.id} className="card p-5 card-interactive">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                  {cls.id}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{cls.class_name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {studentCount} student{studentCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/dashboard/admin/students?class=${cls.id}`}
                  className="btn btn-ghost btn-sm flex-1 text-xs"
                >
                  View Students
                </a>
                <a
                  href={`/dashboard/admin/schedule?class=${cls.id}`}
                  className="btn btn-ghost btn-sm flex-1 text-xs"
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
