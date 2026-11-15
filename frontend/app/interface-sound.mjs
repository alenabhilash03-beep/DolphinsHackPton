// Soft, low-mid mechanical clack feedback with a muted high end. No audio is created until a user activates a control.
let context=null,noise=null,idleTimer=null,lastClick=-Infinity;
const profiles={navigate:{duration:.038,frequency:1050,q:1.4,level:.037},toggle:{duration:.042,frequency:740,q:1.2,level:.031},action:{duration:.034,frequency:920,q:1.5,level:.034}};
export async function playControlClick(kind='action'){
 const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return false;
 const now=globalThis.performance?.now?.()??Date.now();if(now-lastClick<35)return false;lastClick=now;
 try{
  if(!context||context.state==='closed'){context=new Audio();noise=null}
  const ctx=context;if(ctx.state==='suspended')await ctx.resume();
  if(!noise){noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.05),ctx.sampleRate);const values=noise.getChannelData(0);let seed=73421;for(let i=0;i<values.length;i++){seed=(seed*16807)%2147483647;values[i]=(seed/2147483647)*2-1}}
  const p=profiles[kind]||profiles.action,t=ctx.currentTime;
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),soften=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=noise;
  filter.type='bandpass';filter.frequency.setValueAtTime(p.frequency,t);filter.Q.setValueAtTime(p.q,t);soften.type='lowpass';soften.frequency.setValueAtTime(1900,t);soften.Q.setValueAtTime(.55,t);
  gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(p.level,t+.003);gain.gain.exponentialRampToValueAtTime(p.level*.18,t+.018);gain.gain.exponentialRampToValueAtTime(.0001,t+p.duration);
  source.connect(filter);filter.connect(soften);soften.connect(gain);gain.connect(ctx.destination);source.start(t);source.stop(t+p.duration+.004);
  source.onended=()=>{try{source.disconnect();filter.disconnect();soften.disconnect();gain.disconnect()}catch{}};
  clearTimeout(idleTimer);idleTimer=setTimeout(()=>{if(ctx.state==='running')ctx.suspend().catch(()=>{})},1500);
  return true;
 }catch{return false}
}
export function stopControlClicks(){clearTimeout(idleTimer);if(context&&context.state==='running')context.suspend().catch(()=>{});lastClick=-Infinity}
