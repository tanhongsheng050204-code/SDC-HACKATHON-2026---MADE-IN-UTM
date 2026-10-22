"""Request bodies, with the validation rules from docs/05-BACKEND_SCHEMA.md."""

import datetime as dt
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


class InterviewTurn(BaseModel):
    question: str = Field(min_length=1, max_length=400)
    answer: str = Field(min_length=1, max_length=2000)


class InterviewRequest(BaseModel):
    profile_id: str = Field(min_length=1, max_length=64)
    role_id: str = Field(min_length=1, max_length=80)
    turns: list[InterviewTurn] = Field(default_factory=list, max_length=5)
    language: Literal["en", "ms", "zh"] = "en"


class PlanRequest(BaseModel):
    """A target date to reach the destination by, and study hours a week. Either may be cleared."""
    model_config = ConfigDict(extra="forbid")
    target_date: dt.date | None = None
    weekly_hours: int | None = Field(default=None, ge=1, le=40)


class TargetRequest(BaseModel):
    role_id: str | None = Field(default=None, max_length=80)  # null clears the target


class ClaimRequest(BaseModel):
    profile_id: str = Field(min_length=1, max_length=64)
    replace: bool = False


class CheckStart(BaseModel):
    language: Literal["en", "ms", "zh"] = "en"


class CheckAnswers(BaseModel):
    profile_id: str = Field(min_length=1, max_length=64)
    answers: list[int] = Field(min_length=3, max_length=3)


class SurveyAnswer(BaseModel):
    card_id: str = Field(min_length=1, max_length=80)
    answer: Literal["strongly_agree", "agree", "neutral", "disagree", "strongly_disagree", "other",
                    "like", "dislike"]  # like / dislike: the earlier two-button answers
    note: str | None = Field(default=None, max_length=300)
    dims: dict[str, int] | None = None  # an "other" answer's reading, sent only once confirmed

    @field_validator("card_id")
    @classmethod
    def card_exists(cls, value: str) -> str:
        if value not in get_reference().survey_cards:
            raise ValueError(f"Unknown card: {value}")
        return value

    @field_validator("dims")
    @classmethod
    def dims_known(cls, value: dict[str, int] | None) -> dict[str, int] | None:
        known = {d["id"] for d in get_reference().work_dimensions}
        if value and any(d not in known or v not in (1, -1) for d, v in value.items()):
            raise ValueError("Unknown preference dimension")
        return value


class SurveyIn(BaseModel):
    answers: list[SurveyAnswer] = Field(min_length=1, max_length=12)
    language: Literal["en", "ms", "zh"] = "en"

    @field_validator("answers")
    @classmethod
    def one_answer_per_card(cls, value: list[SurveyAnswer]) -> list[SurveyAnswer]:
        if len({a.card_id for a in value}) != len(value):
            raise ValueError("Each card can be answered once")
        return value


class InterpretRequest(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    language: Literal["en", "ms", "zh"] = "en"


class CardRequest(BaseModel):
    role_id: str = Field(min_length=1, max_length=80)


class ReviewDecision(BaseModel):
    """An admin's decision on a new snapshot. The name is stored with the snapshot."""
    reviewer: str = Field(min_length=2, max_length=60)
    reason: str | None = Field(default=None, max_length=500)


class EvidenceDecision(ReviewDecision):
    """An admin's decision on one role's skill evidence, with the citations and added skills unticked."""
    drop_sources: list[str] = Field(default_factory=list, max_length=200)  # page URLs, or "URL#skill_id"
    drop_added: list[str] = Field(default_factory=list, max_length=50)


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
    experience_years: int | None = Field(default=None, ge=0, le=60)
    # The person's situation, not a demographic: it changes what Laluan shows first.
    audience: Literal["worker", "graduate", "switcher"] | None = None

    @model_validator(mode="after")
    def working_needs_a_role(self):
        if self.audience in ("worker", "switcher") and not self.current_role_id:
            raise ValueError("Choose your current role, so we can show what carries over")
        return self

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



class LiveSearchRequest(BaseModel):
    profile_id: str = Field(min_length=1, max_length=64)


FEEDBACK_REASONS = ("clear", "useful", "wrong", "unclear", "not_relevant", "other")


class FeedbackIn(BaseModel):
    """"Was this helpful?" on role advice or a coach answer. No profile ID is sent or stored."""
    model_config = ConfigDict(extra="forbid")
    target: Literal["role_advice", "coach"]
    subject: str | None = Field(default=None, max_length=80)  # the role, for role advice
    helpful: bool
    reason: Literal[FEEDBACK_REASONS] | None = None  # type: ignore[valid-type]
    note: str | None = Field(default=None, max_length=500)
    language: Literal["en", "ms", "zh"] | None = None


class ProblemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str = Field(min_length=3, max_length=1000)
    screen: str | None = Field(default=None, max_length=40, pattern=r"^[a-z-]*$")
    language: Literal["en", "ms", "zh"] | None = None


USAGE_EVENTS_FROM_APP = ("onboarding_started", "app_installed")


class UsageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event: Literal[USAGE_EVENTS_FROM_APP]  # type: ignore[valid-type]


EMAIL_STATES = ("anywhere", "johor", "kedah", "kelantan", "melaka", "negeri_sembilan", "pahang", "perak", "perlis",
                "pulau_pinang", "sabah", "sarawak", "selangor", "terengganu", "kuala_lumpur", "labuan", "putrajaya")


class EmailSettingsIn(BaseModel):
    """"Email me" (weekly digest) and job alerts. Turning both off deletes the stored address."""
    model_config = ConfigDict(extra="forbid")
    digest: bool
    alerts: Literal["off", "weekly", "instant"] = "off"
    state: Literal[EMAIL_STATES] | None = None  # type: ignore[valid-type]
    language: Literal["en", "ms", "zh"] = "en"

    @model_validator(mode="after")
    def weekly_needs_digest(self):
        if self.alerts == "weekly" and not self.digest:
            raise ValueError("Job ads in the weekly email need the weekly email turned on")
        return self


class CounsellorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=80)
    organisation: str = Field(min_length=2, max_length=120)  # the school, college or university


class CounsellorDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    approve: bool
    decided_by: str = Field(min_length=2, max_length=80)


class ClassIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=80)


class JoinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=6, max_length=12)
    profile_id: str = Field(min_length=1, max_length=64)


class DecisionReasonsIn(BaseModel):
    """Why the person chose their destination: codes from app.services.decisions.REASONS only."""
    model_config = ConfigDict(extra="forbid")
    reasons: list[str] = Field(default_factory=list, max_length=6)


class ActionIn(BaseModel):
    """A counsellor's proposal after a check-in. Structured only: no free-text notes are stored."""
    model_config = ConfigDict(extra="forbid")
    kind: str = Field(min_length=1, max_length=20)
    value: str | None = Field(default=None, max_length=80)


class ActionAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answer: Literal["accept", "decline", "done"]


APPLICATION_STATUSES = ("saved", "applied", "interview", "offer", "not_this_time")


class ApplicationIn(BaseModel):
    """A job the person saved or applied for. No CV or documents; the note is scrubbed of contact details."""
    model_config = ConfigDict(extra="forbid")
    role_id: str | None = Field(default=None, max_length=80)
    title: str = Field(min_length=1, max_length=160)
    employer: str | None = Field(default=None, max_length=160)
    url: str | None = Field(default=None, max_length=500)
    status: Literal["saved", "applied", "interview", "offer", "not_this_time"] = "saved"
    interview_date: dt.date | None = None
    note: str | None = Field(default=None, max_length=300)

    @field_validator("url")
    @classmethod
    def _https_link(cls, v: str | None) -> str | None:
        if v and not re.match(r"^https?://", v.strip()):
            raise ValueError("The link must start with http:// or https://")
        return v.strip() if v else None


class ApplicationPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=160)
    employer: str | None = Field(default=None, max_length=160)
    url: str | None = Field(default=None, max_length=500)
    status: Literal["saved", "applied", "interview", "offer", "not_this_time"] | None = None
    interview_date: dt.date | None = None
    note: str | None = Field(default=None, max_length=300)

    @field_validator("url")
    @classmethod
    def _https_link(cls, v: str | None) -> str | None:
        return ApplicationIn._https_link(v)

