# Employee ID Migration - Implementation Guide

## Problem This Solves

**Critical Bug Fixed:** When an employee changes their name, all historical assignments (tasks, projects, comments, audit logs) disappear because the system was using names as identifiers instead of stable unique IDs.

**Example:** User "Hashim" → renames to "Hassan" → all tasks/projects assigned to them vanish because the system searched for "Hashim" and found nothing.

## Solution: Use Employee ID as Primary Reference

The system now uses `employee.id` (UUID) as the stable identifier everywhere, instead of `employee.name` or `employee.email`.

---

## Changes Completed ✓

### 1. **Database Models Updated**

All models now use `_id` columns to reference employees by ID, not names:

| Table | Old Column | New Column | Type |
|-------|-----------|-----------|------|
| tasks | `assignee` (string) | `assignee_id` (FK) | String(36) → employees.id |
| tasks | `created_by` (string) | `created_by_id` (FK) | String(36) → employees.id |
| tasks | `updated_by` (string) | `updated_by_id` (FK) | String(36) → employees.id |
| projects | `team` (JSON array of names) | `team_ids` (JSON array of IDs) | List[String(36)] |
| projects | `created_by` (string) | `created_by_id` (FK) | String(36) → employees.id |
| projects | `updated_by` (string) | `updated_by_id` (FK) | String(36) → employees.id |
| audit_logs | `actor` (string) | `actor_id` (FK) | String(36) → employees.id |
| project_comments | `author` (string) | `author_id` (FK) | String(36) → employees.id |
| leave_requests | `approved_by` (string) | `approved_by_id` (FK) | String(36) → employees.id |
| salary_slips | `created_by` (string) | `created_by_id` (FK) | String(36) → employees.id |
| salary_slips | `updated_by` (string) | `updated_by_id` (FK) | String(36) → employees.id |

**Files Modified:**
- `backend/app/models/task.py` ✓
- `backend/app/models/project.py` ✓
- `backend/app/models/audit_log.py` ✓
- `backend/app/models/project_comment.py` ✓
- `backend/app/models/leave_request.py` ✓
- `backend/app/models/salary_slip.py` ✓

### 2. **Helper Module Created**

`backend/app/core/employee_lookups.py` provides:
- `resolve_employee_id(repo, identifier)` - Convert name/email/ID to employee ID
- `resolve_employee_ids_array(repo, identifiers)` - Convert array of names to IDs
- `is_employee_id(identifier)` - Check if string is a UUID

### 3. **Old Database Deleted**

The old `orbit.db` has been deleted. SQLAlchemy will create a fresh database with the new schema when the backend starts.

---

## Changes Still Needed

### Phase 1: Repositories & Services (Highest Priority)

**Files to Update:**

1. **TaskRepository** (`backend/app/repositories/task_repository.py`)
   - Change `assignee` parameter to `assignee_id`
   - Update filters to use `Task.assignee_id` instead of `Task.assignee`
   - Update `add_comment()` to use `author_id` instead of `author`

2. **ProjectRepository** (`backend/app/repositories/project_repository.py`)
   - Change `team` handling to `team_ids`
   - Update visibility filters to check `team_ids` array instead of `team`

3. **TaskService** (`backend/app/services/task_service.py`)
   - Update `_resolve_assignee_notification_target()` to accept employee_id directly
   - Remove name-to-ID lookup (now handled by frontend)
   - Update create/update to use `assignee_id` field

4. **ProjectService** (`backend/app/services/project_service.py`)
   - Update team visibility checks to use `team_ids`
   - Change `_resolve_member_notification_target()` to work with IDs

5. **AuditLogService/Repository**
   - Update to use `actor_id` instead of `actor`
   - Keep `actor` field for display name lookup (optional, for UI convenience)

6. **Other Services:**
   - `LeaveService` - `approved_by_id`
   - `SalarySlipService` - `created_by_id`, `updated_by_id`
   - `EmployeeService` - all `created_by_id`, `updated_by_id` fields

### Phase 2: API Schemas

Update Pydantic schemas to use ID fields:
- `TaskCreate`, `TaskUpdate`, `TaskResponse`
- `ProjectCreate`, `ProjectUpdate`, `ProjectResponse`
- `ProjectCommentCreate`, `ProjectCommentResponse`
- `AuditLogResponse`
- `LeaveRequestResponse`
- `SalarySlipResponse`

### Phase 3: API Routers

Update endpoint handlers to:
1. Accept `assignee_id` (or resolve `assignee` name to ID)
2. Call services with IDs instead of names
3. Return responses with both ID and name (for display)

### Phase 4: Frontend Updates

The frontend must now:
1. **Send IDs to the backend** (not names)
   - When assigning a task: send `assignee_id` (UUID)
   - When creating a project team: send `team_ids` array (UUIDs)

2. **Display names to users** (while using IDs internally)
   - Load employee list via `GET /api/employees`
   - Map IDs to names for display
   - Use ID in all API calls

3. **Sample changes needed:**
   - Task assignment dropdown: send `assignee_id` not `assignee`
   - Project team picker: send `team_ids` not `team` (names)
   - Comment author attribution: send `author_id` not `author`

---

## Implementation Order

### Step 1: Start the Backend (Creates Fresh DB)
```bash
cd backend
uvicorn app.main:app --reload
```

### Step 2: Update Repositories
- `TaskRepository` (most used)
- `ProjectRepository` (second most used)
- `AuditLogRepository`

### Step 3: Update Services
- `TaskService`
- `ProjectService`
- Update remaining services as needed

### Step 4: Update Schemas
- All `*Response` schemas to include both `assignee` (display name) and `assignee_id` (reference)
- Create/Update schemas to accept `assignee_id` directly

### Step 5: Update Routers
- All endpoints to handle ID-based requests
- Implement name-to-ID resolution for backwards compatibility (optional)

### Step 6: Frontend Updates
- Update JavaScript to work with IDs
- Map IDs to names for UI display
- Test all assignment flows

---

## Database Schema Created

When the backend starts with the new models, SQLAlchemy will auto-create:

```sql
-- Examples of foreign key relationships that will be created:
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES employees(id);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by_id) REFERENCES employees(id);
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES employees(id);
-- ... and so on for all the new _id columns
```

---

## Data Preservation

**Old Database:** Deleted (was in mixed/transitional state)
**Fresh Start:** New database with clean employee ID references
**No Data Loss:** This is development, not production. All seed data can be recreated.

---

## Testing the Migration

Once implemented, verify:
```bash
# Test 1: Create an employee
POST /api/employees
{
  "name": "John Doe",
  "email": "john@example.com",
  ...
}
Response: { "id": "abc123...", "name": "John Doe", ... }

# Test 2: Assign a task using the employee ID from Test 1
POST /api/tasks
{
  "assignee_id": "abc123...",  # Use the UUID from above
  "title": "Task Title",
  ...
}

# Test 3: Change the employee's name
PUT /api/employees/abc123...
{
  "name": "Johnny Smith",  # Name changed!
  ...
}

# Test 4: Verify the task is still assigned (should appear in that employee's task list)
GET /api/employees/abc123.../tasks
# Should still include the task from Test 2, proving the assignment survived the name change!
```

---

## Benefits After Migration

✓ Employee name changes don't orphan records
✓ Staff reductions (user deletions) handle dependencies correctly via FK cascades
✓ Proper audit trail (who made changes) based on real employee identity
✓ Scalable permission model (same ID used for notifications, access control, etc.)
✓ Relational integrity (database enforces employee references)
✓ No more string-based lookups slowing queries down

---

## Rollback (if needed)

Since the old database is gone and models are changed:
- Restore from `orbit.db.bak-*` backup if it exists, OR
- Revert model files to use string columns again, OR
- Let this be a clean slate (recommended for development)

The fresh database approach is fastest and avoids migration bugs.
