"""Pydantic schemas."""

from typing import Annotated

from pydantic import Field


MAX_DATABASE_ID = 2**63 - 1
DatabaseId = Annotated[int, Field(gt=0, le=MAX_DATABASE_ID)]
