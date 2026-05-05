import React from 'react';
import { Search, Filter, X, Calendar, RotateCcw } from 'lucide-react';
import { Button } from '../Button';
import { Badge } from '../Badge';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  
  filters?: Array<{
    id: string;
    label: string;
    options: FilterOption[];
    value: string;
  }>;
  onFilterChange?: (filterId: string, value: string) => void;
  
  activeFilterCount?: number;
  onClearFilters?: () => void;
  
  children?: React.ReactNode;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  filters = [],
  onFilterChange,
  activeFilterCount = 0,
  onClearFilters,
  children,
  className
}) => {
  return (
    <div className={cn('ui-filter-bar', className)}>
      <div className="filter-main">
        {/* Search Input */}
        <div className="search-container">
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder={searchPlaceholder} 
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="search-input"
            aria-label={searchPlaceholder}
          />
          {searchValue && (
            <button className="clear-search" type="button" onClick={() => onSearchChange?.('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Dropdowns/Selects */}
        <div className="filters-list">
          {filters.map((filter) => (
            <div key={filter.id} className="filter-item">
              <span className="filter-label">{filter.label}:</span>
              <select 
                value={filter.value} 
                onChange={(e) => onFilterChange?.(filter.id, e.target.value)}
                className="filter-select"
                aria-label={filter.label}
              >
                <option value="">All</option>
                {filter.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ))}
          {children}
        </div>
      </div>

      <div className="filter-actions">
        {activeFilterCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClearFilters}
            className="text-text-muted hover:text-primary"
          >
            <RotateCcw size={14} className="mr-2" />
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
};
