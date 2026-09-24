/** What a dashboard form action returns. `at` changes on every success so dialogs can close. */
export interface ActionState {
  ok?: string;
  error?: string;
  at?: number;
}

export const done = (ok: string): ActionState => ({ ok, at: Date.now() });
export const failed = (error: string): ActionState => ({ error });
