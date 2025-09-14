from google.cloud import firestore
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
try:
    # Python 3.9+ standard library
    from zoneinfo import ZoneInfo  # type: ignore
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore
from google.api_core.exceptions import FailedPrecondition
from google.cloud.firestore_v1 import FieldFilter

class FirestoreClient:
    def __init__(self, credentials_path: str = None):
        """
        Initialize Firestore client.
        If credentials_path is None, defaults to GOOGLE_APPLICATION_CREDENTIALS env variable.
        """
        load_dotenv()
        if credentials_path:
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path
        self.db = firestore.Client()

    def get_travel_options(self, from_city: str, to_city: str, depart_date: str):
        """
        Fetch travel options from Firestore based on origin, destination, and departure date.
        """
        base = (
            self.db.collection("travel")
            .where(filter=FieldFilter("from", "==", from_city))
            .where(filter=FieldFilter("to", "==", to_city))
        )
        query = base
        # If depart_date is provided as a date string (YYYY-MM-DD), perform a same-day range query
        # in the desired local timezone (defaults to Asia/Kolkata), then convert to UTC for querying.
        if depart_date:
            try:
                # Parse as YYYY-MM-DD
                day = datetime.fromisoformat(depart_date).date()
                tz_name = os.getenv("TIMEZONE", "Asia/Kolkata")
                if ZoneInfo is not None:
                    local_tz = ZoneInfo(tz_name)
                    start_local = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=local_tz)
                else:
                    # Fallback: assume UTC if zoneinfo unavailable
                    start_local = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=timezone.utc)
                end_local = start_local + timedelta(days=1)
                # Convert to UTC for Firestore timestamp comparisons
                start_utc = start_local.astimezone(timezone.utc)
                end_utc = end_local.astimezone(timezone.utc)
                query = (
                    query
                    .where(filter=FieldFilter("depart_date", ">=", start_utc))
                    .where(filter=FieldFilter("depart_date", "<", end_utc))
                )
            except ValueError:
                # If the provided value isn't a simple date string, fall back to equality and hope types match
                query = query.where("depart_date", "==", depart_date)
        try:
            docs = query.stream()
            return [doc.to_dict() for doc in docs]
        except FailedPrecondition:
            # Missing composite index (from, to, depart_date range). Fallback: query by from/to,
            # then filter client-side by date window to avoid requiring an index.
            try:
                docs = base.stream()
                results = [d.to_dict() for d in docs]
            except Exception:
                return []
            if not depart_date:
                return results
            try:
                day = datetime.fromisoformat(depart_date).date()
                tz_name = os.getenv("TIMEZONE", "Asia/Kolkata")
                if ZoneInfo is not None:
                    local_tz = ZoneInfo(tz_name)
                else:
                    local_tz = timezone.utc
                start_local = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=local_tz)
                end_local = start_local + timedelta(days=1)
                start_utc = start_local.astimezone(timezone.utc)
                end_utc = end_local.astimezone(timezone.utc)
            except Exception:
                # If date parsing fails, return unfiltered results
                return results
            # Filter client-side by UTC window
            filtered = []
            for item in results:
                ts = item.get("depart_date")
                if isinstance(ts, datetime):
                    # Ensure tz-aware UTC for comparison
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    else:
                        ts = ts.astimezone(timezone.utc)
                    if start_utc <= ts < end_utc:
                        filtered.append(item)
                else:
                    # If not a datetime (unexpected), keep item only when no date provided
                    pass
            return filtered

    def get_accommodation(self, city: str):
        """
        Fetch accommodation options from Firestore based on city.
        """
        docs = (
            self.db.collection("accommodation")
            .where(filter=FieldFilter("city", "==", city))
            .stream()
        )
        return [doc.to_dict() for doc in docs]
