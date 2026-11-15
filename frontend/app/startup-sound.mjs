let startupContext=null;
// Original, quiet startup chime. Called only from the entry click.
export async function playStartupSound(){
 const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return false;
 let context;
 try{if(startupContext)startupContext.close().catch(()=>{});context=new Audio();startupContext=context;if(context.state==='suspended')await context.resume();const t=context.currentTime;const master=context.createGain();master.gain.setValueAtTime(.09,t);master.connect(context.destination);
  const notes=[{frequency:220,at:0,level:.46},{frequency:329.6276,at:.12,level:.25},{frequency:440,at:.25,level:.18}];
  for(const n of notes){const oscillator=context.createOscillator();const envelope=context.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(n.frequency,t);envelope.gain.setValueAtTime(0,t+n.at);envelope.gain.linearRampToValueAtTime(n.level,t+n.at+.075);envelope.gain.exponentialRampToValueAtTime(.0001,t+n.at+1.2);oscillator.connect(envelope);envelope.connect(master);oscillator.start(t+n.at);oscillator.stop(t+n.at+1.25)}
  setTimeout(()=>{context.close().catch(()=>{});if(startupContext===context)startupContext=null},1800);return true;
 }catch{if(context)context.close().catch(()=>{});return false}
}

export function stopStartupSound(){if(startupContext){startupContext.close().catch(()=>{});startupContext=null}}
