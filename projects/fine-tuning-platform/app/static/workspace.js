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
      document.addEventListener('jobs:changed', () => this.refreshJobs());
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

function newJob() {
  return {
    datasetId: '',
    modelPath: '',
    busy: false,
    lastJob: '',
    error: '',
    async submit() {
      if (!this.datasetId || !this.modelPath) return;
      this.busy = true;
      this.error = '';
      this.lastJob = '';
      try {
        const response = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_id: this.datasetId, model_path: this.modelPath }),
        });
        const body = await response.json();
        if (response.ok) {
          this.lastJob = `Created ${body.job_id} (${body.status})`;
          document.dispatchEvent(new CustomEvent('jobs:changed'));
        } else {
          this.error = body.detail ?? 'Failed to create job';
        }
      } catch (err) {
        this.error = String(err);
      } finally {
        this.busy = false;
      }
    },
  };
}

function predict() {
  return {
    prompt: '',
    selected: [],
    results: [],
    busy: false,
    _summary: { agreement: 0, majority: null },

    bind() {
      document.addEventListener('predict:select-job', (event) => {
        const candidate = (this._allOptions() ?? []).find(option => option.kind === 'adapter' && option.id.startsWith(event.detail.jobId + ':'));
        if (candidate && !this.selected.includes(candidate.id)) {
          this.selected = [...this.selected, candidate.id];
        }
      });
    },

    _allOptions() {
      const root = Alpine.$data(this.$root);
      const base = (root?.baseModels ?? []).map(model => ({ id: model.path, label: model.name, kind: 'base' }));
      const arts = (root?.artifacts ?? []).map(artifact => ({ id: artifact.artifact_id, label: artifact.label, kind: artifact.kind }));
      return [...base, ...arts];
    },
    selectedChips() {
      const lookup = new Map(this._allOptions().map(option => [option.id, option]));
      return this.selected.map(id => lookup.get(id)).filter(Boolean);
    },
    availableOptions() {
      const taken = new Set(this.selected);
      return this._allOptions().filter(option => !taken.has(option.id));
    },
    toggleModel(id) {
      if (!id) return;
      this.selected = this.selected.includes(id) ? this.selected.filter(value => value !== id) : [...this.selected, id];
    },
    canRun() { return this.prompt.trim().length > 0 && this.selected.length > 0; },

    async run() {
      if (!this.canRun()) return;
      this.busy = true;
      try {
        const lookup = new Map(this._allOptions().map(option => [option.id, option]));
        const specs = this.selected.map(id => {
          const option = lookup.get(id);
          return { kind: option?.kind === 'base' ? 'base' : 'artifact', ref: id };
        });
        const response = await fetch('/api/predict-intent/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: this.prompt, model_specs: specs }),
        });
        const body = await response.json();
        this.results = body.results ?? [];
        this._summary = body.summary ?? { agreement: 0, majority: null };
      } finally {
        this.busy = false;
      }
    },
    isMinority(result) {
      return this._summary?.majority && result.intent && result.intent !== this._summary.majority;
    },
    shortLabel(modelId) {
      if (modelId.includes(':')) return modelId.split(':')[0].slice(4, 12) + ' · ' + modelId.split(':')[1];
      return modelId.split('/').slice(-1)[0];
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
