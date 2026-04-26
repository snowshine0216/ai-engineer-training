from app.domain.jobs import JobStatus
from app.services.job_repository import JobRecord, JsonJobRepository


def test_json_job_repository_get_raises_when_record_missing(tmp_path):
    import pytest
    repo = JsonJobRepository(tmp_path / "jobs")

    with pytest.raises(FileNotFoundError):
        repo.get("nonexistent-job")


def test_json_job_repository_list_returns_empty_for_new_directory(tmp_path):
    repo = JsonJobRepository(tmp_path / "jobs")

    assert repo.list() == []


def test_json_job_repository_round_trips_records(tmp_path):
    repo = JsonJobRepository(tmp_path / "jobs")
    record = JobRecord(job_id="job-1", status=JobStatus.CREATED, dataset_id="dataset-1", command=["swift", "sft"], artifact_paths={})

    repo.save(record)

    assert repo.get("job-1") == record
    assert repo.list() == [record]
