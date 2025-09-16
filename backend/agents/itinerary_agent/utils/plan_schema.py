from __future__ import annotations
from typing import List, Optional, Union
from pydantic import BaseModel, Field, ConfigDict

class MealItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    title: str
    description: str = ""
    is_meal: bool = Field(default=True, alias="__isMeal")

class PlaceItem(BaseModel):
    id: str
    title: str
    photos: List[str] = []
    description: str = ""
    reviews: List[str] = []
    rating: Optional[str] = None

Item = Union[MealItem, PlaceItem]

class DayStory(BaseModel):
    id: str
    title: str
    items: List[Item]

class SuggestedPlace(BaseModel):
    id: str
    title: str
    photos: List[str] = []
    description: str = ""
    reviews: List[str] = []
    rating: Optional[str] = None

class TripPlan(BaseModel):
    storyItinerary: List[DayStory]
    suggestedPlaces: List[SuggestedPlace] = []
    hiddenGems: List[SuggestedPlace] = []
