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
      document.addEventListener('datasets:changed', () => this.refreshDatasets());
      document.addEventListener('artifacts:changed', () => this.refreshArtifacts());
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

function upload() {
  return {
    file: null,
    busy: false,
    lastUpload: '',
    issues: [],
    async submit(event) {
      if (!this.file) return;
      this.busy = true;
      this.issues = [];
      this.lastUpload = '';
      const formData = new FormData();
      formData.append('training_dataset', this.file);
      try {
        const response = await fetch('/api/datasets', { method: 'POST', body: formData });
        const body = await response.json();
        if (response.ok) {
          this.lastUpload = `Uploaded ${body.dataset_id} (${body.row_count} rows)`;
          this.file = null;
          event.target.reset();
          document.dispatchEvent(new CustomEvent('datasets:changed'));
        } else {
          this.issues = body.issues ?? [{ row_number: 0, message: 'Upload failed' }];
        }
      } catch (err) {
        this.issues = [{ row_number: 0, message: String(err) }];
      } finally {
        this.busy = false;
      }
    },
  };
}
