from app.domain.base_models import BaseModelInfo, scan_base_models


def test_scan_base_models_returns_empty_when_directory_missing(tmp_path):
    assert scan_base_models(tmp_path / "models") == []


def test_scan_base_models_returns_empty_when_directory_empty(tmp_path):
    (tmp_path / "models").mkdir()
    assert scan_base_models(tmp_path / "models") == []


def test_scan_base_models_lists_each_subdirectory(tmp_path):
    (tmp_path / "models" / "Qwen2.5-7B-Instruct").mkdir(parents=True)
    (tmp_path / "models" / "Qwen2.5-1.5B-Instruct").mkdir(parents=True)

    models = scan_base_models(tmp_path / "models")

    names = sorted(model.name for model in models)
    assert names == ["Qwen2.5-1.5B-Instruct", "Qwen2.5-7B-Instruct"]
    for model in models:
        assert model.path.endswith(model.name)


def test_scan_base_models_skips_files_at_root(tmp_path):
    (tmp_path / "models").mkdir()
    (tmp_path / "models" / "README.md").write_text("docs", encoding="utf-8")
    (tmp_path / "models" / "Qwen2.5-7B-Instruct").mkdir()

    models = scan_base_models(tmp_path / "models")

    assert [model.name for model in models] == ["Qwen2.5-7B-Instruct"]
