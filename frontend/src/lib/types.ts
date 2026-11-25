// Shape of a user as the API returns it (docs/API.md). Never includes the password hash.
export type Role = "admin" | "leader" | "member";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  soundEnabled: boolean;
}

export type StateCategory = "todo" | "doing" | "done";
export type TaskType = "task" | "story" | "bug" | "epic";
export type Priority = "low" | "medium" | "high" | "urgent";
export type LinkType = "blocks" | "depends_on" | "relates_to";

export interface Project {
  id: number;
  key: string;
  name: string;
  description: string;
  wipLimit: number;
  archived: boolean;
}

export interface WorkflowState {
  id: number;
  name: string;
  position: number;
  category: StateCategory;
}

export interface Label {
  id: number;
  name: string;
  color: string;
}

export interface Person {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface ProjectDetail {
  project: Project;
  states: WorkflowState[];
  labels: Label[];
  members: (Person & { active: boolean })[];
}

export interface TaskSummary {
  id: number;
  key: string;
  number: number;
  title: string;
  type: TaskType;
  priority: Priority;
  stateId: number;
  dueDate: string | null;
  parentId: number | null;
  position: number;
  version: number;
  labelIds: number[];
}

export interface TaskFull extends TaskSummary {
  description: string;
  createdById: number;
}

export interface TaskLink {
  id: number;
  type: LinkType;
  direction: "out" | "in";
  key: string;
  title: string;
}

export interface TaskComment {
  id: number;
  body: string;
  createdAt: string;
  authorId: number;
  authorName: string;
  mentions: { userId: number; name: string }[];
}

export interface TaskAttachment {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedByName: string;
}

export interface TaskEvent {
  id: number;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  actorId: number;
  actorName: string;
}

export interface TaskDetail {
  task: TaskFull;
  parent: { key: string; title: string } | null;
  subtasks: { id: number; key: string; title: string; stateId: number; priority: Priority; type: TaskType; version: number }[];
  links: TaskLink[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
  events: TaskEvent[];
}
