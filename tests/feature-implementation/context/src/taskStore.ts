export type TaskStatus = 'pending' | 'done';

export interface Task {
  id: number;
  title: string;
  status: TaskStatus;
}

let nextId = 1;
const tasks: Task[] = [];

/** Creates a new task with status "pending" and returns it. */
export function createTask(title: string): Task {
  const task: Task = { id: nextId++, title, status: 'pending' };
  tasks.push(task);
  return task;
}

/** Returns all tasks, in creation order. */
export function listTasks(): Task[] {
  return [...tasks];
}

/** Returns the task with the given id, or undefined if not found. */
export function getTask(id: number): Task | undefined {
  return tasks.find(t => t.id === id);
}

/** Marks the task with the given id as done. Returns true if found, false otherwise. */
export function completeTask(id: number): boolean {
  const task = getTask(id);
  if (!task) return false;
  task.status = 'done';
  return true;
}

/** Resets all in-memory state. For tests only. */
export function _reset(): void {
  tasks.length = 0;
  nextId = 1;
}
