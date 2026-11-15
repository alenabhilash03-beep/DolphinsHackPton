export const environments={
 Home:{path:'/',label:'Home',glyph:'desk',description:'Choose a research environment.'},
 Workbench:{path:'/workspace',label:'Simulation workspace',glyph:'experiment',description:'Design PK/PD, antibody-binding, or combined experiments. Compare exposure, response, and target engagement.'},
 Overview:{path:'/desk',label:'Research desk',glyph:'desk',description:'Open experiments, evidence, notes, and research tools.'},
 Experiments:{path:'/experiments',label:'Experiments',glyph:'experiment',description:'Create, reopen, and compare saved experiments.'},
 'Paper library':{path:'/library',label:'Paper library',glyph:'papers',description:'Search biomedical literature, save references, and keep relevant PDFs.'},
 'Research notes':{path:'/notebook',label:'Research notes',glyph:'notes',description:'Record observations, assumptions, and follow-up experiments.'},
 Exports:{path:'/exports',label:'Results and exports',glyph:'exports',description:'Take reports, figures, and numerical results into your next stage of research.'},
 Community:{path:'/community',label:'Community',glyph:'community',description:'Read experiments other researchers have shared, each with a cited AI summary.'},
 Account:{path:'/account',label:'Account',glyph:'document',description:'Your research profile and access settings.'}
};
export function normalizePath(path){return (String(path).split(/[?#]/)[0].replace(/\/+$/,'')||'/')}
export function sharedIdForPath(path){const match=/^\/shared\/(shr-[a-f0-9]{32})$/.exec(normalizePath(path));return match?match[1]:null}
export function viewForPath(path){const clean=normalizePath(path);if(sharedIdForPath(clean))return 'Community';return Object.keys(environments).find(v=>environments[v].path===clean)||'Home'}
export function pathForView(view){return environments[view]?.path||'/'}
