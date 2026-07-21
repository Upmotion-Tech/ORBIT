#!/usr/bin/env python3
"""
Frontend migration: employee names → employee IDs for tasks/projects.

Updates script.js to:
1. Use assignee_id instead of assignee (string → UUID)
2. Use team_ids instead of team (array of names → array of UUIDs)
3. Add helper functions to map IDs ↔ names
4. Update all dropdown/filter logic to work with IDs
5. Update display rendering to map IDs to names
"""

import re

# Read the current script.js
with open('unpacked/script.js', 'r', encoding='utf-8') as f:
    script = f.read()

# 1. Add new helper functions after the existing utility functions
helper_functions = '''
// ---- Employee ID ↔ Name mapping helpers (Phase 2 migration) ----
function getEmployeeId(name) {
  if (!name || typeof name !== 'string') return null;
  const emp = (window.__apiEmployees || []).find(e => e.name === name);
  return emp ? emp.id : null;
}
function getEmployeeName(id) {
  if (!id || typeof id !== 'string') return id;
  const emp = (window.__apiEmployees || []).find(e => e.id === id);
  return emp ? emp.name : id;
}
function namesToIds(names) {
  return (names || [])
    .map(name => getEmployeeId(name))
    .filter(id => id !== null);
}
function idsToNames(ids) {
  return (ids || []).map(id => getEmployeeName(id));
}
'''

# Find where to insert the helpers (after the existing utility functions, before CRM helpers)
insert_pos = script.find('// ---- CRM Leads:')
if insert_pos > 0:
    script = script[:insert_pos] + helper_functions + '\n' + script[insert_pos:]

# 2. Update taskForm state initialization to use assignee_id
script = re.sub(
    r"taskForm:\s*\{\s*projectId:\s*'',\s*title:\s*'',\s*assignee:\s*'',",
    "taskForm: { projectId: '', title: '', assignee_id: '',",
    script
)

# 3. Update setTaskFormField to handle assignee_id
script = re.sub(
    r"setTaskFormField\s*=\s*\(\s*field,\s*val\s*\)\s*=>\s*this\.setState\(\{\s*taskForm:\s*\{\.\.\.this\.state\.taskForm,\s*\[field\]:\s*val",
    "setTaskFormField = (field, val) => this.setState({ taskForm: { ...this.state.taskForm, [field]: val",
    script
)

# 4. Update submitNewTask validation and payload
script = re.sub(
    r"if\s*\(!f\.projectId\s*\|\|\s*!f\.title\s*\|\|\s*!f\.assignee\s*\|\|\s*!f\.deadline\)",
    "if (!f.projectId || !f.title || !f.assignee_id || !f.deadline)",
    script
)

script = re.sub(
    r"assignee:\s*f\.assignee\s*\|\|\s*null,",
    "assignee_id: f.assignee_id || null,",
    script
)

# 5. Update task form state initialization in openNewTask
script = re.sub(
    r"taskForm:\s*\{\s*projectId:\s*presetProjectId\s*\|\|\s*'',\s*title:\s*'',\s*assignee:\s*'',",
    "taskForm: { projectId: presetProjectId || '', title: '', assignee_id: '',",
    script
)

# 6. Update setTaskFieldLive calls for assignee
script = re.sub(
    r"onTaskAssignee\s*=\s*\(e\)\s*=>\s*this\.setTaskFieldLive\(selTaskId,\s*'assignee',\s*e\.target\.value\)",
    "onTaskAssignee = (e) => this.setTaskFieldLive(selTaskId, 'assignee_id', e.target.value)",
    script
)

# 7. Update task display mapping to use assignee_id
script = re.sub(
    r"assigneeHighlight:\s*getHighlightParts\(raw\.assignee,\s*query\)",
    "assigneeHighlight: getHighlightParts(getEmployeeName(raw.assignee_id), query)",
    script
)

# 8. Update task filter dropdown to work with IDs
script = re.sub(
    r"const\s+taskAssigneeOptions\s*=\s*\[\{\s*value:\s*'',\s*label:\s*'All assignees'\s*\}\]\.concat\(Array\.from\(new\s+Set\(visibleTasksFlat\.map\(\(t\)\s*=>\s*t\.assignee\)\)(?:\s*\.filter\(Boolean\))?\.map\(\(n\)\s*=>\s*\(\{\s*value:\s*n,\s*label:\s*n\s*\}\)\)\)",
    "const taskAssigneeOptions = [{ value: '', label: 'All assignees' }].concat(Array.from(new Set(visibleTasksFlat.map((t) => t.assignee_id))).filter(Boolean).map((id) => ({ value: id, label: getEmployeeName(id) })))",
    script
)

# 9. Update project team handling to use team_ids
script = re.sub(
    r"team:\s*\[\]",
    "team_ids: []",
    script
)

# Write the updated script
with open('unpacked/script.js', 'w', encoding='utf-8') as f:
    f.write(script)

print("✓ Updated script.js for employee ID migration")
print("  - Added ID ↔ name mapping helpers")
print("  - Changed assignee → assignee_id")
print("  - Changed team → team_ids")
print("  - Updated validation and payload logic")
print("  - Updated display rendering to map IDs to names")
