"""Request bodies, with the validation rules from docs/05-BACKEND_SCHEMA.md."""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.reference import get_reference

Scenario = Literal["slow", "baseline", "accelerated"]
_CONTACT = re.compile(r"@|\d{6,}")


class SignalIn(BaseModel):
    model_config = ConfigDict(extra="allow")

    role_id: str
    net_growth_pct: float = Field(ge=-100, le=500)
    automation_exposure: float = Field(ge=0, le=1)
    ai_complementarity: float = Field(ge=0, le=1)
    note: str | None = Field(default=None, max_length=500)


class SnapshotIn(BaseModel):
    """An imported snapshot. The ID becomes a file name, so only letters, digits, - and _."""
    model_config = ConfigDict(extra="allow")

    snapshot_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$")
    source: str = Field(min_length=1, max_length=500)
    source_url: str = Field(max_length=500)
    published: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}")
    imported: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}")
    horizon_year: int = Field(ge=2025, le=2100)
    illustrative: bool
    signals: list[SignalIn] = Field(min_length=1, max_length=500)


class ExtractRequest(BaseModel):
    text: str = Field(min_length=50, max_length=20_000)


class CompleteRequest(BaseModel):
    course_id: str = Field(min_length=1, max_length=80)
    done: bool = True


class CoachRequest(BaseModel):
    profile_id: str = Field(min_length=1, max_length=64)
    question: str = Field(min_length=1, max_length=500)
    scenario: Scenario = "baseline"
    role_id: str | None = Field(default=None, max_length=80)


class CardRequest(BaseModel):
    role_id: str = Field(min_length=1, max_length=80)


class WorkforceRequest(BaseModel):
    csv: str = Field(min_length=10, max_length=1_000_000)
    scenario: Scenario = "baseline"


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=1_000)


class IntakeTurnRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list, max_length=20)
    language: str = "en"


class ProfileIn(BaseModel):
    # Fairness: the profile has no age, gender, ethnicity or background fields, and unknown
    # fields are rejected, so recommendations cannot depend on them.
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, max_length=60)
    current_role_id: str | None = None
    skills: list[str] = Field(min_length=1, max_length=60)
    interests: list[int] = Field(default_factory=list, max_length=17)
    experience_years: int | None = Field(default=None, ge=0, le=60)

    @field_validator("display_name")
    @classmethod
    def no_contact_details(cls, value: str | None) -> str | None:
        if value and _CONTACT.search(value):
            raise ValueError("Display name must not contain an email or phone number")
        return value

    @field_validator("current_role_id")
    @classmethod
    def role_exists(cls, value: str | None) -> str | None:
        if value is not None and value not in get_reference().roles:
            raise ValueError(f"Unknown role: {value}")
        return value

    @field_validator("skills")
    @classmethod
    def skills_exist(cls, value: list[str]) -> list[str]:
        known = get_reference().skills
        unknown = [s for s in value if s not in known]
        if unknown:
            raise ValueError(f"Unknown skills: {', '.join(unknown)}")
        return list(dict.fromkeys(value))

    @field_validator("interests")
    @classmethod
    def sdgs_exist(cls, value: list[int]) -> list[int]:
        if any(n < 1 or n > 17 for n in value):
            raise ValueError("Interests must be SDG numbers 1-17")
        return list(dict.fromkeys(value))
