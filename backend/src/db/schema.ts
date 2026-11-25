import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// Temporary table that proved data survives `docker compose down` / `up` (stage 1).
export const smokeTest = pgTable("smoke_test", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  note: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roleEnum = pgEnum("role", ["admin", "leader", "member"]);

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum().notNull(),
  active: boolean().notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  ...timestamps,
});

export const sessions = pgTable("sessions", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  // Only the SHA-256 of the token is stored: a leaked table cannot be used to log in.
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const auditLog = pgTable("audit_log", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  actorId: integer("actor_id").references(() => users.id),
  action: text().notNull(),
  target: text().notNull(),
  payload: jsonb(),
  ...timestamps,
});

// ---- Stage 3: projects, workflow, tasks ----

export const stateCategoryEnum = pgEnum("state_category", ["todo", "doing", "done"]);
export const taskTypeEnum = pgEnum("task_type", ["task", "story", "bug", "epic"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const linkTypeEnum = pgEnum("link_type", ["blocks", "depends_on", "relates_to"]);

export const projects = pgTable("projects", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  key: text().notNull().unique(), // 2 to 5 uppercase letters, never changes
  name: text().notNull(),
  description: text().notNull().default(""),
  wipLimit: integer("wip_limit").notNull().default(5), // used from stage 4 (RN-07)
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  // Next task number to hand out: the task key is KEY-number. Incremented inside the same
  // statement that reads it, so two people creating tasks at once never get the same number.
  nextTaskNumber: integer("next_task_number").notNull().default(1),
  ...timestamps,
});

export const projectMembers = pgTable(
  "project_members",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer("project_id").notNull().references(() => projects.id),
    userId: integer("user_id").notNull().references(() => users.id),
    ...timestamps,
  },
  (t) => [unique().on(t.projectId, t.userId)],
);

export const workflowStates = pgTable(
  "workflow_states",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer("project_id").notNull().references(() => projects.id),
    name: text().notNull(),
    position: integer().notNull(),
    category: stateCategoryEnum().notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.projectId, t.name)],
);

export const labels = pgTable(
  "labels",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer("project_id").notNull().references(() => projects.id),
    name: text().notNull(),
    color: text().notNull(), // #rrggbb
    ...timestamps,
  },
  (t) => [unique().on(t.projectId, t.name)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer("project_id").notNull().references(() => projects.id),
    number: integer().notNull(),
    title: text().notNull(),
    description: text().notNull().default(""),
    type: taskTypeEnum().notNull().default("task"),
    priority: priorityEnum().notNull().default("medium"),
    stateId: integer("state_id").notNull().references(() => workflowStates.id),
    // A calendar day with no time zone (YYYY-MM-DD), so a task never moves to another day (RNF-23).
    dueDate: date("due_date", { mode: "string" }),
    parentId: integer("parent_id").references((): AnyPgColumn => tasks.id),
    position: integer().notNull(), // order inside its column
    createdById: integer("created_by_id").notNull().references(() => users.id),
    // Optimistic concurrency (RN-13): every change must say which version it started from.
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [unique().on(t.projectId, t.number), index().on(t.projectId, t.stateId)],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    taskId: integer("task_id").notNull().references(() => tasks.id),
    labelId: integer("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [unique().on(t.taskId, t.labelId)],
);

export const taskLinks = pgTable(
  "task_links",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    fromTaskId: integer("from_task_id").notNull().references(() => tasks.id),
    toTaskId: integer("to_task_id").notNull().references(() => tasks.id),
    type: linkTypeEnum().notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.fromTaskId, t.toTaskId, t.type)],
);

export const comments = pgTable("comments", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("task_id").notNull().references(() => tasks.id),
  authorId: integer("author_id").notNull().references(() => users.id),
  body: text().notNull(),
  ...timestamps,
});

export const commentMentions = pgTable(
  "comment_mentions",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    commentId: integer("comment_id").notNull().references(() => comments.id),
    userId: integer("user_id").notNull().references(() => users.id),
    ...timestamps,
  },
  (t) => [unique().on(t.commentId, t.userId)],
);

export const attachments = pgTable("attachments", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("task_id").notNull().references(() => tasks.id),
  uploadedById: integer("uploaded_by_id").notNull().references(() => users.id),
  filename: text().notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer().notNull(),
  storagePath: text("storage_path").notNull(), // file name inside the attachments volume
  ...timestamps,
});

// Task history (RN-12): who did what and when.
export const taskEvents = pgTable("task_events", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("task_id").notNull().references(() => tasks.id),
  actorId: integer("actor_id").notNull().references(() => users.id),
  type: text().notNull(),
  payload: jsonb(),
  ...timestamps,
});
