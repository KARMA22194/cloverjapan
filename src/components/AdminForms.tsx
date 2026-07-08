"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createProjectAction,
  createUserAction,
  type ActionState,
} from "@/app/actions/admin";
import { SubmitButton } from "@/components/SubmitButton";

const initial: ActionState = { ok: false };

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500";

export function ProjectCreateForm() {
  const [state, formAction] = useActionState(createProjectAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex-1 min-w-[160px]">
        <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
        <input name="name" required className={inputClass} />
      </div>
      <div className="w-32">
        <label className="mb-1 block text-xs font-medium text-slate-600">Kürzel</label>
        <input name="code" required placeholder="z. B. WEB" className={inputClass} />
      </div>
      <div className="w-20">
        <label className="mb-1 block text-xs font-medium text-slate-600">Farbe</label>
        <input
          name="color"
          type="color"
          defaultValue="#3b82f6"
          className="h-[38px] w-full rounded-md border border-slate-300"
        />
      </div>
      <SubmitButton pendingLabel="…">Projekt anlegen</SubmitButton>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function UserCreateForm() {
  const [state, formAction] = useActionState(createUserAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex-1 min-w-[140px]">
        <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
        <input name="name" required className={inputClass} />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="mb-1 block text-xs font-medium text-slate-600">E-Mail</label>
        <input name="email" type="email" required className={inputClass} />
      </div>
      <div className="w-36">
        <label className="mb-1 block text-xs font-medium text-slate-600">Passwort</label>
        <input name="password" type="text" required className={inputClass} />
      </div>
      <div className="w-32">
        <label className="mb-1 block text-xs font-medium text-slate-600">Rolle</label>
        <select name="role" defaultValue="EMPLOYEE" className={inputClass}>
          <option value="EMPLOYEE">Employee</option>
          <option value="MANAGER">Manager</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <SubmitButton pendingLabel="…">Nutzer anlegen</SubmitButton>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
