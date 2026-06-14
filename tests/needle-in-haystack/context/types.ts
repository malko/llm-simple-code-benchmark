/** A single text-transformation plugin. */
export interface Plugin {
  /** Unique identifier for this plugin. */
  name: string;
  /** Human-readable description of what this plugin does. */
  description: string;
  /** Applies this plugin's transformation to `input` and returns the result. */
  run(input: string): string;
}
