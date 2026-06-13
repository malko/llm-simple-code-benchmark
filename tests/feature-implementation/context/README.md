# task-store

A tiny in-memory task list, used as a building block for a CLI/task-tracking
tool.

## API (`src/taskStore.ts`)

- `createTask(title: string): Task` — creates a new task with status
  `"pending"` and returns it.
- `listTasks(): Task[]` — returns all tasks, in creation order.
- `getTask(id: number): Task | undefined` — looks up a task by id.
- `completeTask(id: number): boolean` — marks a task as `"done"`; returns
  `false` if no task with that id exists.
- `_reset(): void` — clears all state (used by tests).

`Task` = `{ id: number; title: string; status: TaskStatus }`, where
`TaskStatus = 'pending' | 'done'`.
