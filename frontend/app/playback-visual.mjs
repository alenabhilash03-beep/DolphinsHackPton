/** Presentation interpolation only. Returned sample arrays and reported metrics are untouched. */
export function interpolateSample(times,values,time){
 if(!times.length)return 0;if(time<=times[0])return values[0];const last=times.length-1;if(time>=times[last])return values[last];
 let left=0,right=last;while(left+1<right){const mid=(left+right)>>1;if(times[mid]<=time)left=mid;else right=mid;}
 const span=times[right]-times[left];return span>0?values[left]+(values[right]-values[left])*(time-times[left])/span:values[right];
}
