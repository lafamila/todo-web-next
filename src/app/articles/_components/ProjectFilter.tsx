'use client';

import { cn } from '@/lib/utils';
import Icon from '@/components/ui/Icon';

interface ProjectFilterItem {
  id: string;
  name: string;
  icon: string;
  count: number;
}

interface ProjectFilterProps {
  projects: ProjectFilterItem[];
  selectedProjectId: string | null;
  onSelect: (projectId: string | null) => void;
  totalCount: number;
}

export function ProjectFilter({
  projects,
  selectedProjectId,
  onSelect,
  totalCount,
}: ProjectFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors',
          selectedProjectId === null
            ? 'bg-[#3994ef] text-white'
            : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
        )}
      >
        전체
        <span className="text-xs opacity-70">{totalCount}</span>
      </button>

      {projects.map((project) => (
        <button
          key={project.id}
          onClick={() => onSelect(project.id)}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors',
            selectedProjectId === project.id
              ? 'bg-[#3994ef] text-white'
              : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
          )}
        >
          <Icon icon={project.icon} />
          {project.name}
          <span className="text-xs opacity-70">{project.count}</span>
        </button>
      ))}
    </div>
  );
}
