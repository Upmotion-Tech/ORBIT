from datetime import date
from typing import Optional
from fastapi import HTTPException, status
from app.models.salary_slip import SalarySlip
from app.repositories.salary_slip_repository import SalarySlipRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.notification_repository import NotificationRepository
from app.services.tax_slab_service import TaxSlabService
from app.services.salary_slip_pdf_service import generate_salary_slip_pdf_bytes, safe_salary_slip_filename
from app.core.time import now_pkt

class SalarySlipService:
    def __init__(
        self,
        slip_repo: SalarySlipRepository,
        notification_repo: Optional[NotificationRepository] = None,
        tax_slab_service: Optional[TaxSlabService] = None,
        employee_repo: Optional[EmployeeRepository] = None,
    ):
        self.slip_repo = slip_repo
        self.notification_repo = notification_repo
        self.tax_slab_service = tax_slab_service
        self.employee_repo = employee_repo

    async def _calculate_tax(self, gross_salary: float) -> float:
        if not self.tax_slab_service:
            return 0.0
        return await self.tax_slab_service.calculate_monthly_income_tax(gross_salary)

    async def list_slips(self, **kwargs) -> list[SalarySlip]:
        return await self.slip_repo.find_all(**kwargs)

    async def list_my_slips(self, employee_id: str, limit: int = 24) -> list[SalarySlip]:
        return await self.slip_repo.find_all(employee_id=employee_id, sort_by="month", sort_dir="desc", page_size=limit)

    async def get_slip(self, slip_id: str) -> Optional[SalarySlip]:
        return await self.slip_repo.find_by_id(slip_id)

    async def get_or_create_slip(self, employee_id: str, month: str, base_salary: float, user: str = "anonymous") -> SalarySlip:
        slip = await self.slip_repo.find_by_employee_and_month(employee_id, month)
        current_month = now_pkt().date().strftime("%Y-%m")
        is_current_or_future = month >= current_month

        if not slip:
            # First time this employee/month's slip is being created. If
            # `month` is already in the past (e.g. Payroll's month picker is
            # browsed back to a month nobody has opened before), there is no
            # record of what salary or tax slabs were actually in effect
            # back then — auto-calculating Income Tax from *today's* slab
            # table would itself be exactly the kind of retroactive change
            # that must never happen, just arriving as a wrong number
            # instead of a changed one. Only a current/future month gets a
            # live auto-calculated figure; a past month starts at 0 and
            # waits for the Owner to fill in the real historical figure.
            tax = await self._calculate_tax(base_salary) if is_current_or_future else 0.0
            data = {
                "employee_id": employee_id,
                "month": month,
                "gross_salary": base_salary,
                "tax": tax,
                "tax_is_manual": False,
                "other_deductions": 0.0,
                "bonus": 0.0,
                "allowances": 0.0,
                "net_salary": base_salary - tax,
                "payment_status": "Unpaid",
                "notes": "",
                "created_by_id": user,
                "updated_by_id": user
            }
            slip = await self.slip_repo.create(data)
            return slip

        # A slip already exists for this employee/month. Once it's Paid, or
        # once the month itself has passed, it's a historical record and
        # stays locked — but an Unpaid slip for the CURRENT or a FUTURE
        # month should keep tracking the employee's current salary and
        # current Income Tax, since it was only ever a snapshot taken the
        # first time this month's payroll page happened to be opened, not a
        # deliberate finalized figure. Editing an employee's salary in HR,
        # or editing the tax slab table in Setup, must never reach back and
        # silently change a month that's already passed — that was the
        # actual bug here: gross_salary had no month check at all, so a
        # later salary change (or a slip being freshly viewed for a past
        # month after slabs changed) could still rewrite history. An
        # Owner-overridden (tax_is_manual) slip is separately exempted from
        # auto-recompute regardless of month — that's the whole point of
        # the override.
        if slip.payment_status != "Paid" and is_current_or_future:
            new_gross = base_salary
            new_tax = slip.tax if slip.tax_is_manual else await self._calculate_tax(new_gross)
            if new_gross != slip.gross_salary or new_tax != slip.tax:
                data = {
                    "gross_salary": new_gross,
                    "tax": new_tax,
                    "net_salary": new_gross + slip.allowances + slip.bonus - new_tax - slip.other_deductions,
                    "updated_by_id": user,
                }
                slip = await self.slip_repo.update(slip, data)
        return slip

    async def update_slip(self, slip_id: str, data: dict, user: str = "anonymous", is_owner: bool = False) -> SalarySlip:
        slip = await self.slip_repo.find_by_id(slip_id)
        if not slip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary slip not found.")

        # Gross salary normally always tracks the employee's actual set
        # salary (see get_or_create_slip, which keeps it in sync for as long
        # as the slip is Unpaid AND its month is current/future) — editing it
        # here would either be redundant (current/future month: still
        # auto-synced on every view) or a retroactive rewrite of history
        # (get_or_create_slip must never reach back into a past month). The
        # one safe exception: a slip whose month has already passed is never
        # touched by that resync again regardless of what happens later, so
        # an Owner correcting it here can't collide with anything — this is
        # the only way to enter an accurate historical figure for a month
        # this system never had a real salary recorded for (e.g. a
        # pre-launch month HR meant to fill in later). Anyone who isn't an
        # Owner still can't touch it, current/future or past.
        current_month = now_pkt().date().strftime("%Y-%m")
        is_past_month = slip.month < current_month
        if not (is_owner and is_past_month):
            data.pop("gross_salary", None)

        # Income Tax is auto-calculated for everyone by default (same
        # get_or_create_slip resync). Only an Owner may manually pin an
        # individual slip's tax to a specific figure — anyone else's
        # supplied value is silently dropped, matching the gross_salary
        # convention above, since the frontend never even shows them an
        # editable field for it. A manual edit here only ever touches this
        # one slip/employee/month — it never changes the tax slab table or
        # any other employee's figure.
        #
        # The frontend's save-any-field handler resends the *current* tax
        # value on every save regardless of which field the user actually
        # edited (see setSalarySlipFieldLive in finance/page.tsx) — only
        # flip tax_is_manual when the incoming value genuinely differs from
        # what's stored, so editing bonus/notes/etc. doesn't silently freeze
        # this slip's tax out of auto-calculation as a side effect.
        if "tax" in data:
            if is_owner and data["tax"] != slip.tax:
                data["tax_is_manual"] = True
            elif not is_owner:
                data.pop("tax", None)

        # Recompute net salary based on update variables or existing values
        gross = data.get("gross_salary", slip.gross_salary)
        tax = data.get("tax", slip.tax)
        deductions = data.get("other_deductions", slip.other_deductions)
        bonus = data.get("bonus", slip.bonus)
        allowances = data.get("allowances", slip.allowances)

        data["net_salary"] = gross + allowances + bonus - tax - deductions
        data["updated_by_id"] = user
        
        old_status = slip.payment_status
        new_status = data.get("payment_status", old_status)
        if new_status == "Paid" and old_status != "Paid" and "payment_date" not in data:
            data["payment_date"] = now_pkt().date()

        updated_slip = await self.slip_repo.update(slip, data)

        # Trigger notifications — only the employee whose slip this is needs
        # one. This used to also broadcast a duplicate "Salary for X has been
        # marked as Paid" notification to literal "finance"/"owner" sentinel
        # user_ids on every single slip — harmless for one employee, but
        # "Mark All as Paid" calls update_slip once per employee in the
        # month, so whoever holds the Finance/Owner account got the entire
        # payroll run's worth of every *other* employee's individual payment
        # notification flooding their own feed. Whoever ran the bulk action
        # already sees a real-time summary toast for it (see
        # mark_all_paid_for_month/its router) — they don't need a second,
        # much noisier copy of it stored per-employee too.
        if old_status != new_status and new_status == "Paid" and self.notification_repo:
            emp = updated_slip.employee
            if emp:
                await self.notification_repo.create(
                    user_id=emp.id,
                    notif_type="Salary Paid",
                    title="Salary Disbursed",
                    message=f"Your salary slip for {updated_slip.month} has been marked as Paid."
                )

        return updated_slip

    async def reset_tax_to_auto(self, slip_id: str, user: str = "anonymous") -> SalarySlip:
        """Owner-only escape hatch back out of a manual tax override —
        un-pins tax_is_manual and immediately recomputes from the slip's
        current gross salary against the active tax slab table."""
        slip = await self.slip_repo.find_by_id(slip_id)
        if not slip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary slip not found.")
        new_tax = await self._calculate_tax(slip.gross_salary)
        data = {
            "tax": new_tax,
            "tax_is_manual": False,
            "net_salary": slip.gross_salary + slip.allowances + slip.bonus - new_tax - slip.other_deductions,
            "updated_by_id": user,
        }
        return await self.slip_repo.update(slip, data)

    def generate_pdf(self, slip: SalarySlip) -> tuple[bytes, str]:
        pdf_bytes = generate_salary_slip_pdf_bytes(slip)
        filename = safe_salary_slip_filename(slip.employee.name if slip.employee else slip.employee_id, slip.month)
        return pdf_bytes, filename

    async def generate_slips_for_month(self, month: str, user: str = "anonymous") -> int:
        """Bulk 'Generate Salary Slips' action (Finance Payroll tab) — ensures
        every active employee has a slip for this month (auto-calculating
        Income Tax the same way viewing the Payroll list already does), then
        notifies each employee their slip is ready. Returns how many
        employees were notified."""
        if not self.employee_repo:
            return 0
        employees = await self.employee_repo.find_all(status_filter="Active", page_size=10000)
        count = 0
        for emp in employees:
            slip = await self.get_or_create_slip(emp.id, month, emp.salary, user=user)
            if self.notification_repo:
                await self.notification_repo.create(
                    user_id=emp.id,
                    notif_type="Salary Slip",
                    title="Salary Slip Ready",
                    message=f"Your salary slip for {slip.month} is ready. Open My Record to view or download it.",
                )
            count += 1
        return count

    async def generate_single_slip(self, slip_id: str, user: str = "anonymous") -> SalarySlip:
        """Same as generate_slips_for_month but for one employee/slip — e.g.
        a new hire added mid-month, or re-notifying just one person without
        spamming everyone else."""
        slip = await self.slip_repo.find_by_id(slip_id)
        if not slip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary slip not found.")
        emp = slip.employee
        if not emp:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found for this slip.")
        slip = await self.get_or_create_slip(emp.id, slip.month, emp.salary, user=user)
        if self.notification_repo:
            await self.notification_repo.create(
                user_id=emp.id,
                notif_type="Salary Slip",
                title="Salary Slip Ready",
                message=f"Your salary slip for {slip.month} is ready. Open My Record to view or download it.",
            )
        return slip

    async def mark_all_paid_for_month(self, month: str, user: str = "anonymous") -> dict:
        """Bulk 'Mark All as Paid' (Finance Payroll tab) — flips every
        still-Unpaid slip for this month to Paid, reusing update_slip's
        existing per-employee notification + payment_date logic. Only ever
        touches the one month given: each month is its own independent
        SalarySlip row (created Unpaid by default), so marking July Paid has
        no effect on August — the next month always starts Unpaid on its
        own, nothing to explicitly "reset." Returns the count plus total net
        pay disbursed, so the UI can show a real "X employees, Rs. Y total"
        confirmation instead of just a bare number."""
        slips = await self.slip_repo.find_all(month=month, page_size=10000)
        count = 0
        total_net = 0.0
        for slip in slips:
            if slip.payment_status != "Paid":
                await self.update_slip(slip.id, {"payment_status": "Paid"}, user=user)
                total_net += slip.net_salary
                count += 1
        return {"count": count, "total_net": total_net}

    async def delete_slip(self, slip_id: str) -> None:
        slip = await self.slip_repo.find_by_id(slip_id)
        if not slip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary slip not found.")
        await self.slip_repo.soft_delete(slip)
