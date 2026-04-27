function workspace() {
  return {
    jobs: [],
    datasets: [],
    artifacts: [],
    baseModels: [],
    predictExpanded: false,
    _pollHandle: null,

    async bootstrap() {
      await Promise.all([this.refreshJobs(), this.refreshDatasets(), this.refreshArtifacts(), this.refreshBaseModels()]);
      this._startPolling();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this._stopPolling();
        } else {
          this.refreshJobs();
          this._startPolling();
        }
      });
    },
    _startPolling() {
      if (this._pollHandle !== null) return;
      this._pollHandle = window.setInterval(() => this.refreshJobs(), 5000);
    },
    _stopPolling() {
      if (this._pollHandle === null) return;
      window.clearInterval(this._pollHandle);
      this._pollHandle = null;
    },

    async refreshJobs() {
      const response = await fetch('/api/jobs');
      const body = await response.json();
      this.jobs = body.jobs ?? [];
    },
    async refreshDatasets() {
      const response = await fetch('/api/datasets');
      const body = await response.json();
      this.datasets = body.datasets ?? [];
    },
    async refreshArtifacts() {
      const response = await fetch('/api/artifacts');
      const body = await response.json();
      this.artifacts = body.artifacts ?? [];
    },
    async refreshBaseModels() {
      const response = await fetch('/api/models/base');
      const body = await response.json();
      this.baseModels = body.models ?? [];
    },
    runningCount() {
      return this.jobs.filter(job => job.status === 'running').length;
    },
    openPredictForJob(job) {
      this.predictExpanded = true;
      document.dispatchEvent(new CustomEvent('predict:select-job', { detail: { jobId: job.job_id } }));
    },
  };
}
