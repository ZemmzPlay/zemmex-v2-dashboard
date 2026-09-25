'use client';

import { startTransition } from 'react';

/**
 * React resets a form after its action runs, which would wipe what someone
 * typed when the server says something is wrong. Submitting through this
 * handler runs the same action without the reset.
 */
export function keepValues(formAction: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  };
}
