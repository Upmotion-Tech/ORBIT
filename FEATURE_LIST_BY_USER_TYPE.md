# ORBIT - Feature List by User Type

## **OWNER** (Full Access)
1. **CRM Management** - Full access to all leads: create, edit, delete leads; manage stages, sources, and status
2. **Lead Pricing** - View and manage revenue figures, locked revenue, and financial projections
3. **Project Creation & Management** - Create, edit, delete projects; manage team assignments and budgets
4. **Project Visibility** - View all projects; see pricing/budget information; control who can access projects
5. **Task Management** - Create, edit, delete tasks and subtasks; assign to team members; set deadlines
6. **Finance Dashboard** - Full access to financial data: invoices, expenses, payroll, milestones
7. **Invoice Management** - Create, edit, delete invoices; download PDFs; manage line items and bank details
8. **Expense Approval** - Review, approve, or reject expense requests from finance teams
9. **Payroll Control** - Create and manage salary slips; edit gross, tax, allowances, deductions, and bonuses
10. **Milestone Tracking** - Create, edit, delete project milestones; track deliverables and finances
11. **Employee Management** - Add, edit, delete employees; assign access levels and departments; reset passwords
12. **Leave Policy Setup** - Configure annual, casual, and sick leave policies for the organization
13. **Leave Approval** - Approve or reject leave requests from employees; add notes or rejection reasons
14. **Hiring Management** - Post job openings; manage candidates; track hiring pipeline
15. **Department Budgets** - Set and manage budget targets per expense category; view budget vs. actual
16. **Audit Trail Access** - View complete audit log of all system changes and user actions
17. **Setup & Settings** - Manage pipeline stages, reporting sources, expense categories, and leave policies
18. **Currency Management** - Set and update USD to PKR exchange rates used across the system
19. **Account Deactivation** - Deactivate employee accounts; revoke access without deleting records
20. **Permanent Employee Delete** - Permanently delete employee accounts and all related data
21. **Multi-User Dashboard** - View company-wide KPIs, profitability, cash position, and resource utilization
22. **Reports & Analytics** - Access management reports with date-range filtering for leads, projects, and expenses
23. **Export Functionality** - Export dashboard data as Excel or PDF reports

---

## **FINANCE HEAD / FINANCE** (Finance & Reporting)
24. **Invoice & Expense Access** - Create, edit, and manage invoices and expenses (no delete without owner)
25. **Payroll Management** - View and edit salary slips; manage payroll for teams
26. **Financial Reporting** - Access finance dashboard, reports, and statistics; export reports as Excel/PDF
27. **Expense Approval** - Approve or reject expenses submitted by team members
28. **Department Budget Tracking** - View budget targets and actual spend by expense category
29. **Currency Visibility** - View current USD to PKR exchange rate (read-only)
30. **Employee Information** - View employee list, salaries (if HR admin), departments, and contact info
31. **Milestone Tracking** - View project milestones and financial projections
32. **Time Entry Visibility** - View time logged and resource allocation data
33. **Permission Limited** - Cannot create/edit/delete projects, tasks, leads, or employees

---

## **HR ADMIN / HR HEAD** (Human Resources)
34. **Employee CRUD** - Create, edit, delete employee records; manage access levels and departments
35. **Password Management** - Reset employee passwords; enforce mandatory password change on first login
36. **Leave Management** - View all leave requests; approve or reject with notes/reasons
37. **Leave Policy Setup** - Configure annual, casual, and sick leave accruals and carryover rules
38. **Hiring Pipeline** - Manage job openings, post positions, track candidates
39. **Employee Visibility** - Full access to employee directory, departments, roles, and leave balances
40. **Holiday Calendar** - Manage company holidays and special dates
41. **Leave Balances** - View and track employee leave balance by type
42. **Account Deactivation** - Deactivate employee accounts when they leave
43. **Audit Trail Access** - View audit log for HR-related changes
44. **Finance Data (Partial)** - View employee payroll figures and salary slips
45. **Permission Limited** - Cannot access CRM leads, projects/tasks (unless also granted), or financial analysis

---

## **DEV MEMBER / DEVELOPER** (Software Development)
46. **Project Access** - View projects assigned to them or in their team; cannot create, edit, or delete
47. **Task Management** - View and comment on assigned tasks; cannot edit, create, or delete tasks
48. **Subtask Viewing** - View subtasks within projects; cannot manage them
49. **Time Logging** - Log work hours on projects and tasks via time entry feature
50. **Task Commenting** - Add comments and reply to comments on assigned tasks (no pricing visible)
51. **Deadline Tracking** - See task deadlines and project timelines
52. **Team Collaboration** - View team members assigned to projects; see project descriptions and status
53. **My Leave Requests** - Submit leave requests; view personal leave balance and history
54. **My Salary Info** - View personal salary slip and payroll information
55. **My Profile** - Edit personal details and change own password
56. **Notification Alerts** - Receive notifications for task assignments and leave approvals/rejections
57. **Permission Limited** - Cannot access pricing data, financial information, or employee records

---

## **EMPLOYEE** (General Employee)
58. **My Profile Access** - View own employee information and change password
59. **My Leave Requests** - Submit leave requests; view leave balance and request history
60. **Leave Approval Status** - Receive notifications when leave is approved or rejected
61. **My Salary Slip** - View personal salary slip and payroll information
62. **Time Entries** - Log work hours on assigned tasks and projects
63. **Notification Bell** - View and read notifications about own account activities
64. **Read-Only Dashboard** - View company dashboard with limited visibility (no financial data)
65. **Me Screen** - Access personal profile, latest salary slip, and leave information
66. **Permission Limited** - No access to CRM, projects/tasks, finance, hiring, or employee management

---

## **ALL USERS** (Universal Features)
67. **PKT Timezone** - All timestamps displayed in Pakistan Standard Time (UTC+05:00)
68. **Currency Toggle** - Switch between USD and PKR for applicable modules (Dashboard, Reports)
69. **Search Functionality** - Global search across leads, projects, employees, and openings
70. **Dark Mode Support** - Light/dark theme toggle based on system preference
71. **Responsive Design** - Full functionality on desktop, tablet, and mobile devices
72. **Notifications** - Real-time notification system for relevant events
73. **Export Capability** - Download reports and data in Excel/PDF format (where permitted)
74. **Session Management** - Secure login with JWT tokens; automatic logout on inactivity
75. **Audit Trail** - Personal actions logged for compliance and transparency (accessible to owner/HR)

