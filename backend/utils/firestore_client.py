from google.cloud import firestore
import os
from dotenv import load_dotenv

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
        from google.cloud.firestore_v1 import FieldFilter

        docs = self.db.collection("travel")\
            .where("from", "==", from_city)\
            .where(filter=FieldFilter("to", "==", to_city))\
            .where(filter=FieldFilter("depart_date", "==", depart_date)).stream()

        return [doc.to_dict() for doc in docs]

    def get_accommodation(self, city: str):
        """
        Fetch accommodation options from Firestore based on city.
        """
        docs = self.db.collection("accommodation")\
            .where("city", "==", city).stream()
