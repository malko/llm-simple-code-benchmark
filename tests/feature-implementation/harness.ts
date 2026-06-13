// Hidden grading harness — copied into the agent's workspace by test.ts as
// harness.ts and run with node. Not part of context/, so the agent never sees
// it.
import * as taskStore from './src/taskStore';

const results: Record<string, boolean> = {};

function safe(name: string, fn: () => boolean): void {
  try {
    results[name] = fn();
  } catch {
    results[name] = false;
  }
}

taskStore._reset();
const a = taskStore.createTask('a');
const b = taskStore.createTask('b');
const c = taskStore.createTask('c');
taskStore.completeTask(b.id);

safe('filterPending', () =>
  JSON.stringify((taskStore as any).filterByStatus('pending').map((t: any) => t.id)) ===
  JSON.stringify([a.id, c.id]));

safe('filterDone', () =>
  JSON.stringify((taskStore as any).filterByStatus('done').map((t: any) => t.id)) ===
  JSON.stringify([b.id]));

safe('deleteExisting', () => (taskStore as any).deleteTask(a.id) === true);
safe('deletedGone', () => taskStore.getTask(a.id) === undefined);
safe('deleteMissingReturnsFalse', () => (taskStore as any).deleteTask(999) === false);
safe('listAfterDelete', () =>
  JSON.stringify(taskStore.listTasks().map(t => t.id)) === JSON.stringify([b.id, c.id]));

taskStore._reset();
const d = taskStore.createTask('d');
safe('existingCreateStillWorks', () => d.status === 'pending' && d.id === 1);
safe('existingCompleteStillWorks', () =>
  taskStore.completeTask(d.id) === true && taskStore.getTask(d.id)?.status === 'done');

console.log(JSON.stringify(results));
