from app.domain.swift_commands import CommandSpec
from app.services.subprocess_runner import run_command


def test_run_command_writes_stdout_and_returns_exit_code(tmp_path):
    log_path = tmp_path / "logs" / "job.log"
    command = CommandSpec(argv=["python", "-c", "print('hello')"], env={})

    result = run_command(command, log_path=log_path, cwd=tmp_path)

    assert result.exit_code == 0
    assert result.log_path == log_path
    assert "hello" in log_path.read_text(encoding="utf-8")


def test_run_command_returns_non_zero_exit_code_on_failure(tmp_path):
    log_path = tmp_path / "logs" / "job.log"
    command = CommandSpec(argv=["python", "-c", "raise SystemExit(1)"], env={})

    result = run_command(command, log_path=log_path, cwd=tmp_path)

    assert result.exit_code == 1
    assert result.log_path == log_path
