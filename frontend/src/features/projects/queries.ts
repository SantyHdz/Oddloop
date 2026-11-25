import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Person, Project, ProjectDetail, TaskDetail, TaskSummary } from "@/lib/types";

export const projectsKey = ["projects"] as const;

export function useProjects() {
  return useQuery({ queryKey: projectsKey, queryFn: async () => (await api<{ projects: Project[] }>("/api/projects")).projects });
}

export function useProject(key: string) {
  return useQuery({ queryKey: ["project", key], queryFn: () => api<ProjectDetail>(`/api/projects/${key}`), retry: false });
}

export interface TaskFilters {
  stateId?: string;
  type?: string;
  priority?: string;
  labelId?: string;
  q?: string;
  dueFrom?: string;
  dueTo?: string;
  sort?: string;
  dir?: "asc" | "desc";
}

function queryString(filters: TaskFilters) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) if (value) params.set(name, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

// The board uses no filters; the list passes its own, so each has its own cache entry.
export function useTasks(key: string, filters: TaskFilters = {}) {
  return useQuery({
    queryKey: ["tasks", key, filters],
    queryFn: async () => (await api<{ tasks: TaskSummary[] }>(`/api/projects/${key}/tasks${queryString(filters)}`)).tasks,
  });
}

export function useTaskDetail(taskKey: string) {
  return useQuery({ queryKey: ["task", taskKey], queryFn: () => api<TaskDetail>(`/api/tasks/${taskKey}`), retry: false });
}

export function useDirectory(enabled: boolean) {
  return useQuery({ queryKey: ["directory"], queryFn: async () => (await api<{ people: Person[] }>("/api/directory")).people, enabled });
}

// After any change to a task, both the lists and that task's detail are out of date.
export function refreshTasks(queryClient: QueryClient, projectKey: string, taskKey?: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["tasks", projectKey] }),
    taskKey ? queryClient.invalidateQueries({ queryKey: ["task", taskKey] }) : undefined,
  ]);
}
