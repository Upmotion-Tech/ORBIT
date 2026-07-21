# Frontend Integration Guide - Employee ID Migration

## Critical Changes for Frontend

The backend now uses employee IDs (UUIDs) instead of names for all assignments, team membership, and tracking.

### 1. **When Creating/Assigning Tasks**

**OLD (Name-based):**
```javascript
POST /api/tasks
{
  "title": "Build API",
  "assignee": "John Doe"  // ❌ Name string
}
```

**NEW (ID-based):**
```javascript
POST /api/tasks
{
  "title": "Build API",
  "assignee_id": "uuid-1234-5678-90ab"  // ✅ Employee UUID
}
```

**In script.js:**
```javascript
// In submitNewTask function:
const payload = {
  title: tfTitle,
  assignee_id: selectedEmployeeId,  // Use ID, not name
  project_id: tfProjectId,
  deadline: tfDeadlineDate,
  description: tfDescription
};
```

### 2. **When Assigning Project Teams**

**OLD (Array of names):**
```javascript
PUT /api/projects/123
{
  "team": ["John Doe", "Jane Smith"]  // ❌ Names
}
```

**NEW (Array of IDs):**
```javascript
PUT /api/projects/123
{
  "team_ids": ["uuid-1234-...", "uuid-5678-..."]  // ✅ Employee UUIDs
}
```

**In script.js:**
```javascript
// In updateProjectTeam or similar:
const teamIds = selectedTeamMembers.map(emp => emp.id);
const payload = {
  team_ids: teamIds  // Send IDs, not names
};
```

### 3. **When Displaying Assignments**

The frontend loads employee data via `GET /api/employees` and maintains a map of `id → name` for display:

```javascript
// Load employees once at app boot
const employees = await employeesApi.list();
const empMap = new Map(employees.map(e => [e.id, e.name]));

// When rendering a task:
const taskRow = {
  ...task,
  assignee: empMap.get(task.assignee_id)  // Map ID back to display name
};
```

### 4. **Critical Field Name Changes**

Update all references to these fields:

| Old Field | New Field | Type | Example |
|-----------|-----------|------|---------|
| `task.assignee` | `task.assignee_id` | UUID | "abc-123..." |
| `project.team` | `project.team_ids` | UUID[] | ["abc...", "def..."] |
| `task.created_by` | `task.created_by_id` | UUID | "abc-123..." |
| `task.updated_by` | `task.updated_by_id` | UUID | "abc-123..." |
| `comment.author` | `comment.author_id` | UUID | "abc-123..." |

### 5. **API Endpoints Updated**

All endpoints now expect/return ID fields:

```bash
# Creating a task
POST /api/tasks
{
  "assignee_id": "uuid",
  "created_by_id": "uuid"
}

# Creating a project
POST /api/projects
{
  "team_ids": ["uuid1", "uuid2"],
  "created_by_id": "uuid"
}

# Creating a comment
POST /api/projects/{id}/comments
{
  "author_id": "uuid"
}
```

### 6. **Frontend Mapping Functions Needed**

Add these helper functions to script.js:

```javascript
// Convert employee name to ID
function getEmployeeId(name) {
  const emp = apiEmployees.find(e => e.name === name);
  return emp ? emp.id : null;
}

// Convert employee ID to name
function getEmployeeName(id) {
  const emp = apiEmployees.find(e => e.id === id);
  return emp ? emp.name : id;  // Fallback to ID if not found
}

// Convert array of names to array of IDs
function namesToIds(names) {
  return names
    .map(name => getEmployeeId(name))
    .filter(id => id !== null);
}

// Convert array of IDs to array of names
function idsToNames(ids) {
  return ids.map(id => getEmployeeName(id));
}
```

### 7. **Dropdowns & Selectors**

When rendering employee dropdown (for assignment, team member selection):

```javascript
// In renderVals() or related:
assigneeOptions: apiEmployees.map(emp => ({
  value: emp.id,      // ✅ Use ID as value
  label: emp.name     // Display name in UI
}))
```

When submitting:

```javascript
// The form will send emp.id, not emp.name
const assigneeId = form.assignee.value;  // This is now a UUID
```

### 8. **Search & Filter**

When filtering tasks by assignee:

```javascript
// OLD: filter by name
tasks.filter(t => t.assignee === "John Doe")

// NEW: filter by ID
const assigneeId = getEmployeeId("John Doe");
tasks.filter(t => t.assignee_id === assigneeId)
```

### 9. **Testing the Changes**

1. Load the app - auto-login should work with the new backend
2. Create a task and assign it to an employee by ID
3. Verify the task appears in that employee's task list
4. Create a project and add team members
5. Switch to Dev persona - verify they see only their assigned tasks/projects
6. Change an employee's name in the backend (or via UI)
7. Refresh - their tasks should still appear (the name change should not orphan assignments)

### 10. **Backwards Compatibility Notes**

- The old `assignee` / `team` / `created_by` / `updated_by` name fields may still exist in the database during transition
- Always send the new `_id` fields to the API
- The API will only populate the new `_id` fields in responses
- Map IDs to names in the frontend for display

---

## Quick Checklist for Frontend Updates

- [ ] Update TaskCreate/TaskUpdate payloads to send `assignee_id` not `assignee`
- [ ] Update ProjectCreate/ProjectUpdate payloads to send `team_ids` not `team`
- [ ] Update all comment creation to send `author_id`
- [ ] Add employee name→ID mapping functions
- [ ] Update all dropdowns to use employee IDs as values
- [ ] Update all filters to work with employee IDs
- [ ] Update all display rendering to map IDs back to names using employee list
- [ ] Test assignment creation and verification
- [ ] Test that name changes don't orphan assignments

---

## Implementation Pattern

Every place the frontend sends an employee identifier:

```javascript
// ❌ BEFORE: Send name
const data = { assignee: employeeName };

// ✅ AFTER: Send ID
const data = { assignee_id: employeeId };
```

Every place the frontend displays an employee:

```javascript
// ❌ BEFORE: Display directly
<div>Assigned to: {task.assignee}</div>

// ✅ AFTER: Map ID to name
<div>Assigned to: {empMap.get(task.assignee_id)}</div>
```
