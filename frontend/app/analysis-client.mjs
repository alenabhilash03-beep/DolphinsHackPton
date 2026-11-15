export function createAnalysisWorker(){return new Worker(new URL('./analysis-worker.js',import.meta.url))}
