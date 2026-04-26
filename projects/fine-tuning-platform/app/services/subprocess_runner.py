from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import subprocess

from app.domain.swift_commands import CommandSpec


@dataclass(frozen=True)
class CommandResult:
    exit_code: int
    log_path: Path


def run_command(command: CommandSpec, log_path: Path, cwd: Path) -> CommandResult:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, **command.env}
    with log_path.open("w", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            command.argv,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        if process.stdout is None:
            raise RuntimeError("subprocess stdout is None — stdout=PIPE was not honoured")
        try:
            for line in process.stdout:
                log_file.write(line)
                log_file.flush()
            exit_code = process.wait()
        except Exception:
            process.kill()
            process.wait()
            raise
    return CommandResult(exit_code=exit_code, log_path=log_path)
