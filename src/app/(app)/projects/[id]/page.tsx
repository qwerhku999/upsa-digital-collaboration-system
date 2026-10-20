import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHead } from "@/components/ui";
import { ActivityTab, MembersTab, MilestonesTab, OverviewTab, SubmissionsTab, TasksTab } from "@/components/project/tabs";
import { MeetingsTab } from "@/components/project/meetings-tab";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { one } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { listActivity } from "@/server/services/activity";
import { listMeetings } from "@/server/services/meetings";
import { getProject } from "@/server/services/projects";
import { listSubmissions } from "@/server/services/submissions";
import { getProjectWorkload, listTasks } from "@/server/services/tasks";
import { taskListFilterSchema } from "@/server/validation";

const TABS = [["overview", "Overview"], ["tasks", "Tasks"], ["milestones", "Milestones"], ["submissions", "Documents"], ["meetings", "Meetings"], ["members", "Members"], ["activity", "Activity"]] as const;

export async function generateMetadata() {
  return { title: "Project | Project Hub" };
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const visibleTabs = user.role === "ADMIN" ? TABS.filter(([key]) => key !== "submissions") : TABS;
  const tab = visibleTabs.find(([k]) => k === one(sp.tab))?.[0] ?? "overview";
  const joined = one(sp.joined) === "1";

  let detail;
  try {
    detail = await getProject(user, id); // 404 for projects the user may not see
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { project } = detail;

  let body: React.ReactNode;
  if (tab === "overview") {
    const [supervisors, workload] = await Promise.all([
      user.role === "ADMIN" ? prisma.user.findMany({ where: { role: "SUPERVISOR", active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }) : [],
      getProjectWorkload(user, id),
    ]);
    body = <OverviewTab detail={detail} supervisors={supervisors} workload={workload} />;
  } else if (tab === "tasks") {
    const status = (["TODO", "IN_PROGRESS", "IN_REVIEW", "COMPLETED"] as const).find((s) => s === one(sp.status));
    const priority = (["LOW", "MEDIUM", "HIGH"] as const).find((s) => s === one(sp.priority));
    const sort = one(sp.sort) === "priority" || one(sp.sort) === "updated" ? one(sp.sort) : "due";
    const filterResult = taskListFilterSchema.safeParse({
      status, priority, assigneeId: one(sp.assigneeId), dueFrom: one(sp.dueFrom), dueTo: one(sp.dueTo),
      overdue: one(sp.overdue) === "1", sort,
    });
    const qs = {
      status, priority, assigneeId: one(sp.assigneeId), dueFrom: one(sp.dueFrom), dueTo: one(sp.dueTo),
      sort, overdue: one(sp.overdue), filterError: filterResult.success ? undefined : filterResult.error.issues[0]?.message,
    };
    const tasks = filterResult.success
      ? await listTasks(user, { projectId: id, take: 50, ...filterResult.data })
      : { items: [], pages: 1, total: 0 };
    body = <TasksTab detail={detail} userId={user.id} tasks={tasks} qs={qs} />;
  } else if (tab === "milestones") body = <MilestonesTab detail={detail} />;
  else if (tab === "submissions") body = <SubmissionsTab detail={detail} subs={await listSubmissions(user, { projectId: id })} />;
  else if (tab === "meetings") body = <MeetingsTab detail={detail} meetings={await listMeetings(user, id)} />;
  else if (tab === "members") body = <MembersTab detail={detail} userId={user.id} />;
  else body = <ActivityTab items={await listActivity(user, id)} />;

  return (
    <>
      <PageHead eyebrow={project.academicPeriod ?? "PROJECT"} title={project.title}>
        <Badge value={project.status} />
      </PageHead>
      {joined ? <p className="success" role="status">You joined this project successfully. You can see the group members in the Members tab.</p> : null}
      <p><Link href="/projects">← All projects</Link></p>
      <nav className="tabs" aria-label="Project sections">
        {visibleTabs.map(([k, text]) => <Link key={k} href={`/projects/${id}?tab=${k}`} className={tab === k ? "on" : undefined} aria-current={tab === k ? "page" : undefined}>{text}</Link>)}
      </nav>
      {body}
    </>
  );
}
