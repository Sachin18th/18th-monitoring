import React from 'react';

export const FilterBar = () => (
    <div className="filter-bar flex flex-wrap gap-4 p-4 border-b bg-gray-50 items-center justify-between">
        <div className="flex gap-4">
            {/* TODO: Add React state logic evaluating Context bounds dynamically */}
            <select className="border rounded p-2 bg-white"><option>Last 1 Hour</option></select>
            <select className="border rounded p-2 bg-white"><option>Global</option></select>
            <select className="border rounded p-2 bg-white"><option>All Sources</option></select>
        </div>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition">Apply Filters</button>
    </div>
);
