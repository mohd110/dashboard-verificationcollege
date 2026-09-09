/** The shape every form action in the dashboard returns. */
export type ActionState = { error: string | null; message: string | null };

export const idleState: ActionState = { error: null, message: null };

export type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;
