'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SprintBoardDto, SprintTaskDto, EpicDto, SprintDto } from '@sprintflow/shared';
import { updateTask, upsertAssignment, removeAssignment } from '@/lib/api/tasks';
import { updateSprint } from '@/lib/api/sprints';
import { updateEpic, updateProjectMember } from '@/lib/api/projects';
import { ScrumTaskDrawer } from './ScrumTaskDrawer';
import { InlineAddTask } from './InlineAddTask';

interface Props {
  board: SprintBoardDto;
  workspaceId: string;
  onRefresh: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700 ring-red-200',
  P1: 'bg-amber-100 text-amber-700 ring-amber-200',
  P2: 'bg-slate-100 text-slate-600 ring-slate-200',
};

function pct(a: number, b: number) {
  return b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0;
}

function DayBurnDots({ hours, days }: { hours: number; days: number }) {
  const hoursPerDay = days > 0 ? hours / days : 0;
  const segments = Array.from({ length: Math.min(days, 6) }, (_, i) => {
    const dayNum = i + 1;
    return dayNum * hoursPerDay;
  });
  const max = Math.max(...segments, 0.1);
  return (
    <div className="flex items-end gap-0.5">
      {segments.map((h, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm bg-indigo-300 transition-all duration-300 hover:bg-indigo-500"
          style={{ height: `${Math.max(4, Math.round((h / max) * 14))}px` }}
          title={`Day ${i + 1}: ${h.toFixed(1)}h`}
        />
      ))}
    </div>
  );
}

// ── Floating Owner Chips Editor ──────────────────────────────────────────────
function OwnerChips({
  assignments, taskId, workspaceId, members, onRefresh
}: {
  assignments: SprintTaskDto['assignments'];
  taskId: string;
  workspaceId: string;
  members: SprintBoardDto['memberWorkload'][number]['member'][];
  onRefresh: () => void;
}) {
  const [activeChipId, setActiveChipId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [hoursInput, setHoursInput] = useState('');
  const queryClient = useQueryClient();

  const assignMutation = useMutation({
    mutationFn: ({ memberId, hours }: { memberId: string; hours: number }) =>
      upsertAssignment(taskId, workspaceId, memberId, hours),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
      onRefresh();
      setActiveChipId(null);
      setShowAdd(false);
    },
  });

  const removeAssignMutation = useMutation({
    mutationFn: (memberId: string) => removeAssignment(taskId, workspaceId, memberId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
      onRefresh();
      setActiveChipId(null);
    },
  });

  return (
    <div className="relative flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
      {assignments.map((a) => {
        const isEditing = activeChipId === a.id;
        return (
          <div key={a.id} className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isEditing) {
                  setActiveChipId(null);
                } else {
                  setActiveChipId(a.id);
                  setHoursInput(a.hours.toString());
                  setShowAdd(false);
                }
              }}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 hover:ring-1 hover:ring-indigo-300 transition-all cursor-pointer transform hover:scale-105 active:scale-95"
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-200 text-[7px] font-bold text-indigo-700">
                {a.memberName.slice(0, 2).toUpperCase()}
              </span>
              {a.hours}h
            </button>

            {isEditing && (
              <div
                className="absolute left-0 top-full z-50 mt-1.5 w-48 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Edit Assignment</span>
                  <button
                    onClick={() => setActiveChipId(null)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400">Committed Hours</label>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        type="number"
                        value={hoursInput}
                        onChange={(e) => setHoursInput(e.target.value)}
                        className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                        min="0.5"
                        max="200"
                        step="0.5"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const h = parseFloat(hoursInput);
                            if (!isNaN(h) && h > 0) {
                              assignMutation.mutate({ memberId: a.projectMemberId, hours: h });
                            }
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          const h = parseFloat(hoursInput);
                          if (!isNaN(h) && h > 0) {
                            assignMutation.mutate({ memberId: a.projectMemberId, hours: h });
                          }
                        }}
                        className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-2">
                    <button
                      onClick={() => {
                        if (confirm(`Remove assignment for ${a.memberName}?`)) {
                          removeAssignMutation.mutate(a.projectMemberId);
                        }
                      }}
                      className="flex items-center gap-1 text-[10px] font-medium text-red-600 hover:text-red-700"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add assignment chip */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowAdd(!showAdd);
            setActiveChipId(null);
            setHoursInput('');
          }}
          className="flex h-4.5 w-4.5 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer transform hover:scale-110 active:scale-95"
          title="Add assignment"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {showAdd && (
          <div
            className="absolute left-0 top-full z-50 mt-1.5 w-48 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Assign Member</span>
              <button
                onClick={() => setShowAdd(false)}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block text-[10px] font-medium text-slate-400">Select Member</label>
                <select
                  onChange={(e) => {
                    const mId = e.target.value;
                    if (!mId) return;
                    const h = parseFloat(hoursInput) || 2;
                    assignMutation.mutate({ memberId: mId, hours: h });
                  }}
                  className="mt-1 w-full rounded border border-slate-200 px-1.5 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>-- Select member --</option>
                  {members
                    .filter(m => !assignments.some(a => a.projectMemberId === m.id))
                    .map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-slate-400">Hours (optional)</label>
                <input
                  type="number"
                  value={hoursInput}
                  onChange={(e) => setHoursInput(e.target.value)}
                  placeholder="2h"
                  className="mt-1 w-full rounded border border-slate-200 px-1.5 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                  min="0.5"
                  max="200"
                  step="0.5"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Priority selector dropdown ───────────────────────────────────────────────
function PrioritySelector({
  taskId, priority, workspaceId, onRefresh
}: {
  taskId: string;
  priority: string | null;
  workspaceId: string;
  onRefresh: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newPriority: string | null) =>
      updateTask(taskId, workspaceId, { priority: newPriority as any }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
      onRefresh();
      setIsOpen(false);
    },
  });

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 transition-all duration-150 transform hover:scale-105 active:scale-95 cursor-pointer ${
          priority ? PRIORITY_COLORS[priority] : 'bg-slate-50 text-slate-400 ring-slate-200 hover:ring-indigo-300'
        }`}
      >
        {priority || '—'}
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-28 rounded-md border border-slate-200 bg-white shadow-lg py-1 animate-in fade-in slide-in-from-top-1 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {['P0', 'P1', 'P2', null].map((p) => (
            <button
              key={p ?? 'none'}
              onClick={() => mutation.mutate(p)}
              className="flex w-full items-center px-2 py-1 text-left text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            >
              {p ? (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${PRIORITY_COLORS[p]}`}>
                  {p}
                </span>
              ) : (
                <span className="text-slate-400">— None —</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline Editable Title ────────────────────────────────────────────────────
function EditableTitle({
  taskId, title, done, workspaceId, onRefresh, onClick
}: {
  taskId: string;
  title: string;
  done: boolean;
  workspaceId: string;
  onRefresh: () => void;
  onClick: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(title);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newTitle: string) => updateTask(taskId, workspaceId, { title: newTitle }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
      onRefresh();
      setIsEditing(false);
    },
  });

  if (isEditing) {
    return (
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          if (val.trim() && val.trim() !== title) {
            mutation.mutate(val.trim());
          } else {
            setIsEditing(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (val.trim() && val.trim() !== title) {
              mutation.mutate(val.trim());
            } else {
              setIsEditing(false);
            }
          } else if (e.key === 'Escape') {
            setVal(title);
            setIsEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded border border-indigo-400 px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-indigo-50/30"
        autoFocus
      />
    );
  }

  return (
    <span
      className={`text-sm text-slate-800 hover:text-indigo-700 cursor-pointer transition-all duration-300 font-medium select-none ${
        done ? 'line-through text-slate-400 opacity-60' : ''
      }`}
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      title="Double-click to rename title inline"
    >
      {title}
    </span>
  );
}

// ── Epic Header settings (Rename and Color Pick) ─────────────────────────────
function EpicHeaderEdit({
  epic, projectId, onRefresh
}: {
  epic: EpicDto;
  projectId: string | null;
  onRefresh: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(epic.name);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (patch: { name?: string; color?: string }) =>
      updateEpic(projectId!, epic.id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
      onRefresh();
      setIsOpen(false);
    },
    onError: (e: any) => {
      alert(e.message || 'Failed to update epic');
    },
  });

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280', '#06b6d4', '#f97316', '#14b8a6'];

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors transform hover:scale-110 active:scale-95 cursor-pointer"
        title="Edit Epic details"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Edit Epic</span>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-medium text-slate-400">Epic Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim() && name.trim() !== epic.name) {
                    mutation.mutate({ name: name.trim() });
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">Color Palette</label>
              <div className="grid grid-cols-5 gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => mutation.mutate({ color: c })}
                    className={`h-5 w-5 rounded transition-transform hover:scale-110 ${
                      epic.color === c ? 'ring-2 ring-indigo-500 ring-offset-1' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-1.5 border-t border-slate-100">
              <button
                disabled={!name.trim() || name.trim() === epic.name}
                onClick={() => mutation.mutate({ name: name.trim() })}
                className="rounded bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Interactive Sprint Header ───────────────────────────────────────────────
function EditableSprintHeader({
  sprint, workspaceId, budgetHours, plannedHours, bufferHours, onRefresh
}: {
  sprint: SprintDto;
  workspaceId: string;
  budgetHours: number;
  plannedHours: number;
  bufferHours: number;
  onRefresh: () => void;
}) {
  const [editingField, setEditingField] = useState<'name' | 'goal' | 'days' | 'dates' | 'release' | null>(null);
  const [tempName, setTempName] = useState(sprint.name);
  const [tempGoal, setTempGoal] = useState(sprint.goal ?? '');
  const [tempDays, setTempDays] = useState(sprint.days.toString());
  const [tempStartDate, setTempStartDate] = useState(sprint.startDate ? sprint.startDate.slice(0, 10) : '');
  const [tempEndDate, setTempEndDate] = useState(sprint.endDate ? sprint.endDate.slice(0, 10) : '');
  
  const [tempReleaseMilestone, setTempReleaseMilestone] = useState(sprint.releaseMilestone);
  const [tempReleaseLabel, setTempReleaseLabel] = useState(sprint.releaseLabel ?? '');
  const [tempReleaseDate, setTempReleaseDate] = useState(sprint.releaseDate ? sprint.releaseDate.slice(0, 10) : '');

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (patch: any) => updateSprint(sprint.id, workspaceId, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
      onRefresh();
      setEditingField(null);
    },
  });

  const usedPct = budgetHours > 0 ? Math.min(100, Math.round((plannedHours / budgetHours) * 100)) : 0;
  const isOver = plannedHours > budgetHours;

  const statusColors: Record<string, string> = {
    PLANNING:  'bg-amber-100 text-amber-700 hover:bg-amber-200',
    ACTIVE:    'bg-green-100 text-green-700 hover:bg-green-200',
    COMPLETED: 'bg-slate-100 text-slate-500 hover:bg-slate-200',
  };

  return (
    <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        
        {/* Left section: Sprint Details */}
        <div className="min-w-0 flex-1 space-y-2">
          
          {/* Row 1: Name, Status, Release milestone */}
          <div className="flex flex-wrap items-center gap-2.5">
            {editingField === 'name' ? (
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={() => {
                  if (tempName.trim() && tempName.trim() !== sprint.name) {
                    mutation.mutate({ name: tempName.trim() });
                  } else {
                    setEditingField(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (tempName.trim() && tempName.trim() !== sprint.name) {
                      mutation.mutate({ name: tempName.trim() });
                    }
                  } else if (e.key === 'Escape') {
                    setTempName(sprint.name);
                    setEditingField(null);
                  }
                }}
                className="rounded border border-indigo-400 px-2 py-0.5 text-xl font-bold text-slate-900 focus:outline-none"
                autoFocus
              />
            ) : (
              <div className="group flex items-center gap-1.5">
                <h1
                  className="text-xl font-bold text-slate-900 cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => { setTempName(sprint.name); setEditingField('name'); }}
                  title="Click to edit sprint name"
                >
                  {sprint.name}
                </h1>
                <button
                  onClick={() => { setTempName(sprint.name); setEditingField('name'); }}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-opacity"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}

            {/* Status Dropdown selector */}
            <div className="relative">
              <select
                value={sprint.status}
                onChange={(e) => mutation.mutate({ status: e.target.value as any })}
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border-0 cursor-pointer appearance-none focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all duration-200 ${
                  statusColors[sprint.status]
                }`}
              >
                <option value="PLANNING">PLANNING</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>

            {/* Release Milestone Toggle / Badge */}
            <div className="relative">
              {editingField === 'release' ? (
                <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Release Milestone</span>
                    <button onClick={() => setEditingField(null)} className="text-slate-400 hover:text-slate-600">
                      <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempReleaseMilestone}
                        onChange={(e) => setTempReleaseMilestone(e.target.checked)}
                        className="rounded border-slate-300 accent-indigo-600 h-3.5 w-3.5"
                      />
                      Enable Release Milestone
                    </label>

                    {tempReleaseMilestone && (
                      <>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-400">Release Label</label>
                          <input
                            type="text"
                            value={tempReleaseLabel}
                            onChange={(e) => setTempReleaseLabel(e.target.value)}
                            placeholder="e.g. Release 1 (Internal)"
                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-400">Release Date</label>
                          <input
                            type="date"
                            value={tempReleaseDate}
                            onChange={(e) => setTempReleaseDate(e.target.value)}
                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                          />
                        </div>
                      </>
                    )}

                    <div className="flex justify-end pt-1.5 border-t border-slate-100">
                      <button
                        onClick={() => {
                          mutation.mutate({
                            releaseMilestone: tempReleaseMilestone,
                            releaseLabel: tempReleaseMilestone ? tempReleaseLabel.trim() || null : null,
                            releaseDate: tempReleaseMilestone && tempReleaseDate ? new Date(tempReleaseDate).toISOString() : null,
                          });
                        }}
                        className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setTempReleaseMilestone(sprint.releaseMilestone);
                    setTempReleaseLabel(sprint.releaseLabel ?? '');
                    setTempReleaseDate(sprint.releaseDate ? sprint.releaseDate.slice(0, 10) : '');
                    setEditingField('release');
                  }}
                  className={`rounded px-2 py-0.5 text-xs font-bold transition-all transform hover:scale-105 active:scale-95 ${
                    sprint.releaseMilestone
                      ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                      : 'border border-dashed border-slate-300 text-slate-400 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  {sprint.releaseMilestone ? (sprint.releaseLabel ?? 'Release') : '+ Release Milestone'}
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Sprint Goal */}
          <div className="max-w-2xl">
            {editingField === 'goal' ? (
              <textarea
                value={tempGoal}
                onChange={(e) => setTempGoal(e.target.value)}
                onBlur={() => {
                  if (tempGoal.trim() !== (sprint.goal ?? '')) {
                    mutation.mutate({ goal: tempGoal.trim() || null });
                  } else {
                    setEditingField(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    if (tempGoal.trim() !== (sprint.goal ?? '')) {
                      mutation.mutate({ goal: tempGoal.trim() || null });
                    }
                  } else if (e.key === 'Escape') {
                    setTempGoal(sprint.goal ?? '');
                    setEditingField(null);
                  }
                }}
                className="w-full rounded border border-indigo-400 px-2 py-1 text-sm focus:outline-none bg-indigo-50/20"
                rows={2}
                autoFocus
                placeholder="Add sprint goal..."
              />
            ) : (
              <p
                onClick={() => { setTempGoal(sprint.goal ?? ''); setEditingField('goal'); }}
                className={`text-sm cursor-pointer hover:text-indigo-600 transition-colors select-none ${
                  sprint.goal ? 'text-slate-500' : 'text-slate-400 italic'
                }`}
                title="Click to edit goal"
              >
                {sprint.goal || '+ Add sprint goal...'}
              </p>
            )}
          </div>

          {/* Row 3: Dates & Days */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 select-none">
            {editingField === 'dates' ? (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={tempStartDate}
                  onChange={(e) => setTempStartDate(e.target.value)}
                  className="rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:border-indigo-400 focus:outline-none"
                />
                <span>→</span>
                <input
                  type="date"
                  value={tempEndDate}
                  onChange={(e) => setTempEndDate(e.target.value)}
                  className="rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:border-indigo-400 focus:outline-none"
                />
                <button
                  onClick={() => {
                    mutation.mutate({
                      startDate: tempStartDate ? new Date(tempStartDate).toISOString() : null,
                      endDate: tempEndDate ? new Date(tempEndDate).toISOString() : null,
                    });
                  }}
                  className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-indigo-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingField(null)}
                  className="text-slate-400 hover:text-slate-600 text-[10px]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <span
                onClick={() => {
                  setTempStartDate(sprint.startDate ? sprint.startDate.slice(0, 10) : '');
                  setTempEndDate(sprint.endDate ? sprint.endDate.slice(0, 10) : '');
                  setEditingField('dates');
                }}
                className="cursor-pointer hover:text-indigo-600 transition-colors"
                title="Click to edit sprint dates"
              >
                {sprint.startDate ? new Date(sprint.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '?'}
                {' → '}
                {sprint.endDate ? new Date(sprint.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?'}
              </span>
            )}

            <span>·</span>

            {editingField === 'days' ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={tempDays}
                  onChange={(e) => setTempDays(e.target.value)}
                  className="w-12 rounded border border-slate-200 px-1 py-0.5 text-xs text-right focus:border-indigo-400 focus:outline-none"
                  min="1"
                  max="30"
                  autoFocus
                  onBlur={() => {
                    const d = parseInt(tempDays, 10);
                    if (!isNaN(d) && d !== sprint.days) {
                      mutation.mutate({ days: d });
                    } else {
                      setEditingField(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const d = parseInt(tempDays, 10);
                      if (!isNaN(d) && d !== sprint.days) {
                        mutation.mutate({ days: d });
                      }
                    } else if (e.key === 'Escape') {
                      setTempDays(sprint.days.toString());
                      setEditingField(null);
                    }
                  }}
                />
                <span className="text-[10px] text-slate-400">working days</span>
              </div>
            ) : (
              <span
                onClick={() => { setTempDays(sprint.days.toString()); setEditingField('days'); }}
                className="cursor-pointer hover:text-indigo-600 transition-colors font-medium"
                title="Click to edit working days count"
              >
                {sprint.days} working days
              </span>
            )}
          </div>

        </div>

        {/* Right section: Budget status */}
        <div className="min-w-[200px] flex-shrink-0">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>{plannedHours}h planned</span>
            <span>{budgetHours}h budget</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                isOver ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' : usedPct > 85 ? 'bg-amber-400' : 'bg-indigo-500'
              }`}
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
          <p className={`mt-1 text-right text-xs font-semibold ${isOver ? 'text-red-600 animate-pulse' : 'text-emerald-600'}`}>
            {isOver ? `${plannedHours - budgetHours}h overloaded` : `${bufferHours}h buffer`}
          </p>
        </div>

      </div>
    </div>
  );
}

// ── Interactive Editable Capacity Cell ──────────────────────────────────────
function EditableCapacity({
  member, projectId, daysPerWeek, onRefresh
}: {
  member: SprintBoardDto['memberWorkload'][number]['member'];
  projectId: string | null;
  daysPerWeek: number;
  onRefresh: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(member.hoursPerDay.toString());
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (h: number) =>
      updateProjectMember(projectId!, member.id, { hoursPerDay: h }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
      onRefresh();
      setIsEditing(false);
    },
  });

  if (!projectId) return <span className="font-mono text-slate-400">{member.hoursPerDay * daysPerWeek}h</span>;

  if (isEditing) {
    return (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            const h = parseFloat(val);
            if (!isNaN(h) && h >= 0.5 && h <= 24 && h !== member.hoursPerDay) {
              mutation.mutate(h);
            } else {
              setIsEditing(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const h = parseFloat(val);
              if (!isNaN(h) && h >= 0.5 && h <= 24 && h !== member.hoursPerDay) {
                mutation.mutate(h);
              }
            } else if (e.key === 'Escape') {
              setVal(member.hoursPerDay.toString());
              setIsEditing(false);
            }
          }}
          className="w-12 rounded border border-indigo-400 px-1 py-0.5 text-right text-xs focus:outline-none"
          autoFocus
          min="0.5"
          max="24"
          step="0.5"
        />
        <span className="text-[10px] text-slate-400">h/d</span>
      </div>
    );
  }

  return (
    <span
      onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
      className="cursor-pointer hover:text-indigo-600 hover:underline font-mono text-slate-500 transition-colors select-none"
      title={`Capacity is ${member.hoursPerDay}h/day for ${daysPerWeek} days/week. Click to edit.`}
    >
      {member.hoursPerDay * daysPerWeek}h
    </span>
  );
}

// ── Standard Task Row ────────────────────────────────────────────────────────
function TaskRow({
  task, sprintDays, onEdit, onDoneToggle, members, workspaceId, onRefresh
}: {
  task: SprintTaskDto;
  sprintDays: number;
  onEdit: (id: string) => void;
  onDoneToggle: (id: string, done: boolean) => void;
  members: SprintBoardDto['memberWorkload'][number]['member'][];
  workspaceId: string;
  onRefresh: () => void;
}) {
  const [isChecked, setIsChecked] = useState(task.done);

  return (
    <tr
      className={`group border-t border-slate-100 hover:bg-slate-50/60 transition-colors duration-200 ${
        isChecked ? 'bg-slate-50/30' : ''
      }`}
    >
      <td className="w-8 px-3 py-2.5">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => {
            setIsChecked(e.target.checked);
            onDoneToggle(task.id, e.target.checked);
          }}
          className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600 transition-transform active:scale-90"
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td className="w-12 px-2 py-2.5">
        <PrioritySelector
          taskId={task.id}
          priority={task.priority}
          workspaceId={workspaceId}
          onRefresh={onRefresh}
        />
      </td>
      <td className="px-2 py-2.5">
        <EditableTitle
          taskId={task.id}
          title={task.title}
          done={isChecked}
          workspaceId={workspaceId}
          onRefresh={onRefresh}
          onClick={() => onEdit(task.id)}
        />
      </td>
      <td className="px-3 py-2.5">
        <OwnerChips
          assignments={task.assignments}
          taskId={task.id}
          workspaceId={workspaceId}
          members={members}
          onRefresh={onRefresh}
        />
      </td>
      <td className="w-20 px-3 py-2.5 text-right font-mono text-xs text-slate-500 select-none">
        {task.totalHours > 0 ? `${task.totalHours}h` : '—'}
      </td>
      <td className="w-24 px-3 py-2.5">
        <DayBurnDots hours={task.totalHours} days={sprintDays} />
      </td>
    </tr>
  );
}

// ── Epic Sections ────────────────────────────────────────────────────────────
function EpicSection({
  epic, tasks, members, onEdit, onDoneToggle, sprintId, workspaceId, projectId, sprintDays, onTaskAdded,
}: {
  epic: EpicDto | null;
  tasks: SprintTaskDto[];
  members: SprintBoardDto['memberWorkload'];
  onEdit: (id: string) => void;
  onDoneToggle: (id: string, done: boolean) => void;
  sprintId: string;
  workspaceId: string;
  projectId: string | null;
  sprintDays: number;
  onTaskAdded: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [addingTask, setAddingTask] = useState(false);

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
      {/* Epic header */}
      <div
        className={`flex w-full items-center justify-between px-4 py-2.5 hover:bg-slate-50 cursor-pointer select-none transition-all duration-200 ${
          collapsed ? 'rounded-xl' : 'rounded-t-xl'
        }`}
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="h-3 w-3 flex-shrink-0 rounded-full transition-transform hover:scale-110"
            style={{ backgroundColor: epic?.color ?? '#e2e8f0' }}
          />
          <span className="text-sm font-bold text-slate-800 truncate">
            {epic?.name ?? 'No Epic'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-slate-400 select-none">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
          
          {epic && (
            <EpicHeaderEdit
              epic={epic}
              projectId={projectId}
              onRefresh={onTaskAdded}
            />
          )}

          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
          >
            <svg
              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          <table className="w-full">
            <tbody>
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  sprintDays={sprintDays}
                  onEdit={onEdit}
                  onDoneToggle={onDoneToggle}
                  members={members.map((mw) => mw.member)}
                  workspaceId={workspaceId}
                  onRefresh={onTaskAdded}
                />
              ))}
            </tbody>
          </table>

          {addingTask ? (
            <div className="border-t border-slate-100 px-4 py-2 bg-slate-50/20 rounded-b-xl">
              <InlineAddTask
                sprintId={sprintId}
                epicId={epic?.id}
                workspaceId={workspaceId}
                projectId={projectId}
                members={members.map((mw) => mw.member)}
                onDone={() => { setAddingTask(false); onTaskAdded(); }}
                onCancel={() => setAddingTask(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400 hover:bg-slate-50 hover:text-indigo-600 transition-colors select-none font-medium rounded-b-xl"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add task
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Scrum Board View ────────────────────────────────────────────────────
export function SprintBoardView({ board, workspaceId, onRefresh }: Props) {
  const queryClient = useQueryClient();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const doneMutation = useMutation({
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) =>
      updateTask(taskId, workspaceId, { done }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sprint-board', board.sprint.id] });
      onRefresh();
    },
  });

  const handleDoneToggle = useCallback((taskId: string, done: boolean) => {
    doneMutation.mutate({ taskId, done });
  }, [doneMutation]);

  // Group tasks by epic
  const epicIds = [...new Set(board.tasks.map((t) => t.epicId))];
  const epicGroups: Array<{ epic: EpicDto | null; tasks: SprintTaskDto[] }> = epicIds.map((eid) => ({
    epic: eid ? (board.epics.find((e) => e.id === eid) ?? null) : null,
    tasks: board.tasks.filter((t) => t.epicId === eid),
  }));
  // Tasks without an epic
  const noEpicTasks = board.tasks.filter((t) => !t.epicId);
  if (noEpicTasks.length > 0 && !epicIds.includes(null)) {
    epicGroups.push({ epic: null, tasks: noEpicTasks });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      
      {/* Interactive Sprint details header */}
      <EditableSprintHeader
        sprint={board.sprint}
        workspaceId={workspaceId}
        budgetHours={board.budgetHours}
        plannedHours={board.plannedHours}
        bufferHours={board.bufferHours}
        onRefresh={onRefresh}
      />

      {/* Column headers */}
      <div className="flex-shrink-0 border-b border-slate-100 bg-slate-50/70 px-6 py-1 select-none">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="w-8 py-2 px-3" />
              <th className="w-12 px-2 py-2">Pri</th>
              <th className="px-2 py-2">Task</th>
              <th className="px-3 py-2">Owner</th>
              <th className="w-20 px-3 py-2 text-right">Hours</th>
              <th className="w-24 px-3 py-2">Burn</th>
            </tr>
          </thead>
        </table>
      </div>

      {/* Epic sections / Tasks */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {epicGroups.map(({ epic, tasks }) => (
          <EpicSection
            key={epic?.id ?? '__no_epic__'}
            epic={epic}
            tasks={tasks}
            members={board.memberWorkload}
            onEdit={setActiveTaskId}
            onDoneToggle={handleDoneToggle}
            sprintId={board.sprint.id}
            workspaceId={workspaceId}
            projectId={board.sprint.projectId}
            sprintDays={board.sprint.days}
            onTaskAdded={onRefresh}
          />
        ))}

        {epicGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/20">
            <p className="text-sm font-medium text-slate-400">No tasks in this sprint yet.</p>
            <p className="mt-1 text-xs text-slate-300">Add tasks using the "+ Add task" button below each epic.</p>
          </div>
        )}

        {/* Team workload Capacity Editor table */}
        {board.memberWorkload.length > 0 && (
          <div className="pt-4 border-t border-slate-100">
            <h2 className="mb-3 text-sm font-bold text-slate-700 select-none">
              Team — Capacity & Workload
            </h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Member</th>
                    <th className="px-4 py-2.5 text-right">Committed</th>
                    <th className="px-4 py-2.5 text-right">Capacity (weekly)</th>
                    <th className="px-4 py-2.5 text-right">P0</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {board.memberWorkload.map((mw) => (
                    <tr key={mw.member.id} className="hover:bg-slate-50/50 transition-colors duration-150">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 select-none">
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700 ring-2 ring-indigo-50">
                            {mw.member.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-semibold text-slate-800">{mw.member.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-700">
                        {mw.committedHours}h
                      </td>
                      <td className="px-4 py-3 text-right">
                        <EditableCapacity
                          member={mw.member}
                          projectId={board.sprint.projectId}
                          daysPerWeek={board.sprint.days}
                          onRefresh={onRefresh}
                        />
                      </td>
                      <td className="px-4 py-3 text-right select-none">
                        {mw.p0Count > 0
                          ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700 shadow-sm">{mw.p0Count}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center select-none">
                        {mw.overloaded
                          ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600 animate-pulse ring-2 ring-red-200">OVERLOADED</span>
                          : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-600">OK</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Task detail drawer */}
      {activeTaskId && (
        <ScrumTaskDrawer
          taskId={activeTaskId}
          workspaceId={workspaceId}
          members={board.memberWorkload.map((mw) => mw.member)}
          epics={board.epics}
          onClose={() => setActiveTaskId(null)}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}
