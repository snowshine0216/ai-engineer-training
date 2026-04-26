from enum import StrEnum


class JobStatus(StrEnum):
    CREATED = "created"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    EVALUATING = "evaluating"
    EVALUATED = "evaluated"
    MERGING = "merging"
    MERGED = "merged"
    QUANTIZING = "quantizing"
    QUANTIZED = "quantized"


ALLOWED_TRANSITIONS: dict[JobStatus, set[JobStatus]] = {
    JobStatus.CREATED: {JobStatus.RUNNING, JobStatus.FAILED},
    JobStatus.RUNNING: {JobStatus.SUCCEEDED, JobStatus.FAILED},
    JobStatus.SUCCEEDED: {JobStatus.EVALUATING, JobStatus.MERGING, JobStatus.FAILED},
    JobStatus.EVALUATING: {JobStatus.EVALUATED, JobStatus.FAILED},
    JobStatus.EVALUATED: {JobStatus.MERGING, JobStatus.FAILED},
    JobStatus.MERGING: {JobStatus.MERGED, JobStatus.FAILED},
    JobStatus.MERGED: {JobStatus.EVALUATING, JobStatus.QUANTIZING, JobStatus.FAILED},
    JobStatus.QUANTIZING: {JobStatus.QUANTIZED, JobStatus.FAILED},
    JobStatus.QUANTIZED: {JobStatus.EVALUATING, JobStatus.FAILED},
    JobStatus.FAILED: set(),
}


def transition(current: JobStatus, target: JobStatus) -> JobStatus:
    if target not in ALLOWED_TRANSITIONS[current]:
        raise ValueError(f"cannot transition from {current.value} to {target.value}")
    return target
