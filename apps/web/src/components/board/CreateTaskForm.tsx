'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTask } from '@/lib/api/tasks';
import { updateBoardCache, boardTaskFromDetail } from '@/lib/api/boards';
import { useBoardStore } from '@/store/board.store';

interface Props {
  columnId: string;
  boardId: string;
  workspaceId: string;
}

export function CreateTaskForm({ columnId, boardId, workspaceId }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const queryClient = useQueryClient();
  const openTask = useBoardStore((s) => s.openTask);

  const mutation = useMutation({
    mutationFn: () =>
      createTask({ workspaceId, boardId, columnId, title: title.trim() }),
    onSuccess: (newTask) => {
      updateBoardCache(queryClient, boardId, (old) => ({
        ...old,
        columns: old.columns.map((col) =>
          col.id !== columnId
            ? col
            : {
                ...col,
                tasks: [
                  ...col.tasks,
                  boardTaskFromDetail(newTask),
                ],
              },
        ),
      }));
      queryClient.setQueryData(['task', newTask.id, workspaceId], newTask);
      setTitle('');
      setOpen(false);
      openTask(newTask.id);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) mutation.mutate();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <span className="text-lg leading-none">+</span> Add task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2">
      <textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (title.trim()) mutation.mutate(); }
          if (e.key === 'Escape') { setOpen(false); setTitle(''); }
        }}
        placeholder="Task title…"
        rows={2}
        className="w-full resize-none rounded-lg border border-indigo-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div className="mt-1.5 flex gap-2">
        <button
          type="submit"
          disabled={!title.trim() || mutation.isPending}
          className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending ? '…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setTitle(''); }}
          className="rounded-md px-3 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
