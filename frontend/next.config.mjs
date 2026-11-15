export default phase=>({distDir:phase==='phase-development-server'?'.next-local-dev':'.next',trailingSlash:false,images:{unoptimized:true},outputFileTracingRoot:process.cwd()});
