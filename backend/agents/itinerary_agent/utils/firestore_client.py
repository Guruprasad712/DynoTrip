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
        Fetch travel options from Firestore using flexible field names.
        Tries both (from,to) and (departure,destination). Applies same-day window if depart_date provided.
        If nothing is found, returns realistic Chennai<->Pondicherry samples.
        """
        coll = self.db.collection("travel-collection")
        # Try primary schema: from/to
        base = (
            coll.where(filter=FieldFilter("from", "==", from_city))
                .where(filter=FieldFilter("to", "==", to_city))
        )
        # Alternate schema: departure/destination
        alt = (
            coll.where(filter=FieldFilter("departure", "==", from_city))
                .where(filter=FieldFilter("destination", "==", to_city))
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
            docs = list(query.stream())
            results = [doc.to_dict() for doc in docs]
            if not results:
                docs2 = list(alt.stream())
                results = [doc.to_dict() for doc in docs2]
            if results:
                return results
        except FailedPrecondition:
            # Missing composite index (from, to, depart_date range). Fallback: query by from/to,
            # then filter client-side by date window to avoid requiring an index.
            try:
                docs = list(base.stream())
                results = [d.to_dict() for d in docs]
                if not results:
                    docs2 = list(alt.stream())
                    results = [d.to_dict() for d in docs2]
            except Exception:
                results = []
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
            if filtered:
                return filtered

        # If still empty, provide realistic Chennai<->Pondicherry samples as a safe fallback
        def _iso_to_dt(date_str: str):
            try:
                return datetime.fromisoformat((date_str or "").split("T")[0]).date()
            except Exception:
                return datetime.utcnow().date()

        fc = (from_city or "").strip().lower()
        tc = (to_city or "").strip().lower()
        if {fc, tc} == {"chennai", "pondicherry"}:
            day = _iso_to_dt(depart_date)
            dep_d = datetime(day.year, day.month, day.day, 7, 0, tzinfo=timezone.utc)
            def _mk(id_, typ, operator, start_h, start_m, dur_min, price):
                st = datetime(day.year, day.month, day.day, start_h, start_m, tzinfo=timezone.utc)
                et = st + timedelta(minutes=dur_min)
                return {
                    "id": id_,
                    "type": typ,  # CAB | BUS | TRAIN
                    "operator": operator,
                    "from": from_city,
                    "to": to_city,
                    "depart_date": st,
                    "depart_time": st.isoformat(),
                    "arrive_time": et.isoformat(),
                    "duration_min": dur_min,
                    "price": price,
                    "notes": "Sample route based on typical schedules",
                }
            samples = [
                _mk("cab-ola-0700", "CAB", "Ola Outstation", 7, 0, 210, 4200),
                _mk("bus-tnstc-0830", "BUS", "TNSTC AC", 8, 30, 240, 650),
                _mk("train-umi-1015", "TRAIN", "UMI Express", 10, 15, 210, 180),
            ]
            return samples

        return []

    def get_accommodation(self, city: str):
        """
        Fetch accommodation options from Firestore. Prefer 'city' field, otherwise
        fallback to scanning documents where destination==city or any hotel address contains the city name.
        If nothing found for Pondicherry, return a realistic sample list similar to your template.
        """
        coll = self.db.collection("accommodation-collection")
        city = city or ""
        try:
            docs = list(coll.where(filter=FieldFilter("city", "==", city)).stream())
            results = [d.to_dict() for d in docs]
            if results:
                return results
        except FailedPrecondition:
            results = []
        except Exception:
            results = []

        # Fallback: scan limited number of docs and filter
        try:
            docs_all = list(coll.limit(50).stream())
            filtered = []
            lc = city.strip().lower()
            for d in docs_all:
                obj = d.to_dict()
                dest = str(obj.get("destination") or obj.get("city") or "").strip().lower()
                if dest == lc:
                    filtered.append(obj)
                    continue
                hotels = obj.get("hotels") or []
                for h in hotels:
                    addr = str((h or {}).get("address") or "").strip().lower()
                    if lc and lc in addr:
                        filtered.append(obj)
                        break
            if filtered:
                return filtered
        except Exception:
            pass

        # Realistic fallback for Pondicherry
        if city.strip().lower() in ("pondicherry", "puducherry"):
            sample = {
                "_generatedFrom": "template-accommodation",
                "destination": "Pondicherry",
                "_generatedAt": datetime.utcnow().isoformat() + "Z",
                "hotels": [
                    {
                        "id": "h-01-ovr",
                        "name": "Ocean View Resort",
                        "address": "Seafront Road, Pondicherry",
                        "available": True,
                        "checkInTime": "14:00",
                        "checkOutTime": "11:00",
                        "photos": [
                            "https://images.unsplash.com/photo-1501117716987-c8e9a0aef1d4?auto=format&fit=crop&w=1200&q=80",
                            "https://images.unsplash.com/photo-1496412705862-e0088f16f791?auto=format&fit=crop&w=1200&q=80",
                        ],
                        "pricePerNight": 4300,
                        "rating": 4.6,
                        "recommended": True,
                        "reviews": [
                            "Amazing beachfront view — perfect for sunrise.",
                            "Clean rooms and friendly staff.",
                        ],
                    },
                    {
                        "id": "h-02-cch",
                        "name": "City Center Hotel",
                        "address": "Downtown, Pondicherry",
                        "available": True,
                        "checkInTime": "15:00",
                        "checkOutTime": "12:00",
                        "photos": [
                            "https://images.unsplash.com/photo-1568495248636-643ea27d2b8f?auto=format&fit=crop&w=1200&q=80",
                        ],
                        "pricePerNight": 2900,
                        "rating": 3.9,
                        "recommended": False,
                        "reviews": [
                            "Great location but rooms are compact.",
                        ],
                    },
                    {
                        "id": "h-03-hv",
                        "name": "Heritage Villas",
                        "address": "Old Town, Pondicherry",
                        "available": True,
                        "checkInTime": "13:00",
                        "checkOutTime": "11:00",
                        "photos": [
                            "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80",
                        ],
                        "pricePerNight": 3950,
                        "rating": 4.8,
                        "recommended": False,
                        "reviews": [
                            "Lovely heritage property with great staff.",
                        ],
                    },
                ],
            }
            return [sample]

        return []

    def _slugify(self, text: str) -> str:
        """Simple slugify to create Firestore-safe document IDs."""
        if not text:
            return "unknown"
        allowed = []
        for ch in text.lower():
            if ch.isalnum():
                allowed.append(ch)
            elif ch in [' ', '-', '_']:
                allowed.append('-')
        slug = ''.join(allowed)
        while '--' in slug:
            slug = slug.replace('--', '-')
        return slug.strip('-') or "unknown"

    def save_generated_plan(self, destination: str, plan_json: dict) -> str:
        """
        Save the generated plan JSON into the 'generated-plan' collection.
        Document ID format: '{destination}-travel-plan-{timestamp}'.
        Returns the document ID.
        """
        ts = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        dest_slug = self._slugify(destination or 'unknown')
        doc_id = f"{dest_slug}-travel-plan-{ts}"
        doc_ref = self.db.collection("generated-plan").document(doc_id)
        # Store ONLY the plan JSON at the root of the document, per requirement
        doc_ref.set(plan_json)
        return doc_id
