'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import type { ProjectMemberDto } from '@sprintflow/shared';
import { createTask, upsertAssignment } from '@/lib/api/tasks';
import { fetchBoard } from '@/lib/api/boards';

interface Props {
  sprintId: string;
  epicId?: string;
  workspaceId: string;
  projectId?: string | null;
  members: ProjectMemberDto[];
  onDone: () => void;
  onCancel: () => void;
}

const PRIORITIES = ['P0', 'P1', 'P2'] as const;

export function InlineAddTask({ sprintId, epicId, workspaceId, projectId, members, onDone, onCancel }: Props) {
  const defaultBoardId = useAuthStore((s) => s.defaultBoardId) ?? '';
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'P0' | 'P1' | 'P2'>('P1');
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '');
  const [hours, setHours] = useState('');

  // Fetch board to get the first column (todo column)
  const { data: boardData } = useQuery({
    queryKey: ['board-columns', defaultBoardId],
    queryFn: () => fetchBoard(defaultBoardId),
    enabled: !!defaultBoardId,
    staleTime: 300_000, // 5 min; columns rarely change
  });

  const firstColumnId = boardData?.columns?.[0]?.id ?? '';

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!defaultBoardId || !firstColumnId) throw new Error('Board not loaded');

      const task = await createTask({
        workspaceId,
        boardId: defaultBoardId,
        columnId: firstColumnId,
        title: title.trim(),
        priority,
        sprintId,
        epicId,
        projectId: projectId ?? undefined,
      });

      const h = parseFloat(hours);
      if (selectedMemberId && !isNaN(h) && h > 0) {
        await upsertAssignment(task.id, workspaceId, selectedMemberId, h);
      }

      return task;
    },
    onSuccess: onDone,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && title.trim()) {
      e.preventDefault();
      createMutation.mutate();
    }
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="flex flex-col gap-2 py-1">
      <input
        autoFocus
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Task title — Enter to add"
        className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      <div className="flex flex-wrap items-center gap-2">
        {/* Priority */}
        <div className="flex gap-1">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                priority === p
                  ? p === 'P0' ? 'bg-red-500 text-white' : p === 'P1' ? 'bg-amber-400 text-white' : 'bg-slate-500 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Owner */}
        <select
          value={selectedMemberId}
          onChange={(e) => setSelectedMemberId(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none"
        >
          <option value="">— Owner —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        {/* Hours */}
        <input
          type="number"
          min="0"
          step="0.5"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="hrs"
          className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none"
        />

        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => { if (title.trim()) createMutation.mutate(); }}
            disabled={!title.trim() || createMutation.isPending || !firstColumnId}
            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMutation.isPending ? '…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
      {createMutation.isError && (
        <p className="text-xs text-red-600">{(createMutation.error as Error).message}</p>
      )}
    </div>
  );
}
