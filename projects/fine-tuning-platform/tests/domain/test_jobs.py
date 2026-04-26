import pytest

from app.domain.jobs import JobStatus, transition


def test_valid_training_transition():
    assert transition(JobStatus.CREATED, JobStatus.RUNNING) == JobStatus.RUNNING
    assert transition(JobStatus.RUNNING, JobStatus.SUCCEEDED) == JobStatus.SUCCEEDED


def test_failed_is_terminal():
    with pytest.raises(ValueError, match="cannot transition"):
        transition(JobStatus.FAILED, JobStatus.RUNNING)


def test_merge_requires_training_success():
    with pytest.raises(ValueError, match="cannot transition"):
        transition(JobStatus.CREATED, JobStatus.MERGING)
