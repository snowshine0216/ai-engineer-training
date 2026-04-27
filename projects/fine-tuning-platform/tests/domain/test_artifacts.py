import json
from datetime import datetime, timezone

from app.domain.artifacts import Artifact, scan_artifacts


def _write_job(jobs_dir, job_id, status="succeeded", dataset_id="dataset-aabbccddeeff"):
    jobs_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "job_id": job_id,
        "status": status,
        "dataset_id": dataset_id,
        "command": ["swift", "sft"],
        "artifact_paths": {},
    }
    (jobs_dir / f"{job_id}.json").write_text(json.dumps(payload), encoding="utf-8")


def test_scan_artifacts_returns_empty_when_no_jobs(tmp_path):
    result = scan_artifacts(
        jobs_dir=tmp_path / "jobs",
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    assert result == []


def test_scan_artifacts_emits_adapter_when_output_dir_exists(tmp_path):
    _write_job(tmp_path / "jobs", "job-aabbccddeeff")
    (tmp_path / "output" / "job-aabbccddeeff").mkdir(parents=True)

    result = scan_artifacts(
        jobs_dir=tmp_path / "jobs",
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    assert len(result) == 1
    artifact = result[0]
    assert artifact.kind == "adapter"
    assert artifact.job_id == "job-aabbccddeeff"
    assert artifact.artifact_id == "job-aabbccddeeff:adapter"
    assert artifact.path.endswith("output/job-aabbccddeeff")
    # ISO 8601 with Z or +00:00
    datetime.fromisoformat(artifact.created_at.replace("Z", "+00:00"))


def test_scan_artifacts_emits_merged_and_quantized_when_dirs_exist(tmp_path):
    _write_job(tmp_path / "jobs", "job-aabbccddeeff")
    (tmp_path / "output" / "job-aabbccddeeff").mkdir(parents=True)
    (tmp_path / "merged_models" / "job-aabbccddeeff").mkdir(parents=True)
    (tmp_path / "quantized_models" / "job-aabbccddeeff-bnb-int4").mkdir(parents=True)

    result = scan_artifacts(
        jobs_dir=tmp_path / "jobs",
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    kinds = sorted(artifact.kind for artifact in result)
    assert kinds == ["adapter", "merged", "quantized"]


def test_scan_artifacts_skips_kinds_whose_dir_is_missing(tmp_path):
    _write_job(tmp_path / "jobs", "job-aabbccddeeff")
    (tmp_path / "merged_models" / "job-aabbccddeeff").mkdir(parents=True)

    result = scan_artifacts(
        jobs_dir=tmp_path / "jobs",
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    assert [artifact.kind for artifact in result] == ["merged"]


def test_scan_artifacts_handles_multiple_jobs_newest_first(tmp_path):
    _write_job(tmp_path / "jobs", "job-aaaaaaaaaaaa")
    _write_job(tmp_path / "jobs", "job-bbbbbbbbbbbb")
    older = tmp_path / "output" / "job-aaaaaaaaaaaa"
    older.mkdir(parents=True)
    newer = tmp_path / "output" / "job-bbbbbbbbbbbb"
    newer.mkdir(parents=True)
    # Force newer mtime on the second dir
    import os, time
    os.utime(older, (time.time() - 100, time.time() - 100))

    result = scan_artifacts(
        jobs_dir=tmp_path / "jobs",
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    assert [artifact.job_id for artifact in result] == ["job-bbbbbbbbbbbb", "job-aaaaaaaaaaaa"]


def test_scan_artifacts_ignores_non_json_files_in_jobs_dir(tmp_path):
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir()
    (jobs_dir / "README.md").write_text("not a job", encoding="utf-8")

    result = scan_artifacts(
        jobs_dir=jobs_dir,
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    assert result == []
