from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Fine-Tuning Platform", version="0.1.0")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "fine-tuning-platform"}

    return app


app = create_app()
