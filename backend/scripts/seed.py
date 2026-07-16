"""
Seed script to populate the database with sample leads for development.
Usage: python -m scripts.seed
"""
import asyncio
import uuid
from datetime import date, timedelta, datetime

from app.core.database import async_session_factory, engine, Base
from app.models.lead import Lead
from app.models.lead_activity import LeadActivity


SAMPLE_LEADS = [
    {
        "company_name": "Acme Corp",
        "client_contact_name": "John Smith",
        "assigned_rep": "Alice Johnson",
        "source": "Website",
        "medium": "Organic",
        "value": 50000.0,
        "stage": "New",
        "description": "Interested in enterprise software suite.",
        "date_received": date.today() - timedelta(days=2),
        "expected_closure_date": date.today() + timedelta(days=30),
        "follow_up_date": date.today() + timedelta(days=5),
    },
    {
        "company_name": "Globex Inc",
        "client_contact_name": "Sarah Connor",
        "assigned_rep": "Bob Williams",
        "source": "Referral",
        "medium": "Word of Mouth",
        "value": 120000.0,
        "stage": "Contacted",
        "description": "Referred by existing client. Needs custom CRM integration.",
        "date_received": date.today() - timedelta(days=10),
        "expected_closure_date": date.today() + timedelta(days=45),
        "follow_up_date": date.today() + timedelta(days=3),
    },
    {
        "company_name": "Initech",
        "client_contact_name": "Michael Bolton",
        "assigned_rep": "Charlie Davis",
        "source": "LinkedIn",
        "medium": "Social",
        "value": 75000.0,
        "stage": "Proposal",
        "description": "Sent proposal for workflow automation platform.",
        "date_received": date.today() - timedelta(days=20),
        "expected_closure_date": date.today() + timedelta(days=15),
    },
    {
        "company_name": "Umbrella LLC",
        "client_contact_name": "Jill Valentine",
        "assigned_rep": "Alice Johnson",
        "source": "Conference",
        "medium": "Event",
        "value": 200000.0,
        "stage": "Negotiation",
        "description": "Negotiating terms for full digital transformation.",
        "date_received": date.today() - timedelta(days=45),
        "expected_closure_date": date.today() + timedelta(days=10),
        "follow_up_date": date.today() - timedelta(days=2),
    },
    {
        "company_name": "Stark Industries",
        "client_contact_name": "Tony Stark",
        "assigned_rep": "Bob Williams",
        "source": "Referral",
        "medium": "Word of Mouth",
        "value": 500000.0,
        "stage": "Won",
        "description": "Closed deal for AI-powered analytics platform.",
        "date_received": date.today() - timedelta(days=90),
        "expected_closure_date": date.today() - timedelta(days=10),
        "actual_closure_date": date.today() - timedelta(days=5),
        "scope_document_url": "/api/storage/sample_scope.pdf",
        "signed_contract_url": "/api/storage/sample_contract.pdf",
        "is_locked_revenue": True,
    },
    {
        "company_name": "Oscorp Industries",
        "client_contact_name": "Norman Osborn",
        "assigned_rep": "Diana Prince",
        "source": "Website",
        "medium": "PPC",
        "value": 30000.0,
        "stage": "New",
        "description": "Filled contact form for consultation.",
        "date_received": date.today() - timedelta(days=1),
        "expected_closure_date": date.today() + timedelta(days=60),
    },
    {
        "company_name": "Wayne Enterprises",
        "client_contact_name": "Bruce Wayne",
        "assigned_rep": "Charlie Davis",
        "source": "Conference",
        "medium": "Event",
        "value": 1000000.0,
        "stage": "Proposal",
        "description": "Large-scale proposal for city infrastructure management.",
        "date_received": date.today() - timedelta(days=30),
        "expected_closure_date": date.today() + timedelta(days=60),
        "follow_up_date": date.today() - timedelta(days=1),
    },
    {
        "company_name": "Cyberdyne Systems",
        "client_contact_name": "Miles Dyson",
        "assigned_rep": "Alice Johnson",
        "source": "LinkedIn",
        "medium": "Social",
        "value": 150000.0,
        "stage": "Lost",
        "description": "Chose competitor solution.",
        "date_received": date.today() - timedelta(days=60),
        "expected_closure_date": date.today() - timedelta(days=5),
        "actual_closure_date": date.today() - timedelta(days=3),
    },
]


SAMPLE_ACTIVITIES = [
    {"type": "comment", "note": "Initial call went well. Interested in demo."},
    {"type": "comment", "note": "Sent follow-up email with pricing."},
    {"type": "comment", "note": "Scheduled product demo for next week."},
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as session:
        for lead_data in SAMPLE_LEADS:
            lead = Lead(
                id=str(uuid.uuid4()),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                created_by="seed",
                updated_by="seed",
                **lead_data,
            )
            session.add(lead)
            await session.flush()

            activity = LeadActivity(
                id=str(uuid.uuid4()),
                lead_id=lead.id,
                type="create",
                note=f"Lead created via seed data in stage '{lead.stage}'",
                created_by="seed",
            )
            session.add(activity)

        await session.commit()
        print(f"Seeded {len(SAMPLE_LEADS)} leads with activities.")


if __name__ == "__main__":
    asyncio.run(seed())
